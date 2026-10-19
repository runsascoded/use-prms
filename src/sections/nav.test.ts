/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navScroll, sectionInView, referenceLine, defaultReference, type NavSection } from './nav.js'
import { isUserScroll, resetUserScroll } from './userScroll.js'

const sec = (pathname: string, section = '', key = 'k0'): NavSection => ({ pathname, section, key })

describe('navScroll (ported from hashSpy, generalized to sections)', () => {
  it('breadcrumb root from a scrolled, sectioned bucket → the top, no section', () => {
    // The spy had named `tbl` (the router never saw it); the crumb pushes `/`.
    expect(navScroll(sec('/marin-us-central2', '', 'a'), sec('/', '', 'b'), 'PUSH', 'tbl', undefined))
      .toEqual({ kind: 'top' })
  })
  it('a stale router section is not carried: the crumb to `/` stays at the top even if the old entry named over-time', () => {
    expect(navScroll(sec('/marin-us-central2', 'over-time', 'a'), sec('/', '', 'b'), 'PUSH', 'tbl', undefined))
      .toEqual({ kind: 'top' })
  })
  it('a drill → the top', () => {
    expect(navScroll(sec('/b', '', 'a'), sec('/b/dir', '', 'b'), 'PUSH', 'diff', undefined))
      .toEqual({ kind: 'top' })
  })
  it('a link that names a section on another path scrolls to it', () => {
    expect(navScroll(sec('/b', '', 'a'), sec('/b/dir', 'over-time', 'b'), 'PUSH', '', undefined))
      .toEqual({ kind: 'section', id: 'over-time' })
  })
  it('back / forward restores the entry’s position, over its section', () => {
    expect(navScroll(sec('/', '', 'b'), sec('/marin-us-central2', 'tbl', 'a'), 'POP', '', 1840))
      .toEqual({ kind: 'restore', y: 1840 })
  })
  it('back to an entry with no saved position → its section, else the top', () => {
    expect(navScroll(sec('/', '', 'b'), sec('/b', 'diff', 'a'), 'POP', '', undefined))
      .toEqual({ kind: 'section', id: 'diff' })
    expect(navScroll(sec('/', '', 'b'), sec('/b', '', 'a'), 'POP', '', undefined))
      .toEqual({ kind: 'top' })
  })
  it('a deep link scrolls to its section; a reload restores the position', () => {
    expect(navScroll(null, sec('/b', 'tbl', 'default'), 'POP', 'tbl', undefined))
      .toEqual({ kind: 'section', id: 'tbl' })
    expect(navScroll(null, sec('/b', 'tbl', 'a'), 'POP', 'tbl', 920))
      .toEqual({ kind: 'restore', y: 920 })
    expect(navScroll(null, sec('/b', '', 'default'), 'POP', '', undefined))
      .toEqual({ kind: 'none' })
  })
  it('same-path param changes (`?d=`, use-prms re-syncing the router to the spy’s section) never move the page', () => {
    // use-prms pushes with the entry's state copied (same key) and fires a synthetic popstate.
    expect(navScroll(sec('/b', 'over-time', 'a'), sec('/b', 'tbl', 'a'), 'POP', 'tbl', 300))
      .toEqual({ kind: 'none' })
    // A legacy-param rewrite: REPLACE, a new key, the live section kept.
    expect(navScroll(sec('/b', '', 'a'), sec('/b', 'diff', 'c'), 'REPLACE', 'diff', undefined))
      .toEqual({ kind: 'none' })
    // Opening an object: same path, no section.
    expect(navScroll(sec('/b', '', 'a'), sec('/b', '', 'c'), 'PUSH', 'tbl', undefined))
      .toEqual({ kind: 'none' })
  })
  it('a same-path link to a section other than the live one scrolls to it', () => {
    expect(navScroll(sec('/b', '', 'a'), sec('/b', 'mtime', 'c'), 'PUSH', 'tbl', undefined))
      .toEqual({ kind: 'section', id: 'mtime' })
  })

  // New cases for the stale-carry rule.
  it('same-path carry (router still holds prev’s section while the reader moved on) → none', () => {
    // prev named `diff`, the spy has since named `mtime` (live); a navigate({ search })
    // carries `diff` back — the router has seen it, so it must not yank the page.
    expect(navScroll(sec('/b', 'diff', 'a'), sec('/b', 'diff', 'a'), 'PUSH', 'mtime', 300))
      .toEqual({ kind: 'none' })
  })
  it('path change carrying the previous entry’s section → top (section stripped)', () => {
    expect(navScroll(sec('/a', 'diff', 'a'), sec('/b', 'diff', 'b'), 'PUSH', 'diff', undefined))
      .toEqual({ kind: 'top' })
  })
})

