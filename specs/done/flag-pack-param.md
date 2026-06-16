# Flag-pack param: collapse N boolean flags into one URL key

**Status:** implemented as `flagPackParam` in `src/flagPack.ts`.

## Implementation deltas

- Decode is greedy longest-prefix match over the spec's keys — so multi-character flag names (`{ AB: true, A: true }`) decompose unambiguously. The spec's Open question 2 ("multi-char tokens out of scope") is therefore not enforced; it just isn't documented as a recommended pattern.
- Construction-time validation: throws on empty-string flag names; no `duplicate-flag` check needed (object keys are inherently unique).
- Unknown-letter handling: silently skipped (per the spec's "ignore + report" default). The diagnostics-layer integration falls out of the existing `inspectUrl`/`stale` machinery, no `onUnknownFlag` callback added.
- No optional `useFlagPack` hook shipped; consumers use `useUrlState('_', flagPackParam({...}))` directly (Open question deferred per the spec).
- Exports `FlagPackSpec` and `FlagPackValues<S>` type aliases alongside the factory.
- Demo: integrated into the kitchen-sink demo page (`site/src/components/ParamsDemo.tsx`) with the six post-§7 ELvis toggles `Z H A C L E` packed under `?_=…`. Same row added to the `/hash` variant. Verified live: `?_=ZH` decodes to `{Z:false, H:false, A:true, ...}`; clicking C flips it to `?_=ZHC` (declaration-order canonicalization).

## Motivation

When a URL has many small boolean toggles, each rides as a separate
key — even with single-letter keys (per the use-prms terseness ethos),
the URL still grows fast:

```
?Z&H&A&C&L
```

A flag-pack collapses them into one key whose value is the concatenated
set of "non-default" letters:

```
?_=ZHACL
```

Each character is one flag. Presence in the pack means the flag is in
its *non-default* state (so the default-encoding is `?` with no flag
key at all — full canonicalization, same as `boolTrueParam`/`boolParam`
already promise individually).

ELvis is the prototypical case (post-§7 rename in
`elvis/specs/tomat-pred-zarrs-available.md`): toggles `Z H A C L E` are
all `boolTrueParam` (default-on, present = off). Packing them halves
URL length and groups them visually — easier to spot "what's off?" at a
glance.

## Prior art inside `use-prms`

- `boolParam` / `boolTrueParam` — one flag per key. Building block.
- `multiStringParam` — one key, repeated. Different problem.
- `numberTupleParam` — N values packed into one key with a separator.
  Same shape of idea ("N things, one URL slot") but values are typed
  and ordered, not a set of presence bits.

Flag-pack sits between `boolParam` and `numberTupleParam`: many typed
booleans collapsed into one key, indexed by name.

## Proposal: `flagPackParam`

```ts
type FlagPackSpec = Record<string, boolean>  // flag letter → default

function flagPackParam<S extends FlagPackSpec>(spec: S): Param<{
  [K in keyof S]: boolean
}>
```

Each entry in `spec` is `<letter>: <default>`. The returned `Param`
encodes the current flag record by listing only the letters whose
current value differs from their default, in declaration order. Decode
parses the same format.

### Usage

```ts
const flagsParam = flagPackParam({
  Z: true,   // default on; ?_=Z means Z=false
  H: true,
  A: true,
  C: true,
  L: true,
  E: true,
})

const [flags, setFlags] = useUrlState('_', flagsParam)
// flags: { Z: boolean, H: boolean, A: boolean, C: boolean, L: boolean, E: boolean }
// initial URL `?_=ZH` → flags = { Z: false, H: false, A: true, C: true, L: true, E: true }

setFlags({ ...flags, A: false })
// URL becomes `?_=ZHA` (Z,H stayed off; A turned off; rest default)
```

### Encoding table

| spec | flags | encoded |
|------|-------|---------|
| all defaults | `{Z:t, H:t, A:t, C:t, L:t, E:t}` | (absent; canonical) |
| `Z` off | `{Z:f, H:t, ...}` | `Z` |
| `Z` and `H` off | `{Z:f, H:f, A:t, ...}` | `ZH` |
| Mixed-default: `Z` default-on flipped off, hypothetical `G` default-off flipped on | as above + `G:t` | `ZG` |

Declaration order is the canonical order — `?_=HZ` and `?_=ZH` both
decode the same, but encode produces `?_=ZH` (spec-declared order).
`cleanUrl` then resolves stale `?_=HZ` → `?_=ZH`.

### Conflicts and edge cases

- **Unknown letters in pack**: ignore + report via existing
  `inspectUrl` `unrecognized`/`stale` machinery. Decoding does *not*
  throw. Open question: separate `onUnknownFlag` callback, or piggyback
  on existing diagnostics? Default: piggyback.
- **Duplicate letters**: `?_=ZZ` decodes as Z=non-default (idempotent).
  Encode never emits dupes.
- **Empty pack**: `?_=` decodes as "all default" (same as `?`),
  `cleanUrl` strips it.
- **Case**: case-sensitive. `Z` and `z` are different flags. Consumers
  can declare both if they want a mixed-case scheme.
- **Letter set collisions with single-key flags**: a flag in the pack
  *doesn't* collide with a same-named single key; they're separate URL
  keys. But maintainers should pick one model per flag and stick with
  it — `useUrlState('Z', boolTrueParam)` and `flagPackParam({Z: true})`
  on the same page would split state. Documentation, not enforcement.

## API surface

```ts
export function flagPackParam<S extends FlagPackSpec>(spec: S): Param<{ [K in keyof S]: boolean }>
```

That's the whole new export. It composes with `useUrlState` —
no new hook needed. (Consumers reach for `useUrlAlias` only if they
want to pack flags under multiple key spellings, which seems unlikely
but composes correctly.)

### Optional: convenience hook `useFlagPack`

If consumers find `useUrlState('_', flagPackParam({...}))` too verbose,
a thin wrapper:

```ts
export function useFlagPack<S extends FlagPackSpec>(
  key: string,
  spec: S,
  options?: UseUrlStateOptions,
): [{ [K in keyof S]: boolean }, (v: { [K in keyof S]: boolean }) => void]
```

Reduces boilerplate but adds no new capability. Defer until a second
consumer asks.

## Why not just `boolParam` per flag?

- URL length. Six default-on toggles all flipped: `?Z&H&A&C&L&E` (12
  chars) vs `?_=ZHACLE` (10). Modest. With 10+ flags the win is
  larger.
- Visual grouping. One key communicates "this is the flag bag";
  individual letters communicate "and here's what's off". Easier to
  diff two URLs by eye.
- Doesn't break: existing single-letter flag URLs still parse if you
  keep declaring those `useUrlState` calls. Migration is per-flag.

## Why not a bitmask integer (`?_=42`)?

- Not human-editable. Letter packs let users tweak by hand
  (`?_=ZHA` → `?_=ZH` is obvious; `42 → 38` is not).
- Letter packs survive flag-set evolution; reordering bits in a mask
  breaks old URLs.

## Acceptance

- `flagPackParam` round-trips for: all-default, single non-default,
  multi non-default, declaration-order canonicalization,
  ignore-unknown.
- `cleanUrl` strips empty pack (`?_=`) and reorders mis-ordered values
  (`?_=HZ` → `?_=ZH`).
- README section under "Built-in Param Types" with the ELvis recipe
  (the six post-§7 toggles).
- ELvis migrates `Z H A C L E` to a single `flagPackParam` in a
  follow-up (after this ships).

## Open questions

1. **Key character**: spec uses `_` as the example. `?_=ZH` reads
   fine, doesn't collide with most schemes. Alternative: `f` ("flags").
   Choice is per-consumer (the param is just `useUrlState(<key>, ...)`).
   No use-prms-side decision needed.
2. **Multi-character flag tokens**? `?_=ZH-on` for flags whose names
   are longer than one char. Out of scope; if needed, the user should
   keep those as separate keys or use a different schema.
3. **Integration with `useUrlAlias`**: a flag pack under an alias
   (`?_=ZH` or `?flags=ZH`) is fine — `useUrlAlias` wraps any Param.
   No new work, just docs.
