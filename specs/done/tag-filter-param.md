# Add `tagFilterParam`: tri-state tag filter (in / out / off) with per-tag defaults

**Status: implemented.** Shipped as `tagFilterParam<T>(opts?)` + helpers
(`effectiveTagState`, `runPassesTagFilters`, `cycleTagFilter`,
`DEFAULT_TAG_CYCLE`) in `src/tagFilter.ts`; exported from `src/index.ts`.
Tests in `src/tagFilter.test.ts` (52 cases). README section under
"Tag Filters" + entries in the Built-in Param Types and a new Tag Filter
helpers table.

Implementation deltas vs the original spec below:

- **Validation surface**: there is no required `allTags` list at
  construction. Defaults' keys are validated (reject whitespace, reject
  names starting with a configured prefix). Tag names flowing through
  `encode` are validated at the same point, so `encode(new Map([['-bad',
  'in']]))` throws regardless of `T` typing.
- **Prefixes API**: `prefixes: { in?, out?, off? }` (defaults `''`/`'-'`/`'~'`)
  is implemented. `out` and `off` must be non-empty; all three must be
  distinct.
- **Decode is lenient**: redundant entries that match the per-tag
  default (e.g. `?tags=~CE` when CE defaults to `off`) are *kept* on
  decode so the diagnostics layer can flag the URL as `stale` and
  `cleanUrl({ stale: 'normalize' })` can normalize it away. Re-encoding
  strips them.
- **`+`-prefix shorthand**: bare-or-`+`-prefixed tokens decode to `'in'`
  (except when `prefixes.in` is set to `'+'` literally, in which case the
  `+` is taken as the configured prefix rather than the shorthand).
- **Tokens** are space-separated and the decoder tolerates any
  whitespace run (`\s+`), so it round-trips through `URLSearchParams`'
  `+`-as-space encoding cleanly.
- **`cycleTagFilter`**: accepts a fourth `cycle?: readonly TagState[]`
  argument, defaults to `DEFAULT_TAG_CYCLE = ['in', 'out', 'off']`. If
  the next state matches the per-tag default, the entry is *removed*
  from the returned Map so the URL stays minimal.



## Motivation

A common UI pattern: a strip of "tag chips" the user can toggle on/off to
filter a list of items. The natural shape is *not* a flat string list — each
tag has three states, and the URL should encode only **overrides of per-tag
defaults** so clean URLs stay clean.

Hand-rolled in `oa/tomat`'s `/runs` dashboard at
`site/src/runs/tags.ts` + `site/src/runs/RunsTimelinePlot.tsx` —
filed by the consumer that just built this. Worth promoting because:

