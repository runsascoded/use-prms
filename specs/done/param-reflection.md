# Param reflection: a page can explain its own URL

## Implementation notes (landed 2026-09-17)

Shipped as `src/registry.ts` (pure) + `src/reflection.ts` (pure + the one
React hook) + `describe` instrumentation on the five hooks, exported from the
package root; a "URL reflection" panel in `site/`; 13 tests in
`src/reflection.test.tsx`. Deltas from the spec as written:

- **Registry key & conflict policy.** Live entries are keyed `(strategy, key)`
  and ref-counted. When one key is mounted by several components the **first**
  registration's `param`/metadata is kept (a stable identity); later mounts
  only bump `refs`. No equality policing — a caller reading one key with
  divergent params is their bug.
- **`describeParams` merge.** A catalogue entry (`refs: 0`) merges *under* a
  live registration of the same key: the live entry wins, the catalogue fills
  metadata the hook omitted. A catalogue entry may carry its own `param` so a
  dormant row still classifies; without one it uses a passthrough decoder.
- **`describe` shape.** Single-key hooks (`useUrlState`, `useMultiUrlState`,
  `useUrlAlias`) take one `describe`; the multi-key `useUrlStates` takes a
  per-key `describe?: Partial<Record<keyof P, ParamDescribe>>`.
  `useMultiUrlStates` registers its keys but takes no `describe` (its options
  type is the single-key shape).
- **`description` type.** Typed `unknown` in the pure layer (a host may pass a
  string or a ReactNode) to keep `registry.ts`/`reflection.ts` free of React
  types.
- **Multi-value reflection.** `raw` is the comma-joined encoding and `value`
  the decoded array; `state` is `absent`/`canonical` only (the
  single-value `classifyParam` stale/malformed split doesn't apply).
- **`ParamReflection extends ParamRegistration`**, as the spec's type test asks.
- `__resetRegistry()` is exported for tests.

Everything else matches the sections below.

---


**Why.** A `use-prms` page's URL is its state, but nothing on the page can say what `?d=260916-2001-1d&ln&y0#over-time` means, which keys the page would honour that aren't set, or why a stale link no longer does what it did. Today that knowledge lives in the hook call sites, one `useUrlState('ln', boolParam)` at a time, and the URL Diagnostics helpers (`inspectUrl`, `classifyParam`) need the caller to hand them the spec. This spec makes the registered params discoverable at runtime so a host can render them however it likes — a SpeedDial panel, a `?` modal, a dev overlay, a docs page — without the library dictating UI.

## 1. Registry

Every mounted `useUrlState` / `useUrlStates` / `useMultiUrlState` / `useUrlAlias` registers its param with a module-level registry keyed by URL key (query and hash strategies kept apart), and unregisters on unmount. Registration carries what the hook already knows plus optional descriptive metadata:

```ts
interface ParamRegistration {
  key: string
  strategy: 'query' | 'hash'
  param: Param<unknown>            // encode/decode, for canonical forms
  /** Human copy, from the new `describe` option (below). */
  label?: string                   // "Diff window"
  description?: ReactNode | string // "Scan to show, with a look-back span…"
  /** Example encodings the host can show ("260916-2001-1d"). */
  examples?: string[]
  /** The value's default, for "currently off / default" rows. */
  defaultEncoded?: Encoded
  /** Mount count — the same key may be read by several components. */
  refs: number
}
```

New hook option, all hooks: `describe?: { label?, description?, examples? }`. Absent metadata still registers the key (the host can show the key and its current value; the label falls back to the key).

## 2. Reflection API

Pure, framework-agnostic, exported from the package root:

```ts
/** Every registered param, with its live classification (reuses `classifyParam`). */
reflectParams(opts?: { strategy?: 'query' | 'hash' }): ParamReflection[]

interface ParamReflection extends ParamRegistration {
  state: 'absent' | 'canonical' | 'stale' | 'malformed'   // as UrlDiagnostics
  raw?: string            // what the URL has
  canonical?: string      // what it should be, when stale
  value: unknown          // decoded
}

/** The URL's keys nothing registered (the `unrecognized` list, with raw values). */
reflectUnknown(opts?): { key: string; raw: string }[]

/** Subscribe to registry + URL changes (mounts, unmounts, navigations). */
onReflectionChange(cb: () => void): () => void
```

React: `useParamReflection(opts?)` → `{ params: ParamReflection[]; unknown: … }`, re-rendering on registry and URL changes. It reads the registry only; it never registers a param itself.

## 3. What a host renders (non-normative)

The reference app (`site/`) adds a "URL" panel: one row per registered param — label, key, current value (or *default* when absent, muted), a one-line description, and for `stale` rows a "normalize" affordance that calls `cleanUrl` for that key; a trailing "not recognized" group for `reflectUnknown()`. Hosts with a SpeedDial mount it as an action; a dev overlay can render the same data as a table. The library ships no component.

## 4. Semantics and edge cases

- **Dormant params**: registered while their component is mounted — a param on a route that isn't rendered is not "could be enabled here". A host wanting a whole-app catalogue registers descriptions once via `describeParams({ key: {…} })` (metadata only, no hook); such entries show `refs: 0`.
- **Aliases** (`useUrlAlias`): the alias set registers as one entry with `keys: string[]`; the reflection reports which key is live.
- **Multi-value params**: `raw` is the joined multi-encoding; `value` the decoded array.
- **Hash strategy**: keys are namespaced by strategy; a host asks for one or both.
- **SSR / no window**: the registry works without a URL (`state: 'absent'` for all); reflection never touches `location` when there is none.
- **Perf**: registration is a Map set/delete per mount; `reflectParams` is O(registered) and only runs on demand or on subscription callbacks.

## 5. Tests

- Registry: mount two readers of one key → `refs: 2`; unmount one → `1`; unmount both → gone. Query and hash keys with the same name coexist.
- `reflectParams`: absent / canonical / stale / malformed rows match `classifyParam` for the same param and raw value; `defaultEncoded` from `param.encode(decode(undefined))`.
- `reflectUnknown`: URL keys not registered, including ones a `describeParams` catalogue entry knows about (those are `refs: 0`, not unknown).
- `useParamReflection`: re-renders on `useUrlState` mount/unmount and on `updateUrl`.
- Types: `describe` accepted by every hook; `ParamReflection` extends `ParamRegistration`.
