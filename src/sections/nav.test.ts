/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { navScroll, sectionInView, defaultReference, type NavSection } from './nav.js'
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
    // scrollY 1960 → progress 0.5 → yRef 525. a(400),b(500)≤525<c(850).
    stubGeometry(900, 3000, 1960, { a: 400, b: 500, c: 850 })
    expect(sectionInView(ids, defaultReference)).toBe('b')
  })
})

describe('isUserScroll', () => {
  it('a scroll with no reader input (programmatic, a layout clamp) is not the reader’s', () => {
    resetUserScroll()
    // Even in the page's first second (`performance.now()` near 0).
    expect([isUserScroll(5), isUserScroll(performance.now())]).toEqual([false, false])
  })
})