1. **Three states per tag** distinguishes it from `stringArrayParam` /
   `stringListParam`. Each tag is independently `'in'` (must have),
   `'out'` (must not have), or `'off'` (don't care). A flat list of
   names can't represent the `out` state.
2. **Per-tag defaults**. In `tomat` the `bunk` tag defaults to `'out'`
   (auto-hide known-broken runs); everything else defaults to `'off'`.
   The URL stores only deviations from these defaults, so the common
   case (`?tags=CE`) doesn't have to carry `?-bunk` baggage.
3. **`use-prms` sign-as-delim numeric convention transfers cleanly to
   tag names.** Encoding: `'in'` tags bare, `'out'` tags `-`-prefixed,
   `'off'` tags `~`-prefixed (only when overriding a non-`off` default).
   `URLSearchParams` encodes the space as `+`, internal `+` as `%2B`:
   `{CE: 'in', bunk: 'off'}` round-trips as `?tags=CE+~bunk`.

## API

```typescript
import { tagFilterParam } from 'use-prms'

type RunTag = 'AR' | 'MaskGIT' | 'SS' | 'CE' | 'EMD' | 'CE+EMD'
            | 'production' | 'collapsed' | 'bunk' | 'smoke'
            | 'SS-sweep' | 'post-init-fix' | 'pre-init-fix'

const [filters, setFilters] = useUrlState('tags', tagFilterParam<RunTag>({
  defaults: { bunk: 'out' },  // any tag not listed defaults to 'off'
}))
// filters: Map<RunTag, 'in' | 'out' | 'off'>  — overrides only

// Helpers exposed off the param (or as standalone utilities):
import { effectiveTagState, runPassesTagFilters, cycleTagFilter } from 'use-prms'

effectiveTagState(filters, 'bunk', { bunk: 'out' })
// → 'out'  (the default, since `bunk` is absent from overrides)

runPassesTagFilters(item.tags, filters, { bunk: 'out' })
// → boolean — AND across all in/out constraints (defaults included)

cycleTagFilter(filters, 'CE', { bunk: 'out' })
// → new Map with CE advanced one step on the in → out → off → in cycle.
//   If the new effective state matches the default, the entry is removed
//   from the Map (so the URL stays minimal).
```

## URL grammar

- `?tags=CE` → CE in
- `?tags=-CE` → CE out
- `?tags=~bunk` → bunk explicitly off (overrides its `'out'` default)
- `?tags=+CE` → CE in (explicit `+` accepted on parse, normalized to bare on write)
- `?tags=CE+-foo+~bunk` → CE in, foo out, bunk off
- `?tags=` or param absent → all defaults

Within the URLSearchParams value, tokens are space-separated; the space
URL-encodes to `+`. Internal `+` in tag names (e.g. `CE+EMD`) encode as
`%2B`. Tag names with leading `-` or `~` or `+` would conflict with the
sign prefixes — `tagFilterParam` should validate the input tag-name set
at construction time and throw if any name starts with one of those
chars. (Or accept a `prefixes` option to customize.)

## Encode/decode round-trip examples

| Map state                          | URL encoding         |
| ---------------------------------- | -------------------- |
| `{}` (all defaults)                | (param absent)       |
| `{CE: 'in'}`                       | `?tags=CE`           |
| `{CE: 'in', EMD: 'out'}`           | `?tags=CE+-EMD`      |
| `{bunk: 'off'}`                    | `?tags=~bunk`        |
| `{CE: 'in', bunk: 'off'}`          | `?tags=CE+~bunk`     |
| `{CE+EMD: 'in'}`                   | `?tags=CE%2BEMD`     |

## Why not just `stringArrayParam` + a sibling exclude param?

`?include=CE,production&exclude=bunk&off=…` is uglier, has three params
sharing one mental concept, and forces the user to think about which
list a tag belongs to. The single-param sign-delim form is one trip
through `URLSearchParams.set('tags', ...)`.

It's also cycleable in a single click handler: hand the chip's
current effective state to `cycleTagFilter`, set the resulting Map.
Three-param shapes need three branches in the click handler.

## Implementation notes

- The Map type isn't strictly necessary — `Record<Tag, State>` works
  too. Map preserves insertion order which keeps the URL stable across
  user interactions (later-clicked tags appear later in the URL); a
  Record can't promise that. Either way, expose both as the param's
  state type or pick Map for the order guarantee.
- The defaults shape (`{tag: state}` Record) is small and immutable
  per param instance, so it can be passed in once at construction
  time. Don't try to expose a "default override" runtime hook;
  defaults are a property of the deployed app, not user state.
- For tests: the reference impl in `oa/tomat/site/src/runs/tags.ts`
  has the parse/serialize/cycle/effective/runPasses helpers as pure
  functions next to a `TAG_DEFAULTS: ReadonlyMap` constant — easy to
  port verbatim. Add table-driven tests covering: round-trip of every
  state combination, cycle through all 3 states for both
  default-`'off'` and default-`'out'` tags, the empty-Map case
  (defaults-only).

## Open questions

- **Naming**: `tagFilterParam` is descriptive but long. Alternatives:
  `triStateParam<T>`, `chipParam<T>`, `inOutOffParam<T>`. I lean
  `tagFilterParam` because the tri-state-with-defaults shape is
  specifically what makes this useful — "triState" alone is too vague.
- **Generic over the state type?** Could allow `'allow' | 'deny' | 'off'`
  or boolean-ish unions. Probably overkill — `'in' | 'out' | 'off'`
  is the natural vocabulary for tag filtering and matches the URL
  prefix glyphs (`+ - ~`). If someone wants different glyphs, expose
  `prefixes: { in?: string; out?: string; off?: string }` (default
  `{ in: '', out: '-', off: '~' }`).
- **Whitespace in tag names**: not allowed (space is the separator).
  Param constructor should validate.
- **Cycle direction configurable?** Today: `in → out → off → in`.
  Some consumers may want `off → in → out → off` (visit "in" first
  rather than directly going to "out"). The natural way: a
  `cycle?: TagState[]` array option, default `['in', 'out', 'off']`.