type Tops = Record<string, number>
function stubGeometry(innerHeight: number, scrollHeight: number, scrollY: number, tops: Tops): void {
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
  vi.spyOn(document, 'getElementById').mockImplementation((id: string) =>
    tops[id] !== undefined ? ({ getBoundingClientRect: () => ({ top: tops[id] }) } as unknown as HTMLElement) : null)
}

describe('sectionInView', () => {
  afterEach(() => vi.restoreAllMocks())

  const ids = ['a', 'b', 'c'] as const

  it('names the last section whose top is at/above the header reference line', () => {
    // h=900 → near=150; mid-page (progress 0) → yRef=150. b(100)≤150<c(600).
    stubGeometry(900, 3000, 1000, { a: -500, b: 100, c: 600 })
    expect(sectionInView(ids, defaultReference)).toBe('b')
  })

  it('above topPx, no section is in view', () => {
    stubGeometry(900, 3000, 30, { a: -500, b: 100, c: 600 })
    expect(sectionInView(ids, defaultReference)).toBe('')
  })

  it('bottom slide names a trailing section that never reaches the header line', () => {
    // At the very bottom (progress 1) yRef slides to h=900; all three trailing
    // sections sit above 900, so the lowest (c) is named.
    stubGeometry(900, 3000, 2100, { a: 700, b: 800, c: 850 })
    expect(sectionInView(ids, defaultReference)).toBe('c')
  })

  it('mid-slide names the section the sliding line has reached', () => {
    // None of a/b/c reaches near=150 (tops at maxY 2100: 260, 360, 710), so the
    // slide spans scrollY 1820 → 2099 and ends at 711 (c's top + 1). At 1960,
    // progress 140/279 → yRef ≈ 431: a(400) ≤ 431 < b(500).
    stubGeometry(900, 3000, 1960, { a: 400, b: 500, c: 850 })
    expect(sectionInView(ids, defaultReference)).toBe('a')
  })
})

/** `"<scrollY>:<named>"` at each scrollY in `[0, maxY]` where the named section changes. */
function transitions(
  innerHeight: number,
  scrollHeight: number,
  absTops: Tops,
  ref = defaultReference,
): string[] {
  const out: string[] = []
  let last: string | undefined
  for (let y = 0; y <= scrollHeight - innerHeight; y++) {
    vi.restoreAllMocks()
    stubGeometry(innerHeight, scrollHeight, y, Object.fromEntries(Object.entries(absTops).map(([id, t]) => [id, t - y])))
    const s = sectionInView(Object.keys(absTops), ref)
    if (s !== last) out.push(`${y}:${s}`)
    last = s
  }
  return out
}

describe('sectionInView bottom slide', () => {
  afterEach(() => vi.restoreAllMocks())

  it('disky home page: a section reaching the line on its own is named only when it does', () => {
    // vh 1188, header 76 → near 226; maxY 825. `diff` (top 452 at maxY) can't
    // reach the line; `over-time` (157 at maxY) reaches it at scrollY 756. The
    // old rule (slide to the viewport bottom from 545) named over-time at 593
    // and diff at 660, with over-time's top still 322px down the screen.
    const ref = { ...defaultReference, offset: () => 76 }
    expect(transitions(1188, 2013, { 'tree-map': 98, tbl: 773, 'over-time': 982, diff: 1277 }, ref)).toEqual([
      '0:',
      '40:tree-map',
      '547:tbl',
      '756:over-time',
      '824:diff',
    ])
  })

  it('short trailing sections that never reach the line each get a turn, in order, the last at the bottom', () => {
    // vh 900 → near 150; maxY 2100. b/c/d sit at 300/450/600 at maxY.
    expect(transitions(900, 3000, { a: 1000, b: 2400, c: 2550, d: 2700 })).toEqual([
      '0:',
      '850:a',
      '1985:b',
      '2042:c',
      '2099:d',
    ])
  })

  it('no slide when every section reaches the line: each is named exactly as its top meets it', () => {
    expect(transitions(900, 3000, { a: 500, b: 1200, c: 2000 })).toEqual([
      '0:',
      '350:a',
      '1050:b',
      '1850:c',
    ])
  })
})

describe('referenceLine', () => {
  it('stays at near when every section reaches it', () => {
    expect(referenceLine([500, 1200, 2000], 2100, 2100, 150, 900, 280)).toBe(150)
  })

  it('ends 1px past the deepest top at the bottom (1px short of maxY counts as the bottom)', () => {
    expect(referenceLine([1000, 2400, 2700], 2099, 2100, 150, 900, 280)).toBe(601)
    expect(referenceLine([1000, 2400, 2700], 2099.4, 2100, 150, 900, 280)).toBe(601)
  })
})

describe('isUserScroll', () => {
  it('a scroll with no reader input (programmatic, a layout clamp) is not the reader’s', () => {
    resetUserScroll()
    // Even in the page's first second (`performance.now()` near 0).
    expect([isUserScroll(5), isUserScroll(performance.now())]).toEqual([false, false])
  })
})
