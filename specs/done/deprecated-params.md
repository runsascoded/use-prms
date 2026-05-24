# Deprecated URL params: declare-and-strip

## Motivation

When a project renames or retires a URL param, old links keep arriving with the dead key in the query string. The library has two existing positions for any key in the URL:

- **Declared** (in `params` passed to `inspectUrl`/`cleanUrl`): classified as canonical / stale / malformed
- **Unrecognized** (not in `params`): controlled by `cleanUrl({ unrecognized: 'strip' | 'keep' })`

Neither fits "we know this key, we used to read it, we don't anymore, please strip it":

- Adding the dead key to `params` requires inventing a `Param<T>` for it — and once it's declared, `useUrlState` consumers can read it, which defeats the deprecation.
- `unrecognized: 'strip'` is too coarse: it strips **every** unrecognized key, including ones owned by third-party tooling (analytics, A/B-test frameworks, share-link augmenters, downstream widgets), so projects that share their URL with anything else can't opt in.

Concrete trigger: `nj-crashes` recently unified two map implementations and renamed the viewState param `v=lat_lon_zoom_pitch_bearing` → `llz=lat+lon+zoom+pitch+bearing` (different delimiter, different param key). Old bookmarks keep arriving with `?...&v=40.3168_-74.3316_9.1_45_0`. The current code never reads `v`; it's pure URL noise. The project also wants to opt into something like `unrecognized: 'strip'` someday, but not yet — it can't promise none of its embedded plots/widgets will gain their own URL params.

## API

Add a third bucket alongside `unrecognized` and the per-state policies. Two forms:

```ts
import { useUrlState, llzParam, cleanUrl } from 'use-prms'

const llz = llzParam({ default: { lat: 40.74, lng: -74.012, zoom: 11.8 } })

useEffect(() => {
  // Simple form: drop these keys
  cleanUrl({ llz }, { deprecated: ['v'] })

  // Migration form: convert old raw → new typed values, then drop
  cleanUrl(
    { llz },
    {
      deprecated: {
        v: (raw) => {
          const [lat, lng, zoom] = raw.split('_').map(Number)
          return { llz: { lat, lng, zoom } }
        },
        u: null,  // null = just drop (same as listing in the array form)
      },
    },
  )
}, [])
```

`deprecated` accepts either:

- `readonly string[]` — drop these keys.
- `Record<string, null | ((raw: string) => Record<string, unknown>)>` — `null` drops; a function decodes the old raw value and returns a record from declared param keys → new typed values, which `cleanUrl` encodes via `params[k].encode(v)` and writes to the URL before dropping the old key.

Stays a no-op when no listed key is present in the URL (no spurious `replaceState`).

### `onDeprecated` callback

Whenever a deprecated key is found in the URL, `cleanUrl` fires an observer. **Default: `console.warn`** with a structured message; pass `null` to silence, or your own function to redirect to telemetry.

```ts
interface DeprecatedInfo {
  key: string
  raw: string
  migrated?: Record<string, unknown>  // only present when a migration fn ran
}

cleanUrl({ llz }, {
  deprecated: { v: migrateV },
  onDeprecated: (info) => analytics.track('legacy_url_param', info),
  // or onDeprecated: null  to silence
})
```

The default warning makes lingering bookmarks visible in dev/staging without extra opt-in; teams that don't want browser noise (production, embedded widgets) pass `null`.

### `inspectUrl` parallel

`inspectUrl` gains a `deprecated: string[]` output field — the subset of declared-deprecated keys actually present in the URL right now. (Mirrors the existing `unrecognized: string[]` field; lets callers log which dead keys arrived, e.g. for telemetry on how long bookmarks linger.)

```ts
interface UrlDiagnostics {
  unrecognized: string[]
  deprecated: string[]   // ← new
  malformed: KeyedDiagnostic[]
  stale: KeyedDiagnostic[]
}
```

Both `inspectUrl` and `cleanUrl` take the deprecated list via the same `params` slot, or as a second arg — see "Open questions" below.

### Interaction with `unrecognized`

- `deprecated: ['v']` only strips `v` (precise, surgical). Other unknowns stay.
- `unrecognized: 'strip'` strips all unknowns (aggressive, blanket). The `deprecated` list is a subset of `unrecognized` from the URL's perspective.
- Both together = identical net effect to just `unrecognized: 'strip'`.
- `deprecated` always wins over `unrecognized: 'keep'`: declaring something deprecated is an explicit intent to strip.

### `inspectUrl` semantics

A deprecated key never shows up under `unrecognized` (since the caller knows about it). It shows up under `deprecated` iff present in the URL. This avoids the "you said it's deprecated but `inspectUrl` says it's unrecognized" double-counting.

## Types

