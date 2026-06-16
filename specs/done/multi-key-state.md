# Multi-key state: alias one logical value across several URL keys

**Status:** implemented as `useUrlAlias` in `src/useUrlAlias.ts`.

## Implementation deltas

- Shipped as a standalone hook (`useUrlAlias`) — multi-state form deferred per Open question 1.
- `merge` may also *throw* an `Error` (in addition to returning one); thrown errors are caught and routed the same way as returned errors. Non-`Error` throws are normalized to `Error`.
- `onConflict` callback variant: callback is invoked, then the canonical key's decoded value is adopted (same fallback as `'warn'`). `'throw'` rethrows verbatim.
- Strategy: matches the other hooks — uses `getDefaultStrategy()` rather than an explicit `strategy` field on the input shape. Hash strategy works via the same `setDefaultStrategy` mechanism as `useUrlState`.
- Causality: `setValue` tracks `{canonicalEncoded, value}` so own-write re-renders return the authoritative value without re-decoding (matches `useUrlState`).
- `setValue` always strips alias keys too, not just on mount — so external history that re-introduces aliases doesn't leak into subsequent writes.
- After mount, external navigations re-resolve via `merge` but do *not* re-canonicalize (consistent with "first render" framing in the spec).

## Motivation

A single piece of state often has multiple equivalent URL spellings users
type by hand. ELvis is the prototypical case:

- canonical: `?m=mp-2375705` (full MP id, `mp-` prefix included)
- shorthand: `?mp=2375705` (number only, prefix implied)

Both should resolve to the same internal `materialId = 'mp-2375705'`.
The URL should normalize to one canonical key on first render so shared
links are predictable. If both keys are present, the conflict should be
surfaced (not silently resolved).

Today's options inside `use-prms`:

1. **`cleanOnMount.deprecated[k] = migration`** — migrates `mp` → `m` on
   first render and strips `mp`. Works for a one-shot transition but
   semantically frames `mp` as *deprecated*, which it isn't — it's a
   permanent alias.
2. **`useUrlStates({ m, mp }, ...)` + manual merge** — read both, pick
   one, write both. Boilerplate, easy to get wrong, race-y under burst
   updates, doesn't normalize the URL.
3. **`useEffect` on mount** — the workaround consumers reach for first;
   imperative, easy to fire-and-forget, no type guidance.

None of these models "one logical value sourced from N keys, with a
designated canonical key for writes". That's the gap.

## Prior art inside `use-prms`

- `useMultiUrlState(key, multiParam)` — single key with **repeated**
  values (`?tag=a&tag=b`). Different problem: one key, many values.
- `cleanOnMount.deprecated` migration functions — closest to what we
  want, but framed as "old → new" not "alias → canonical".

## Proposal: `useUrlAlias` (single-state form)

```ts
type AliasInput<T> = {
  /** Ordered list of keys to read from. Index 0 is the canonical write
   *  target; later keys are aliases. */
  keys: readonly [string, ...string[]]
  /** Per-key param decoder. Maps each key to its `Param<T | undefined>`
   *  so an absent key reads as `undefined`. */
  params: Record<string, Param<T | undefined>>
  /** Merge raw decoded values into the final state. Called whenever the
   *  URL changes. Receives a record keyed by the alias keys, each
   *  either the decoded value or `undefined` if the key is absent.
   *  Return the resolved state, or throw / return an Error to signal a
   *  conflict (see `onConflict`). */
  merge: (vals: Record<string, T | undefined>) => T | undefined | Error
  /** What to do when `merge` returns/throws an Error. Default: console
   *  warn + adopt the canonical key's value. Pass `'throw'` to rethrow,
   *  or a callback to handle. */
  onConflict?: 'warn' | 'throw' | ((err: Error) => void)
  /** If true (default), strip non-canonical alias keys from the URL on
   *  first render (canonicalization). If false, leave alias keys in
   *  place — they'll still be read on subsequent navigations. */
  canonicalizeOnMount?: boolean
}

function useUrlAlias<T>(input: AliasInput<T>): [T | undefined, (v: T | undefined) => void]
```

### ELvis usage

```ts
const [materialId, setMaterialId] = useUrlAlias({
  keys: ['m', 'mp'] as const,
  params: {
    m: stringParam(),                                    // 'mp-2375705'
    mp: stringParam({ decode: v => v ? `mp-${v}` : undefined }),  // '2375705' → 'mp-2375705'
  },
  merge: ({ m, mp }) => {
    if (m && mp && m !== mp) return new Error(`m=${m} conflicts with mp=${mp.slice(3)}`)
    return m ?? mp
  },
})
```

After mount, the URL is rewritten:

| input | after canonicalize |
|-------|--------------------|
| `?m=mp-2375705` | `?m=mp-2375705` (unchanged) |
| `?mp=2375705` | `?m=mp-2375705` (alias adopted, `mp` stripped) |
| `?m=mp-149&mp=2375705` | `?m=mp-149` (canonical wins, conflict warned) |
| (none) | `?` (undefined state) |

Writes via `setMaterialId('mp-1000020')` always update only the
canonical key (`m`), never the alias.

## Why a hook, not just docs for `cleanOnMount.deprecated`

`cleanOnMount.deprecated` handles step 1 (initial migration) but:

- Calling it "deprecated" misframes a permanent alias as legacy
- It doesn't migrate values that appear in the URL *later* (e.g. after
  a `history.pushState` from outside React)
- It can't model conflict (single migration function per key, no
  cross-key view)
- It returns a partial update record that's `cleanUrl`'d separately; no
  unified read-back to the consumer

A first-class hook keeps the multi-key model coherent across mount,
re-renders, and history navigation.

## Open questions

1. **Multi-state form?** ELvis only needs one logical value from two
   keys, but other consumers may want `useUrlAliases({ ... })` returning
   `[ { foo, bar }, setters ]`. Defer until a second consumer asks.
2. **Param record keyed by alias or by canonical?** The proposal keys
   `params` by URL key name (allowing different decoders per alias). An
   alternative is one `Param<T>` for the value and per-alias adapters,
   but it's less flexible (the `mp` case needs `'2375705' → 'mp-2375705'`,
   which is a per-alias transform). Keep per-alias as primary.
3. **Conflict semantics.** Should `merge` throwing skip the URL update
   too, or just lock the state to the previous value? Default: keep
   previous state, warn, leave URL untouched so the user can fix it.
   Open to feedback.
4. **Hash strategy.** Should `useUrlAlias` accept a `strategy` like the
   other hooks? Yes — same surface. Add to the input shape.
5. **`useUrlStates` integration.** Could `useUrlStates` accept an alias
   declaration inline (`{ m: { aliases: ['mp'], ... } }`) so all the
   params live together? Possibly nicer ergonomics for big spec
   objects, but `useUrlAlias` as a standalone hook is the smaller
   surface to ship first.

## Acceptance

- Tests for each row in the canonicalize table above.
- Test for conflict detection + each `onConflict` mode.
- README section under "Custom Params" with the ELvis recipe.
- ELvis migrates from a `useEffect`-based normalizer (currently being
  added in `pkgs/static/src/App.tsx`) to this hook in a follow-up.
