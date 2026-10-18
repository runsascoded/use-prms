/**
 * `datesParam`: a set of ISO dates in a URL, contracted to runs.
 *
 * The naive encoding of a week is ~90 chars of mostly redundant digits
 * (`?c=2026-08-18%2C…%2C2026-08-24`); this says the same in 9
 * (`?c=260818-24`). Three compressions, in order of how much they buy:
 *
 * 1. **Runs contract.** Calendar-consecutive days collapse to `start-end`.
 *    A week costs one token regardless of its length — and a week is the
 *    common case.
 * 2. **Digits are inherited.** Each token drops the leading digits it
 *    shares with the one before it: `260731 0805 24-25` is Jul 31, Aug 5,
 *    Aug 24–25 of 2026. A token is 2 (day), 4 (month-day), 6 (2-digit
 *    year), or 8 digits (full year, escape hatch for outside 2000–2099).
 *    The first token is never abbreviated.
 * 3. **The separator is a space.** `URLSearchParams` writes it as `+` and
 *    reads it back as a space, so the URL bar shows `?c=260731+0805+24-25`
 *    with nothing escaped. Decode also accepts a literal `+`, in case
 *    something hands the raw query string over un-decoded.
 *
 * Canonical form is sorted ascending and deduped — a URL is a cache key
 * and a thing people diff by eye. Empty set ⇒ `undefined` (param absent).
 *
 * Decoding is deliberately lenient: an unparseable token is skipped, not
 * thrown. This is a hand-editable URL and a typo should cost one day's
 * state rather than white-screening the page.
 *
 * ## Half-open ranges
 *
 * Pass `latest` and/or `genesis` to make ranges that touch the domain's
 * ends drop that end from the URL:
 *
 * - `latest`: a run whose *end* matches it encodes as `start-` (trailing
 *   dash). `?c=260818-` = "Aug 18 through today", and "today" is resolved
 *   fresh on every decode — so the URL keeps meaning "through today" as
 *   the calendar moves.
 * - `genesis`: a run whose *start* matches it encodes as `-end` (leading
 *   dash). `?c=-260824` = "from the beginning of the domain through Aug
 *   24".
 *
 * Both accept a `string` (fixed) or a `() => string` (resolved lazily on
 * each encode/decode). Encoded strings written without a matching option
 * decode to nothing — a half-open token with no anchor is a lenient
 * skip, same as any other malformed token.
 *
 * Single-day selections that land on `latest` or `genesis` still encode
 * as a single date (`260826`), never as `260826-` or `-260826` — a
 * lone-dash suffix on a single day would just be noise.
 *
 * The 6-digit `YYMMDD` form is a Y2K-shaped decision: it hard-codes the
 * 21st century. Dates outside 2000–2099 fall back to the 8-digit form
 * (`19991231 21000101`) — that path is untested by daily use, so treat it
 * as the escape hatch it is.
 *
 * Values are ISO `YYYY-MM-DD` strings, not `Date`s: `Date` is a timestamp
 * and a selected *day* is not one — round-tripping through `Date` invites
 * exactly the local-vs-UTC bug this param exists to avoid. Consumers who
 * want `Date`s can map.
 */

import type { Param } from './types.js'

const DAY_MS = 86_400_000
/**
 * Four token shapes, in one regex:
 *   `D-D`  both-ended range
 *   `D-`   right half-open (needs a `latest` in scope on decode)
 *   `-D`   left half-open (needs a `genesis` in scope on decode)
 *   `D`    single date
 * where `D` is 2, 4, 6, or 8 digits.
 */
const TOKEN = /^(?:(\d{2}|\d{4}|\d{6}|\d{8})-(\d{2}|\d{4}|\d{6}|\d{8})|(\d{2}|\d{4}|\d{6}|\d{8})-|-(\d{2}|\d{4}|\d{6}|\d{8})|(\d{2}|\d{4}|\d{6}|\d{8}))$/

/** ISO `YYYY-MM-DD` → UTC ms; `NaN` if the string isn't a well-formed ISO date. */
function ms(date: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN
}