The policy types are generic over `P extends Params`, so a migration callback's return value is type-checked against the declared params: keys must be `keyof P`, and values must match each `P[K]`'s `T`.

```ts
export type Params = Record<string, Param<any>>

export type ParamValues<P extends Params> = {
  [K in keyof P]: P[K] extends Param<infer T> ? T : never
}

export type DeprecatedMigration<P extends Params = Params> =
  (raw: string) => Partial<ParamValues<P>>

export type DeprecatedSpec<P extends Params = Params> =
  | readonly string[]
  | { [key: string]: null | DeprecatedMigration<P> }

export interface DeprecatedInfo {
  key: string
  raw: string
  /** Present only if a migration function ran for this key. */
  migrated?: Partial<ParamValues<Params>>
}

export interface CleanUrlPolicy<P extends Params = Params> {
  unrecognized?: 'keep' | 'strip'
  malformed?: 'keep' | 'reset'
  stale?: 'keep' | 'normalize'
  /**
   * Named keys to strip (optionally migrating their value first).
   * Independent of `unrecognized`.
   */
  deprecated?: DeprecatedSpec<P>
  /**
   * Fires once per deprecated key actually present in the URL.
   * Default: `console.warn` with a structured message.
   * Pass `null` to silence.
   */
  onDeprecated?: ((info: DeprecatedInfo) => void) | null
}

export interface InspectUrlOptions<P extends Params = Params> {
  deprecated?: DeprecatedSpec<P>
}

export interface UrlDiagnostics {
  unrecognized: string[]
  /** Subset of declared-deprecated keys currently in the URL. */
  deprecated: string[]
  malformed: KeyedDiagnostic[]
  stale: KeyedDiagnostic[]
}
```

A typo or wrong value shape in the migration is caught at compile time:

```ts
cleanUrl(
  { llz: llzParam(...) },
  {
    deprecated: {
      v: () => ({ undeclared: 'x' }),     // ✗ TS error: not a key of P
      w: () => ({ llz: 'wrong shape' }),  // ✗ TS error: string not assignable to LLZ
      u: () => ({ llz: { lat, lng, zoom } }),  // ✓
    },
  },
)
```

## Tests

Add to `diagnostics.test.tsx`:

