/**
 * `tagFilterParam`: tri-state tag filter (in / out / off) with per-tag
 * defaults. URL encoding uses sign-prefix tokens — `'in'` bare, `'out'`
 * `-`-prefixed, `'off'` `~`-prefixed — joined by spaces (which
 * `URLSearchParams` encodes as `+`). Mirrors the sign-as-delim convention
 * `numberTupleParam` uses for signed numbers.
 *
 * Only *overrides* of per-tag defaults are encoded, so clean URLs stay
 * clean. Decoding is lenient: redundant entries that match the default
 * (or unknown tags) round-trip cleanly through `cleanUrl({ stale:
 * 'normalize' })`, but `decode` itself preserves them so callers can
 * detect/log non-canonical input via the diagnostics layer.
 */

import type { Param } from './index.js'

/**
 * Per-tag filter state.
 * - `'in'`: items must have this tag
 * - `'out'`: items must NOT have this tag
 * - `'off'`: no constraint (only ever stored as an *override* of a
 *           non-`off` default — see {@link cycleTagFilter})
 */
export type TagState = 'in' | 'out' | 'off'

/**
 * Overrides-only map of tag → state. A tag absent from the Map is
 * implicitly at its per-tag default (see {@link TagDefaults}). Using a
 * `Map` (rather than `Record`) preserves insertion order, which keeps
 * URLs stable across user interactions.
 */
export type TagFilters<T extends string = string> = Map<T, TagState>

/**
 * Per-tag default state. Tags absent here implicitly default to `'off'`.
 */
export type TagDefaults<T extends string = string> = Partial<Record<T, TagState>>

/**
 * Token prefixes used in the URL encoding. Each must be distinct; `out`
 * and `off` must be non-empty (the `in` prefix may be empty so bare tags
 * read as `in`).
 */
export interface TagPrefixes {
  /** Default: `''` (bare). */
  in?: string
  /** Default: `'-'`. */
  out?: string
  /** Default: `'~'`. */
  off?: string
}

export interface TagFilterParamOptions<T extends string> {
  /** Per-tag defaults. Tags not listed default to `'off'`. */
  defaults?: TagDefaults<T>
  /** Override the default URL prefixes. */
  prefixes?: TagPrefixes
}

const DEFAULT_PREFIXES: Required<TagPrefixes> = { in: '', out: '-', off: '~' }
/** Default cycle order used by {@link cycleTagFilter} when no explicit
 *  `cycle` is provided: `in → out → off → in`. */
export const DEFAULT_TAG_CYCLE: readonly TagState[] = ['in', 'out', 'off']

function validatePrefixes(p: Required<TagPrefixes>): void {
  if (p.out === '') throw new Error('tagFilterParam: prefixes.out must be non-empty')
  if (p.off === '') throw new Error('tagFilterParam: prefixes.off must be non-empty')
  const seen = new Set<string>()
  for (const [k, v] of Object.entries(p)) {
    if (seen.has(v)) throw new Error(`tagFilterParam: duplicate prefix ${JSON.stringify(v)} (${k})`)
    seen.add(v)
  }
}

function validateTagName(tag: string, p: Required<TagPrefixes>): void {
  if (/\s/.test(tag)) {
    throw new Error(`tagFilterParam: tag name ${JSON.stringify(tag)} contains whitespace`)
  }
  for (const [kind, prefix] of Object.entries(p) as [keyof TagPrefixes, string][]) {
    if (prefix !== '' && tag.startsWith(prefix)) {
      throw new Error(
        `tagFilterParam: tag name ${JSON.stringify(tag)} starts with reserved ${kind}-prefix ${JSON.stringify(prefix)}`
      )
    }
  }
}

function defaultStateOf<T extends string>(defaults: TagDefaults<T> | undefined, tag: T): TagState {
  return defaults?.[tag] ?? 'off'
}

/**
 * Effective state for `tag`: the override if present in `filters`,
 * otherwise the per-tag default.
 */
export function effectiveTagState<T extends string>(
  filters: TagFilters<T>,
  tag: T,
  defaults?: TagDefaults<T>,
): TagState {
  return filters.get(tag) ?? defaultStateOf(defaults, tag)
}

/**
 * Apply the (overrides + defaults) tag filter to an item's tags.
 * Returns true iff every constrained tag's `in`/`out` rule is satisfied
 * (`off` tags impose no constraint). Iterates the union of `filters`
 * keys and `defaults` keys — both can carry constraints.
 */