function iso(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

/** Expand a 2/4/6/8-digit token against the date before it (as `YYYYMMDD` digits). */
function expand(token: string, prev: string | null): string | null {
  const full = token.length === 8 ? token
    : token.length === 6 ? `20${token}`
    : prev === null ? null
    : prev.replace(/-/g, '').slice(0, 8 - token.length) + token
  if (full === null) return null
  const date = `${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6)}`
  // Round-trip through the calendar so 0231 / 0000 are rejected rather than normalized
  const t = ms(date)
  return !isNaN(t) && iso(t) === date ? date : null
}

/** The shortest token for `date` that `expand` will read back, given `prev`. */
function contract(date: string, prev: string | null): string {
  const d = date.replace(/-/g, '')
  if (prev === null) return d.startsWith('20') ? d.slice(2) : d
  const p = prev.replace(/-/g, '')
  if (p.slice(0, 6) === d.slice(0, 6)) return d.slice(6)
  if (p.slice(0, 4) === d.slice(0, 4)) return d.slice(4)
  return d.startsWith('20') ? d.slice(2) : d
}

/**
 * A fixed ISO date, or a `() => ISO date` that's resolved lazily on every
 * encode/decode. Use the callback form when the anchor should track
 * "now" — e.g. `latest: () => new Date().toISOString().slice(0, 10)`.
 */
export type DateOrGetter = string | (() => string)

export interface DatesParamOptions {
  /**
   * If set, a run whose end matches this date encodes as `start-`, and a
   * `D-` token on decode expands to a range ending here.
   */
  latest?: DateOrGetter
  /**
   * If set, a run whose start matches this date encodes as `-end`, and a
   * `-D` token on decode expands to a range starting here.
   */
  genesis?: DateOrGetter
}

function resolve(d: DateOrGetter | undefined): string | undefined {
  const v = typeof d === 'function' ? d() : d
  return v !== undefined && !isNaN(ms(v)) ? v : undefined
}

/**
 * Encode a set of ISO dates. Sorted ascending, deduped, invalid entries
 * dropped. Empty result → `undefined` (param absent from the URL).
 *
 * With `options.latest` or `options.genesis`, runs whose end or start
 * matches contract to `start-` or `-end` respectively; the `latest` form
 * is preferred when both would apply. Single-day runs are never
 * half-open — a lone day at the boundary stays as its own date.
 */
export function encodeDates(dates: readonly string[], options: DatesParamOptions = {}): string | undefined {
  const sorted = [...new Set(dates)].map(ms).filter(t => !isNaN(t)).sort((a, b) => a - b)
  if (!sorted.length) return undefined
  // Contract calendar-consecutive days into runs before encoding either end
  const runs: [number, number][] = []
  for (const t of sorted) {
    const last = runs[runs.length - 1]
    if (last && t === last[1] + DAY_MS) last[1] = t
    else runs.push([t, t])
  }
  const latest = resolve(options.latest)
  const genesis = resolve(options.genesis)
  const latestMs = latest !== undefined ? ms(latest) : undefined
  const genesisMs = genesis !== undefined ? ms(genesis) : undefined
  const tokens: string[] = []
  let prev: string | null = null
  for (const [from, to] of runs) {
    const start = iso(from)
    if (to !== from && latestMs !== undefined && to === latestMs) {
      // D- : the end is `latest`, and the decoder will use `latest` as prev going forward
      tokens.push(`${contract(start, prev)}-`)
      prev = latest!
      continue
    }
    if (to !== from && genesisMs !== undefined && from === genesisMs) {
      // -D : the decoder uses `genesis` as prev to expand the end token
      const end = iso(to)
      tokens.push(`-${contract(end, genesis!)}`)
      prev = end
      continue
    }
    let token = contract(start, prev)
    prev = start
    if (to !== from) {
      const end = iso(to)
      token += `-${contract(end, prev)}`
      prev = end
    }
    tokens.push(token)
  }
  return tokens.join(' ')
}

/**
 * Decode a `datesParam` string to an ascending, deduped array of ISO
 * dates. Malformed tokens (unparseable, invalid calendar date, backwards
 * range, half-open with no matching anchor) are skipped rather than
 * thrown. Accepts both `' '` and `'+'` as separators.
 */
export function decodeDates(encoded: string | undefined, options: DatesParamOptions = {}): string[] {
  if (!encoded) return []
  const latest = resolve(options.latest)
  const genesis = resolve(options.genesis)
  const out: string[] = []
  let prev: string | null = null
  for (const token of encoded.split(/[\s+]+/).filter(Boolean)) {
    const m = TOKEN.exec(token)
    if (!m) continue
    const [, bothStart, bothEnd, startOnly, endOnly, single] = m
    let start: string | null = null
    let end: string | null = null
    if (single !== undefined) {
      start = expand(single, prev)
      end = start
    } else if (bothStart !== undefined) {
      start = expand(bothStart, prev)
      if (!start) continue
      end = expand(bothEnd, start)
    } else if (startOnly !== undefined) {
      if (latest === undefined) continue
      start = expand(startOnly, prev)
      if (!start) continue
      end = latest
    } else if (endOnly !== undefined) {
      if (genesis === undefined) continue
      start = genesis
      end = expand(endOnly, genesis)
    }
    if (!start || !end) continue
    // A backwards range is a typo, not an instruction to walk the calendar in reverse
    if (ms(end) < ms(start)) { out.push(start); prev = start; continue }
    for (let t = ms(start); t <= ms(end); t += DAY_MS) out.push(iso(t))
    prev = end
  }
  return [...new Set(out)]
}

/**
 * `use-prms` `Param` for a set of ISO dates. See module docs for the
 * encoding.
 *
 * @example
 * ```ts
 * const [dates, setDates] = useUrlState('c', datesParam())
 * // ?c=260818-24 → ['2026-08-18', ..., '2026-08-24']
 *
 * // With half-open anchors:
 * const today = () => new Date().toISOString().slice(0, 10)
 * const [dates, setDates] = useUrlState('c', datesParam({ latest: today }))
 * // ?c=260818- → Aug 18 through today (resolved on every decode)
 * ```
 */
export function datesParam(options: DatesParamOptions = {}): Param<string[]> {
  return {
    encode: dates => encodeDates(dates, options),
    decode: encoded => decodeDates(encoded, options),
  }
}