```ts
describe('deprecated', () => {
  // Silence default console.warn for these tests
  const opts = { onDeprecated: null as const }

  it('inspectUrl reports declared-deprecated keys that are present', () => {
    window.history.replaceState({}, '', '/?known=5&v=foo')
    const diag = inspectUrl({ known: intParam(0) }, { deprecated: ['v'] })
    expect(diag.deprecated).toEqual(['v'])
    expect(diag.unrecognized).toEqual([])  // v is known-deprecated, not unrecognized
  })

  it('cleanUrl strips deprecated keys while keeping other unknowns', () => {
    window.history.replaceState({}, '', '/?n=5&v=foo&_ga=xyz')
    cleanUrl({ n: intParam(0) }, { deprecated: ['v'], ...opts })
    expect(location.search).toBe('?n=5&_ga=xyz')  // v stripped; _ga (third-party) kept
  })

  it('deprecated + unrecognized:strip is equivalent to plain strip', () => {
    window.history.replaceState({}, '', '/?v=foo&extra=bar')
    cleanUrl({}, { deprecated: ['v'], unrecognized: 'strip', ...opts })
    expect(location.search).toBe('')
  })

  it('deprecated wins over unrecognized:keep', () => {
    window.history.replaceState({}, '', '/?v=foo&extra=bar')
    cleanUrl({}, { deprecated: ['v'], ...opts })  // unrecognized defaults to 'keep'
    expect(location.search).toBe('?extra=bar')
  })

  it('no-op when deprecated keys absent', () => {
    window.history.replaceState({}, '', '/?n=5')
    const spy = vi.spyOn(history, 'replaceState')
    cleanUrl({ n: intParam(0) }, { deprecated: ['v'], ...opts })
    expect(spy).not.toHaveBeenCalled()
  })

  it('migration: converts old raw → new typed value, then strips old key', () => {
    window.history.replaceState({}, '', '/?v=40.74_-74.01_11.8')
    const llz = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    cleanUrl(
      { llz },
      {
        deprecated: {
          v: (raw) => {
            const [lat, lng, zoom] = raw.split('_').map(Number)
            return { llz: { lat, lng, zoom } }
          },
        },
        ...opts,
      },
    )
    // llz= written in canonical signDelim form; v= stripped
    expect(location.search).toBe('?llz=40.7400-74.0100+11.80')
  })

  it('migration: null entry just drops (same as array form)', () => {
    window.history.replaceState({}, '', '/?v=foo&n=5')
    cleanUrl({ n: intParam(0) }, { deprecated: { v: null }, ...opts })
    expect(location.search).toBe('?n=5')
  })

  it('onDeprecated fires once per deprecated key found', () => {
    window.history.replaceState({}, '', '/?v=foo&w=bar&n=5')
    const onDeprecated = vi.fn()
    cleanUrl({ n: intParam(0) }, { deprecated: ['v', 'w'], onDeprecated })
    expect(onDeprecated).toHaveBeenCalledTimes(2)
    expect(onDeprecated).toHaveBeenCalledWith({ key: 'v', raw: 'foo' })
    expect(onDeprecated).toHaveBeenCalledWith({ key: 'w', raw: 'bar' })
  })

  it('onDeprecated receives the migration output when a migrator ran', () => {
    window.history.replaceState({}, '', '/?v=1_2_3')
    const llz = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    const onDeprecated = vi.fn()
    const migrate = (raw: string) => {
      const [lat, lng, zoom] = raw.split('_').map(Number)
      return { llz: { lat, lng, zoom } }
    }
    cleanUrl({ llz }, { deprecated: { v: migrate }, onDeprecated })
    expect(onDeprecated).toHaveBeenCalledWith({
      key: 'v',
      raw: '1_2_3',
      migrated: { llz: { lat: 1, lng: 2, zoom: 3 } },
    })
  })

  it('default onDeprecated is console.warn', () => {
    window.history.replaceState({}, '', '/?v=foo')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cleanUrl({}, { deprecated: ['v'] })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('onDeprecated: null silences the default warn', () => {
    window.history.replaceState({}, '', '/?v=foo')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cleanUrl({}, { deprecated: ['v'], onDeprecated: null })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

## Open questions

**Q1: Where does the deprecated list live — in `params` or in the policy?**

Two shapes:

- (a) **Policy-only** (drafted above): `cleanUrl(params, { deprecated: ['v'] })`. Lightweight; matches the existing `unrecognized` axis (which also lives in the policy). Downside: re-state the list at every call site.
- (b) **Param-like declaration**: `cleanUrl({ llz, v: deprecated() }, { ... })`. Reuses the `params` slot. Lets a project declare its full param surface (including dead keys) in one place and pass it everywhere. Downside: `deprecated()` is a `Param<never>` that throws on read, which is more surface area for marginal benefit.

Preference: (a). The deprecated list is a project-wide constant; declaring it once and importing into the one `useEffect` that calls `cleanUrl` is fine. If a project really wants the registry pattern, they can build it on top.

**Q2: Migration hook — `deprecated: { v: (oldRaw) => ({ llz: convert(oldRaw) }) }`?**

**Resolved: yes, in scope.** Two practical reasons to fold it into `cleanUrl`:

1. The hand-rolled `useEffect` form (parse raw → setValue → cleanUrl) runs the migration outside the cleanup pipeline, so the URL momentarily contains both `v=…` and `llz=…` before the strip lands. Library-side migration writes both changes in one `replaceState`.
2. Co-locates the strip and convert decisions in one policy object — easier to audit at the call site than two-step code.

The migration function returns a record of `{ [paramKey]: newValue }`; `cleanUrl` resolves each `paramKey` against the `params` arg and encodes via that `Param`'s `encode`. Unknown keys are silently skipped (caller can detect by observing `onDeprecated` output).

**Q3: Do we need a React hook wrapper?**

Currently `cleanUrl` is a function you call from a `useEffect`. The README/docs example for deprecation could ship a small `useStripDeprecated(['v'])` convenience hook. Probably yes — most users want "run this once on mount" semantics — but mechanically it's a 3-line wrapper, so we can defer.

## Implementation sketch

In `src/diagnostics.ts`:

1. Add `DeprecatedMigration`, `DeprecatedSpec`, `DeprecatedInfo` types.
2. Add `deprecated?: DeprecatedSpec` and `onDeprecated?: ((info) => void) | null` to `CleanUrlPolicy`.
3. Add `deprecated: string[]` to `UrlDiagnostics`.
4. Helper `extractDeprecatedKeys(spec)` and `extractMigration(spec, key)` to normalize the array vs record forms.
5. In `inspectUrl`, take `policy?: { deprecated?: DeprecatedSpec }`. Compute `deprecated = keys.filter(k => k in urlParams && !declared.has(k))`. Remove those from `unrecognized`.
6. In `cleanUrl`:
   - For each deprecated key present, look up migration fn (if any), call with raw value.
   - Apply migration output: for each `(k, v)` in result, if `k in params`, `next[k] = [params[k].encode(v)]` (or delete if `undefined`); else skip silently.
   - Delete the deprecated key from `next`.
   - Fire `onDeprecated({ key, raw, migrated? })` (default = `console.warn`).
7. Treat presence of any deprecated key as a "willStripDeprecated" axis in the early-return guard.
8. Update README to add a "Deprecating a param" section + update API table.

Estimated diff: ~80 lines + tests.