export function runPassesTagFilters<T extends string>(
  itemTags: readonly T[],
  filters: TagFilters<T>,
  defaults?: TagDefaults<T>,
): boolean {
  const constrained = new Set<T>([
    ...filters.keys(),
    ...((defaults ? Object.keys(defaults) : []) as T[]),
  ])
  for (const tag of constrained) {
    const state = effectiveTagState(filters, tag, defaults)
    if (state === 'off') continue
    const has = itemTags.includes(tag)
    if (state === 'in' && !has) return false
    if (state === 'out' && has) return false
  }
  return true
}

/**
 * Advance `tag` one step around `cycle` (default `in → out → off → in`).
 * If the resulting state matches the tag's default, the entry is
 * *removed* from the Map (so the URL stays minimal). Returns a fresh
 * `Map`; never mutates the input.
 */
export function cycleTagFilter<T extends string>(
  filters: TagFilters<T>,
  tag: T,
  defaults?: TagDefaults<T>,
  cycle: readonly TagState[] = DEFAULT_TAG_CYCLE,
): TagFilters<T> {
  if (cycle.length === 0) throw new Error('cycleTagFilter: cycle must be non-empty')
  const current = effectiveTagState(filters, tag, defaults)
  const idx = cycle.indexOf(current)
  const next = idx === -1 ? cycle[0] : cycle[(idx + 1) % cycle.length]
  const defaultState = defaultStateOf(defaults, tag)
  const out = new Map(filters)
  if (next === defaultState) out.delete(tag)
  else out.set(tag, next)
  return out
}

/**
 * Create a {@link Param} for tri-state tag filters. See module docs.
 *
 * @example
 * ```ts
 * type RunTag = 'CE' | 'EMD' | 'bunk'
 * const [filters, setFilters] = useUrlState(
 *   'tags',
 *   tagFilterParam<RunTag>({ defaults: { bunk: 'out' } }),
 * )
 * // ?tags=CE+~bunk → Map([['CE', 'in'], ['bunk', 'off']])
 * ```
 */
export function tagFilterParam<T extends string>(
  options: TagFilterParamOptions<T> = {},
): Param<TagFilters<T>> {
  const prefixes: Required<TagPrefixes> = { ...DEFAULT_PREFIXES, ...options.prefixes }
  validatePrefixes(prefixes)

  const defaults = options.defaults
  if (defaults) {
    for (const tag of Object.keys(defaults)) validateTagName(tag, prefixes)
  }

  // Longest prefix first so e.g. a custom `out: '--'` doesn't get parsed
  // as `in` + `-`-prefixed.
  const orderedPrefixes: [TagState, string][] = (['out', 'off', 'in'] as const)
    .map(s => [s, prefixes[s]] as [TagState, string])
    .sort((a, b) => b[1].length - a[1].length)

  function encodeToken(tag: T, state: TagState): string {
    validateTagName(tag, prefixes)
    return prefixes[state] + tag
  }

  function classifyToken(tok: string): { state: TagState; tag: T } | null {
    // Tolerate (and normalize) an explicit `+` prefix — common shorthand
    // for `in`. Only meaningful when the `in` prefix isn't already `+`.
    if (prefixes.in !== '+' && tok.startsWith('+')) {
      const tag = tok.slice(1)
      if (!tag) return null
      return { state: 'in', tag: tag as T }
    }
    for (const [state, prefix] of orderedPrefixes) {
      if (prefix === '' || tok.startsWith(prefix)) {
        const tag = prefix === '' ? tok : tok.slice(prefix.length)
        if (!tag) return null
        return { state, tag: tag as T }
      }
    }
    return null
  }

  return {
    encode(filters: TagFilters<T>): string | undefined {
      const parts: string[] = []
      for (const [tag, state] of filters) {
        if (state === defaultStateOf(defaults, tag)) continue
        parts.push(encodeToken(tag, state))
      }
      if (parts.length === 0) return undefined
      return parts.join(' ')
    },
    decode(encoded: string | undefined): TagFilters<T> {
      const out: TagFilters<T> = new Map()
      if (!encoded) return out
      for (const tok of encoded.split(/\s+/)) {
        if (!tok) continue
        const c = classifyToken(tok)
        if (!c) continue
        out.set(c.tag, c.state)
      }
      return out
    },
  }
}
