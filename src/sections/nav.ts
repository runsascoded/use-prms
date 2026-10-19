/**
 * Pure navigation/scroll decisions for the section spy — no DOM state beyond
 * what's passed in, so they're unit-testable. Ported from disky's `hashSpy`
 * (`navScroll` / `sectionInView`), generalized from the URL fragment to a
 * mode-decoded "section" string (fragment or URL param), with a stale-carry
 * rule a router's own (stale) section can't trip.
 */

/** react-router's `useNavigationType()` values. */
export type NavType = 'POP' | 'PUSH' | 'REPLACE'

/**
 * A location reduced to what {@link navScroll} needs. `section` is the
 * mode-decoded section id (from the fragment or the section param), `''`
 * when the URL names none.
 */
export interface NavSection {
  pathname: string
  section: string
  /** History-entry key (react-router's `location.key`; `'default'` otherwise). */
  key: string
}

/** What a location change does to the scroll position. */
export type NavScroll =
  | { kind: 'none' }
  | { kind: 'top' }
  | { kind: 'section'; id: string }
  | { kind: 'restore'; y: number }

/**
 * Where a location change should put the page (pure, for tests).
 *
 * `live` is the section actually in the URL bar before the change — the spy's
 * last silent write, which the router never saw; `saved` is the position the
 * reader left `next.key`'s entry at, if any.
 *
 * The stale-carry rule (same path): the page moves only for a section the
 * router has *never* seen (`next.section !== live && next.section !== prev`),
 * so a `navigate({ search })` that carries the load-time section back while
 * the reader has scrolled past it is a no-op. On a path change, a `next`
 * section equal to `prev`'s is likewise a carry-over and is dropped (→ top).
 */
export function navScroll(
  prev: NavSection | null,
  next: NavSection,
  navType: NavType,
  live: string,
  saved: number | undefined,
): NavScroll {
  const target: NavScroll = next.section ? { kind: 'section', id: next.section } : { kind: 'none' }
  // First render: a reload (the entry has a position) or a deep link.
  if (!prev) return saved !== undefined ? { kind: 'restore', y: saved } : target
  const pathChanged = next.pathname !== prev.pathname
  if (navType === 'POP' && next.key !== prev.key) {
    // Back / forward to another entry: where it was left, else where its URL points.
    if (saved !== undefined) return { kind: 'restore', y: saved }
    return next.section ? target : pathChanged ? { kind: 'top' } : { kind: 'none' }
  }
  if (pathChanged) {
    // A section equal to the one we're leaving is a carry-over (the router
    // still holds the old entry's section): don't resurrect it on the new path.
    if (next.section && next.section === prev.section) return { kind: 'top' }
    return next.section ? target : { kind: 'top' }
  }
  // Same path (a param change, a legacy rewrite, use-prms re-syncing the
  // router to the spy's section): only an explicitly new section moves the page.
  return next.section !== live && next.section !== prev.section ? target : { kind: 'none' }
}

/** Reference-line geometry for {@link sectionInView}. */
export interface ReferenceLine {
  /** Height (px) of whatever sticks to the top; the line sits just below it. Default `() => 0`. */
  offset?: () => number
  /** Line sits `min(vh * nearFrac, nearPx)` below `offset`. Defaults 1/3, 150. */
  nearFrac?: number
  nearPx?: number
  /** Most scroll (px) the bottom slide may span. Default 280. */
  slidePx?: number
  /** Above this scrollY, no section is "in view" (URL section cleared). Default 40. */
  topPx?: number
}

export const defaultReference: Required<ReferenceLine> = {
  offset: () => 0,
  nearFrac: 1 / 3,
  nearPx: 150,
  slidePx: 280,
  topPx: 40,
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)

/**
 * The reference line's viewport y at scroll `y` (pure, for tests). It sits at
 * `near` (just under the header) except over a short window at the very
 * bottom, where it slides down to just past the deepest section top the page
 * end leaves on screen, giving the sections that can never reach `near` a
 * turn each, in order. The slide starts only after the last section that
 * *can* reach `near` has done so (and at most `slidePx` before the bottom),
 * so no section is named before its top meets the line on its own.
 *
 * `absTops` are document-space section tops. Within 1px of `maxY` counts as
 * the bottom: `maxY` comes from the integer `scrollHeight`, and a fractional
 * scroll can stop just short of it.
 */
export function referenceLine(
  absTops: readonly number[],
  y: number,
  maxY: number,
  near: number,
  h: number,
  slidePx: number,
): number {
  let deepest = -Infinity
  let reachEnd = -Infinity
  for (const abs of absTops) {
    const atBottom = abs - maxY
    if (atBottom > deepest) deepest = atBottom
    if (atBottom <= near) reachEnd = Math.max(reachEnd, abs - near)
  }
  const yEnd = Math.max(near, Math.min(h, deepest) + 1)
  const bottom = maxY - 1
  const start = Math.max(0, maxY - slidePx, reachEnd)
  if (yEnd <= near || start >= bottom) return y >= bottom ? yEnd : near
  return near + (yEnd - near) * clamp01((y - start) / (bottom - start))
}

/**
 * The section id the spy would name for the current scroll position, or `''`
 * at the very top: the last section (document order) whose top is at or
 * above the {@link referenceLine}.
 */
export function sectionInView(ids: readonly string[], ref: Required<ReferenceLine>): string {
  const h = window.innerHeight
  const y = window.scrollY
  const maxY = document.documentElement.scrollHeight - h
  const near = ref.offset() + Math.min(h * ref.nearFrac, ref.nearPx)
  const tops: [string, number][] = []
  for (const id of ids) {
    const el = document.getElementById(id)
    if (el) tops.push([id, el.getBoundingClientRect().top])
  }
  const yRef = referenceLine(tops.map(([, top]) => top + y), y, maxY, near, h, ref.slidePx)
  let cur = ''
  for (const [id, top] of tops) if (top <= yRef) cur = id
  return y < ref.topPx ? '' : cur
}
