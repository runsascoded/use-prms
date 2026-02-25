# Fix: debounced `useUrlState` reverts value on unrelated re-renders

## Bug

When `useUrlState` is called with `{ debounce: N }`, the returned value can snap back to the old URL value during the debounce window.

### Reproduction

```tsx
const [position, setPosition] = useUrlState('pos', floatParam(0), { debounce: 300 })
const [unrelated, setUnrelated] = useState(0)

// 1. User drags slider → setPosition(50) called rapidly
// 2. Debounce delays the URL write by 300ms
// 3. During that 300ms, setUnrelated(1) fires (or any other state change)
// 4. Component re-renders
// 5. position snaps back to 0 (the URL still has the old value)
// 6. Slider jumps back to start
```

This makes debounce unusable for sliders, drag interactions, or any high-frequency input in components that have other state.

### Root cause

`useUrlState` derives its return value from the URL (via `useSyncExternalStore`). The `debounce` option delays URL writes, but the returned value still reads from the URL. During the debounce window, the URL has the old value.

The causality tracking (`lastWrittenRef`) is designed to prevent snap-back *after* a write lands, but it fails during the debounce window:

```
setValue(newVal)
  → lastWrittenRef = { encoded: newEncoded, decoded: newVal }
  → debounced writeToUrl scheduled (URL not yet updated)

[unrelated re-render]
  → encoded = URL value (still OLD)
  → lastWrittenRef.encoded (newEncoded) !== encoded (oldEncoded)
  → falls through to param.decode(encoded) → OLD value
  → lastWrittenRef = null  ← clears the tracking!
```

The `else` branch at line 171 clears `lastWrittenRef` because it interprets the mismatch as an "external URL change." But it's not external — it's just the debounce delay.

### The docstring is aspirational

Line 17 says:
```
* State updates immediately, but URL updates are debounced.
```

But state does NOT update immediately — the returned value comes from URL decoding, which lags behind during debounce.

## Fix

Add a `pendingRef` that holds the intended value during the debounce window. The key insight: we already know when we're in the debounce window (between `setValue` and URL write), we just don't use that knowledge in the render path.

### Changes to `useUrlState` (line ~145–179)

```typescript
// Pending value during debounce window (set by setValue, cleared by writeToUrl)
const pendingRef = useRef<{ decoded: T } | null>(null)

// ... existing useSyncExternalStore, encoded, etc. ...

let value: T
if (pendingRef.current) {
  // Debounce in flight — return the value we intend to write
  value = pendingRef.current.decoded
} else if (lastWrittenRef.current && lastWrittenRef.current.encoded === encoded) {
  // URL caught up to our write — use authoritative value
  value = lastWrittenRef.current.decoded
} else {
  // External change or initial load — decode from URL
  if (cacheRef.current === null || cacheRef.current.encoded !== encoded || cacheRef.current.param !== param) {
    cacheRef.current = { encoded, param, decoded: param.decode(encoded) }
  }
  value = cacheRef.current.decoded
  lastWrittenRef.current = null
}
```

### Changes to `setValue` (line ~224–238)

```typescript
const setValue = useCallback(
  (newValue: T) => {
    const newEncoded = paramRef.current.encode(newValue)
    lastWrittenRef.current = { encoded: newEncoded, decoded: newValue }

    if (debouncedWriteRef.current) {
      // Set pending value so render returns it immediately
      pendingRef.current = { decoded: newValue }
      debouncedWriteRef.current(newValue, newEncoded)
    } else {
      writeToUrl(newValue, newEncoded)
    }
  },
  [writeToUrl]
)
```

### Changes to `writeToUrl` — clear `pendingRef` after URL write

