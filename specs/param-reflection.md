# Param reflection: a page can explain its own URL

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
