# Spec: URL Parameter Sync

Core specification for how `use-prms` synchronizes state with URL parameters.

## Goals

1. **Bidirectional sync**: State ↔ URL, both directions work
2. **No feedback loops**: Writing to URL doesn't trigger redundant state updates
3. **External changes respected**: Manual URL edits, back/forward, link navigation all update state
4. **Debounce support**: High-frequency state updates don't thrash the URL
5. **Simple API**: Just works, minimal configuration

## API

```typescript
const [value, setValue] = useUrlParam(key, param, options?)

interface UseUrlParamOptions<T> {
  /** Debounce URL writes in ms (default: 0) */
  debounce?: number

  /** Fallback value if URL param missing */
  defaultValue?: T
}
```

### Examples

```typescript
// Basic usage
const [count, setCount] = useUrlParam('n', intParam)

// With debounce for high-frequency updates (animation, dragging)
const [position, setPosition] = useUrlParam('pos', positionParam, {
  debounce: 400
})

// With default value
const [theme, setTheme] = useUrlParam('theme', stringParam, {
  defaultValue: 'light'
})
```

## Core Behavior: Causality Tracking

The library tracks whether URL changes originated from the app or externally:

| URL Change Source | Action |
|-------------------|--------|
| App called `setValue()` | Ignore URL change event (we have authoritative value) |
| User pressed back/forward | Sync URL → state |
| User manually edited URL | Sync URL → state |
| User navigated to link | Sync URL → state |

This prevents feedback loops while respecting user intent.

### Why This Matters

Even with "lossless" encodings, re-reading URL values you just wrote is wasteful. With lossy encodings (truncated floats, compressed binary), it causes visible bugs like snapping to lower-precision values.

**Without causality tracking:**
1. `setValue(0.123456789)`
2. URL encoded (any format)
3. URL change event fires
4. State re-reads URL → **redundant at best, lossy snap at worst**

**With causality tracking:**
1. `setValue(0.123456789)`
2. URL encoded, `lastWrittenRef` records what we wrote
3. URL change event fires
4. URL matches `lastWrittenRef` → **ignore, we caused this**

The key insight: **never re-read a URL value you just wrote**. You already have the authoritative value.

## Implementation

### Core Hook

```typescript
function useUrlParam<T>(key: string, param: Param<T>, options?: Options) {
  const lastWrittenRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const initialValueRef = useRef<T | null>(null)

  // Initialize from URL (with StrictMode handling)
  const [value, setValue] = useState<T>(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      initialValueRef.current = decodeFromUrl(key, param) ?? options?.defaultValue ?? null
    }
    return initialValueRef.current
  })

  // Write to URL (debounced if configured)
  const writeToUrl = useMemo(() => {
    const write = (newValue: T) => {
      const encoded = param.encode(newValue)
      lastWrittenRef.current = encoded
      updateUrlParam(key, encoded)
    }
    return options?.debounce
      ? debounce(write, options.debounce, { trailing: true })
      : write
  }, [key, param, options?.debounce])

  // Exposed setter: update state + URL
  const setValueAndUrl = useCallback((newValue: T) => {
    setValue(newValue)
    writeToUrl(newValue)
  }, [writeToUrl])

  // Listen for external URL changes
  useEffect(() => {
    const handleUrlChange = () => {
      const encoded = getUrlParam(key)
      if (encoded !== lastWrittenRef.current) {
        // External change - sync to state
        writeToUrl.cancel?.()  // Cancel pending debounced write
        const decoded = param.decode(encoded)
        if (decoded !== null) {
          setValue(decoded)
          lastWrittenRef.current = encoded
        }
      }
    }

    window.addEventListener('popstate', handleUrlChange)
    window.addEventListener('hashchange', handleUrlChange)
    return () => {
      window.removeEventListener('popstate', handleUrlChange)
      window.removeEventListener('hashchange', handleUrlChange)
    }
  }, [key, param])

  return [value, setValueAndUrl]
}
```

### Param Interface

```typescript
interface Param<T> {
  encode(value: T): string
  decode(str: string | null): T | null
}
```

### Built-in Params

```typescript
export const stringParam: Param<string> = {
  encode: (s) => s,
  decode: (s) => s,
}

export const intParam: Param<number> = {
  encode: (n) => n.toString(),
  decode: (s) => s ? parseInt(s, 10) : null,
}

export const floatParam: Param<number> = {
  encode: (n) => n.toString(),
  decode: (s) => s ? parseFloat(s) : null,
}

export const boolParam: Param<boolean> = {
  encode: (b) => b ? '1' : '0',
  decode: (s) => s === '1' ? true : s === '0' ? false : null,
}

export const jsonParam = <T>(): Param<T> => ({
  encode: (v) => JSON.stringify(v),
  decode: (s) => s ? JSON.parse(s) : null,
})
```

## Edge Cases

### Debounce + External Change Race

If user makes external change while debounced write is pending:
1. External change detected
2. Cancel pending debounced write
3. Sync external value to state
4. Update `lastWrittenRef`

This prevents the pending write from overwriting the user's change.

### Multiple Params

Each param has its own `lastWrittenRef`. Changes to one param don't affect others.

### Page Refresh

Fresh start - URL is read on mount, `lastWrittenRef` starts as `null`, first write establishes tracking.

### Empty/Missing Params

If URL param is missing:
- `decode` receives `null`
- `defaultValue` is used if provided
- Otherwise state is `null`

### Hash vs Query Params

Implementation should support both:
- Hash params: `#key=value&key2=value2`
- Query params: `?key=value&key2=value2`

Configurable at provider level or per-param.

## Provider (Optional)

```typescript
interface UrlParamsConfig {
  /** Use hash (#) or query (?) params (default: 'hash') */
  mode?: 'hash' | 'query'

  /** Default debounce for all params */
  defaultDebounce?: number
}

<UrlParamsProvider config={{ mode: 'hash', defaultDebounce: 100 }}>
  {children}
</UrlParamsProvider>
```

## What This Spec Does NOT Cover

### External Caching

Apps needing lossless state persistence (e.g., sessionStorage backup keyed by URL hash) should handle this separately:

```typescript
const [shapes, setShapes] = useUrlParam('s', shapesParam, { debounce: 400 })

// Separate concern - not part of use-prms
useLosslessCache(shapes, {
  key: currentUrlHash,
  storage: sessionStorage,
})
```

### Binary Encoding Helpers

See [SPEC-BINARY-ENCODING.md](./SPEC-BINARY-ENCODING.md) for base64/base80 encoding utilities.

## Migration from Custom Implementations

For apps with manual URL param handling (like apvd):

1. Replace custom `parseHashParams` / `updateHashParams` with `useUrlParam`
2. Remove manual `popstate` / `hashchange` listeners
3. Remove manual debounce wrappers
4. Remove ref-based "already consumed" tracking
5. Keep any external caching (sessionStorage) as separate concern

## Summary

The library automatically prevents feedback loops via causality tracking while correctly syncing external URL changes to state. No special configuration needed - it just works.