Wrap or augment `writeToUrl` so that after the URL is written, `pendingRef` is cleared. The simplest approach: clear it in the debounced callback wrapper rather than in `writeToUrl` itself (since non-debounced calls don't need it):

```typescript
useEffect(() => {
  if (debounceMs > 0) {
    debouncedWriteRef.current = debounce(
      (...args: Parameters<typeof writeToUrl>) => {
        writeToUrl(...args)
        pendingRef.current = null  // URL is now written; stop overriding
      },
      debounceMs
    )
  } else {
    debouncedWriteRef.current = null
  }
  return () => {
    debouncedWriteRef.current?.cancel()
  }
}, [debounceMs, writeToUrl])
```

### Edge case: external URL change during debounce

If the URL changes externally (e.g. back/forward navigation) while a debounce is in flight, we should respect the external change and discard the pending value. Detect this by comparing the current URL-encoded value against what it was when `setValue` was called:

```typescript
// In setValue, also snapshot the current URL state:
const pendingRef = useRef<{ decoded: T; prevEncoded: string | undefined } | null>(null)

// In setValue:
pendingRef.current = { decoded: newValue, prevEncoded: encoded_at_call_time }

// In render, check for external changes:
if (pendingRef.current) {
  if (encoded !== pendingRef.current.prevEncoded && encoded !== lastWrittenRef.current?.encoded) {
    // URL changed externally during debounce — discard pending
    pendingRef.current = null
    debouncedWriteRef.current?.cancel()
    // fall through to URL decode
  } else {
    value = pendingRef.current.decoded
  }
}
```

However, `setValue` is a callback and doesn't have access to the render-time `encoded` value. Read it fresh:

```typescript
const setValue = useCallback(
  (newValue: T) => {
    const newEncoded = paramRef.current.encode(newValue)
    lastWrittenRef.current = { encoded: newEncoded, decoded: newValue }

    if (debouncedWriteRef.current) {
      const currentEncoded = multiToSingle(strategy.parse()[key] ?? [])
      pendingRef.current = { decoded: newValue, prevEncoded: currentEncoded }
      debouncedWriteRef.current(newValue, newEncoded)
    } else {
      writeToUrl(newValue, newEncoded)
    }
  },
  [writeToUrl, key, strategy]
)
```

This adds `key` and `strategy` to the dependency array, which is fine since they're stable.

## Affected hooks

The same fix applies to all four hooks:
- `useUrlState` (single param)
- `useUrlStates` (multi param)
- `useMultiUrlState` (repeated param)
- `useMultiUrlStates` (repeated multi param)

## Test plan

1. Slider with debounce + unrelated state: drag slider, trigger other state change mid-drag, verify slider doesn't snap back
2. Rapid setValue calls: call setValue 10x in 100ms with debounce 300, verify final value is returned immediately and URL updates once
3. External navigation during debounce: setValue with debounce, then `history.back()` before debounce fires — verify the back navigation wins
4. No debounce (regression): verify existing non-debounced behavior is unchanged
5. Debounce fires normally: setValue, wait for debounce, verify URL and value are correct

## E2E reproduction (docsite)

### Docsite changes

Add a "Debounce" section to `ParamsDemo.tsx` with:
- A number input backed by `useUrlState('d', intParam(0), { debounce: 500 })`
- An unrelated local counter (`useState(0)`) with an increment button
- A `<span data-testid="debounce-value">` showing the hook's returned value

```tsx
const [debouncedNum, setDebouncedNum] = useUrlState('d', intParam(0), { debounce: 500 })
const [localCounter, setLocalCounter] = useState(0)

// in JSX:
<section id="section-debounce" className="section">
  <h2>Debounce (intParam + debounce)</h2>
  <div className="controls">
    <div className="control-group">
      <label>Debounced number (500ms)</label>
      <input
        type="number"
        data-testid="debounce-input"
        value={debouncedNum}
        onChange={e => setDebouncedNum(parseInt(e.target.value) || 0)}
      />
      <span data-testid="debounce-value">{debouncedNum}</span>
    </div>
    <div className="control-group">
      <label>Unrelated local state: {localCounter}</label>
      <button data-testid="debounce-bump" onClick={() => setLocalCounter(n => n + 1)}>
        Bump
      </button>
    </div>
  </div>
</section>
```

### Playwright tests (`site/e2e/params.spec.ts`)

```typescript
test.describe('Debounce value stability', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('value does not revert on unrelated re-render during debounce window', async ({ page }) => {
    const input = page.locator('[data-testid="debounce-input"]')
    const value = page.locator('[data-testid="debounce-value"]')
    const bump = page.locator('[data-testid="debounce-bump"]')

    // Initial state
    await expect(value).toHaveText('0')
    await expect(page).toHaveURL('/')

    // Set debounced value
    await input.fill('42')
    // Value should update immediately in the UI
    await expect(value).toHaveText('42')
    // URL should NOT have updated yet (500ms debounce)
    expect(page.url()).not.toContain('d=42')

    // Trigger unrelated re-render during debounce window
    await bump.click()

    // BUG: without fix, value snaps back to 0 here
    await expect(value).toHaveText('42')

    // Wait for debounce to fire
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/d=42/)
    await expect(value).toHaveText('42')
  })

  test('rapid setValue calls preserve final value', async ({ page }) => {
    const input = page.locator('[data-testid="debounce-input"]')
    const value = page.locator('[data-testid="debounce-value"]')

    // Rapid-fire value changes (simulating slider drag)
    for (const v of [10, 20, 30, 40, 50]) {
      await input.fill(String(v))
    }

    // Should show final value immediately
    await expect(value).toHaveText('50')

    // URL updates only once, after debounce
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(/d=50/)
  })

  test('external navigation during debounce wins', async ({ page }) => {
    // Navigate to a state first (so we have history to go back to)
    await page.goto('/?n=hello')
    await expect(page).toHaveURL('/?n=hello')

    const input = page.locator('[data-testid="debounce-input"]')

    // Set debounced value
    await input.fill('99')

    // Navigate back before debounce fires
    await page.goBack()

    // The back navigation should win — URL should not contain d=99
    await page.waitForTimeout(600)
    expect(page.url()).not.toContain('d=99')
  })
})
```

## Implementation notes

Two additional changes were needed beyond the spec:

### 1. `forceUpdate` for immediate re-render

`setValue` only sets refs and schedules a debounced callback — it doesn't trigger a React state update. Without a re-render, `pendingRef` is set but the component still shows the old value. Added `useReducer` as a force-update mechanism: `setValue` calls `forceUpdate()` after setting `pendingRef`, causing a re-render that picks up the pending value.

### 2. Raw URL comparison instead of per-key comparison

The spec suggested comparing `pendingRef.current.prevEncoded` (the per-key encoded value) to detect external URL changes during debounce. This fails when the external change affects *other* keys: e.g., URL changes from `/?` to `/?n=hello` but this key's (`d`) encoded value is `undefined` in both cases. Changed to compare `strategy.getRaw()` (the full raw URL string) instead.

### Unit tests

The E2E tests don't reliably reproduce the bug because React 18's synthetic event handling in `page.evaluate()` doesn't trigger React's `onChange`. Added `src/useUrlState.test.tsx` with `@testing-library/react` + `happy-dom` for precise control over React renders. These tests successfully demonstrate the bug (fail without fix, pass with fix).
