/**
 * The section spy: a page's in-view section (named in the URL fragment, or in
 * a URL param so a dOGI can see it) and its scroll position across navigation.
 * Ported from disky's `hashSpy`, generalized to fragment OR param mode.
 *
 * One spy per page (module-level state, as in `hashSpy`); a second concurrent
 * mount warns in dev. The spy writes the URL with the *unpatched* History API
 * (`silentReplaceState`), so a per-frame write never re-renders a `useUrlState`
 * consumer; the section it names is published through {@link useSectionInView}.
 */
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { getDefaultStrategy, hashStrategy, silentPushState, silentReplaceState } from '../core.js'
import { parseMultiParams, serializeMultiParams } from '../core.js'
import { navScroll, sectionInView, defaultReference, type NavScroll, type NavSection, type NavType, type ReferenceLine } from './nav.js'
import { INPUT_EVENTS, isUserScroll, lastInputAt, markUserScroll, onInput, resetUserScroll } from './userScroll.js'

export type { NavType, NavScroll, NavSection, ReferenceLine } from './nav.js'
export { navScroll, sectionInView } from './nav.js'
export { isUserScroll, resetUserScroll } from './userScroll.js'

/** A location reduced to what the spy reads: the full URL parts + the history key. */
export interface NavLocation {
  pathname: string
  search: string
  hash: string
  /** History-entry key (react-router's `location.key`; `'default'` for an entry it didn't create). */
  key: string
}

/** The navigation source: a location + how it was reached. */
export interface NavSource {
  location: NavLocation
  navType: NavType
}

/** Where the section lives in the URL and how its id maps to the stored value. */
export type SectionMode =
  | { kind: 'fragment' }
  | {
      kind: 'param'
      /** URL key holding the section. Default `'s'`. */
      key?: string
      /** Where the param lives. Default `'query'`, even under `use-prms/hash` (dOGI visibility). */
      location?: 'query' | 'hash'
      /** Section id ↔ param value, e.g. strip a `section-` prefix: `?s=boolean` ↔ `section-boolean`. */
      encode?: (id: string) => string
      decode?: (value: string) => string
      /** Adopt an incoming `#id` fragment that names a known section into the param, then drop it. Default true. */
      adoptFragment?: boolean
    }

export interface SectionSpyOptions {
  /** Section ids in page order, OR a selector to discover them (document order; id from `data-section`, else `id`). */
  sections?: readonly string[] | { selector: string }
  /** Default `{ kind: 'fragment' }` under `use-prms`; refused under `use-prms/hash` (see resolution). */
  mode?: SectionMode
  /** What reader scrolling does to the URL. `'replace'` (default) names the in-view section; `'off'` only saves/restores positions. */
  write?: 'replace' | 'off'
  /** History op for an explicit jump. Default `'replace'`; `'push'` makes Back return to the pre-jump position. */
  jumpWrite?: 'replace' | 'push'
  reference?: ReferenceLine
  /** Scroll-position persistence per history entry. `false` disables restore. */
  positions?: { storage?: 'session' | 'local'; key?: string; max?: number } | false
  /** How long a deep link / restore keeps pursuing its target (ms). Default 20_000. */
  pursuitMs?: number
  /** Retired ids → current ids. Applied to incoming fragments and params; the URL is rewritten to the current id. */
  aliases?: Record<string, string>
  /** Re-arms a still-pending deep link / restore as content lands. */
  deps?: readonly unknown[]
  /** Router adapter. Default {@link useWindowNav}. */
  nav?: NavSource
}

const NUDGE_MS = 250
const WRITE_THROTTLE_MS = 100
const DEFAULT_POS = { storage: 'session' as const, key: 'use-prms:sections:pos', max: 200 }

// ----- The in-view section store (also the spy's "live" URL section) -----

let liveSection = ''
const sectionListeners = new Set<() => void>()

function publishSection(s: string): void {
  if (s === liveSection) return
  liveSection = s
  for (const cb of sectionListeners) cb()
}

/** The section currently named in the URL (or `''`), as a store: re-renders only when it changes, never per scroll frame. */
export function useSectionInView(): string {
  return useSyncExternalStore(
    cb => { sectionListeners.add(cb); return () => { sectionListeners.delete(cb) } },
    () => liveSection,
    () => '',
  )
}

// ----- Active-spy config, for the standalone jump / href helpers -----

let currentMode: SectionMode = { kind: 'fragment' }
let currentJumpWrite: 'replace' | 'push' = 'replace'
let currentAliases: Record<string, string> = {}

// ----- Mode: decode the section from a location, build a URL that names one -----

const stripLead = (s: string): string => s.replace(/^[?#]/, '')

function decodeSection(mode: SectionMode, loc: NavLocation): string {
  if (mode.kind === 'fragment') {
    const id = loc.hash ? stripLead(loc.hash) : ''
    return currentAliases[id] ?? id
  }
  const raw = (mode.location ?? 'query') === 'hash' ? loc.hash : loc.search
  const v = parseMultiParams(stripLead(raw))[mode.key ?? 's']?.[0]
  if (!v) return ''
  const id = mode.decode ? mode.decode(v) : v
  return currentAliases[id] ?? id
}

/** Mutate `url` so it names section `id` (mode-aware), or clears it when `id` is `''`. */
function applySection(url: URL, mode: SectionMode, id: string): void {
  if (mode.kind === 'fragment') {
    url.hash = id ? `#${id}` : ''
    return
  }
  const key = mode.key ?? 's'
  const value = id ? (mode.encode ? mode.encode(id) : id) : ''
  const inHash = (mode.location ?? 'query') === 'hash'
  const params = parseMultiParams(stripLead(inHash ? url.hash : url.search))
  if (value) params[key] = [value]
  else delete params[key]
  const serialized = serializeMultiParams(params)
  if (inHash) url.hash = serialized ? `#${serialized}` : ''
  else url.search = serialized ? `?${serialized}` : ''
}

/** The current URL (relative) with the section set to `id` (mode-aware), or cleared when `id` is `''`. */
function sectionUrl(mode: SectionMode, id: string, pathname?: string): string {
  const url = new URL(window.location.href)
  if (pathname !== undefined) url.pathname = pathname
  applySection(url, mode, id)
  return url.pathname + url.search + url.hash
}

/** The adoption URL: the section in its param form, with the adopted fragment dropped. */
function adoptedUrl(mode: SectionMode, id: string): string {
  const url = new URL(window.location.href)
  url.hash = ''
  applySection(url, mode, id)
  return url.pathname + url.search + url.hash
}

function writeSection(mode: SectionMode, id: string, op: 'replace' | 'push'): void {
  publishSection(id)
  const url = sectionUrl(mode, id)
  ;(op === 'push' ? silentPushState : silentReplaceState)(history.state, '', url)
}

// ----- Standalone helpers (use the active spy's mode) -----

const parkedAt = (el: Element): number => parseFloat(getComputedStyle(el).scrollMarginTop) || 0

function focusSection(el: HTMLElement): void {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  try { el.focus({ preventScroll: true }) } catch { /* focus best-effort */ }
  el.setAttribute('data-section-target', '')
}

/** Smooth-scroll to `id`'s parked position, focus it, and name it in the URL (mode-aware). */
export function jumpToSection(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  resetUserScroll()
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  focusSection(el)
  writeSection(currentMode, id, currentJumpWrite)
}

/** The current URL with the section set to `id` (mode-aware), for `href`s, copy-link buttons, share sheets. */
export function sectionHref(id: string, opts?: { pathname?: string }): string {
  return sectionUrl(currentMode, id, opts?.pathname)
}

/** `search` (or a `URLSearchParams`-ish string) minus the section param (param mode only; fragment mode returns it unchanged). */
export function withoutSection(search: string): string {
  if (currentMode.kind !== 'param' || (currentMode.location ?? 'query') === 'hash') return search
  const params = parseMultiParams(stripLead(search))
  delete params[currentMode.key ?? 's']
  const s = serializeMultiParams(params)
  return s ? `?${s}` : ''
}

/** Heading link: plain click → {@link jumpToSection}; modified / middle click → native, via {@link sectionHref}. */
export function SectionLink({ id, className, children }: { id: string; className?: string; children: ReactNode }): ReactElement {
  return (
    <a
      className={className}
      href={sectionHref(id)}
      onClick={e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        jumpToSection(id)
      }}
    >{children}</a>
  )
}

// ----- Positions -----

type PosConfig = { storage: 'session' | 'local'; key: string; max: number } | null

function store(cfg: PosConfig): Storage | null {
  if (!cfg || typeof window === 'undefined') return null
  try { return cfg.storage === 'local' ? window.localStorage : window.sessionStorage } catch { return null }
}
function loadPositions(cfg: PosConfig): Record<string, number> {
  const s = store(cfg)
  if (!s || !cfg) return {}
  try { return JSON.parse(s.getItem(cfg.key) ?? '{}') as Record<string, number> } catch { return {} }
}
function savePosition(cfg: PosConfig, key: string, y: number): void {
  const s = store(cfg)
  if (!s || !cfg) return
  try {
    const all = loadPositions(cfg)
    all[key] = Math.round(y)
    const keys = Object.keys(all)
    if (keys.length > cfg.max) for (const k of keys.slice(0, keys.length - cfg.max)) delete all[k]
    s.setItem(cfg.key, JSON.stringify(all))
  } catch { /* storage off: back/forward falls back to the URL's section */ }
}
function savedPosition(cfg: PosConfig, key: string): number | undefined {
  return loadPositions(cfg)[key]
}

// ----- Entry keys (for the entry the page loaded into) -----

function entryKey(routerKey: string): string {
  if (routerKey !== 'default') return routerKey
  const st = (history.state ?? {}) as { upKey?: string }
  if (st.upKey) return st.upKey
  const upKey = `up-${Math.random().toString(36).slice(2, 10)}`
  silentReplaceState({ ...st, upKey }, '', window.location.href)
  return upKey
}

// ----- Mode resolution -----

function resolveMode(mode: SectionMode | undefined): { mode: SectionMode | null; warn?: string } {
  const hashEntry = getDefaultStrategy() === hashStrategy
  if (!mode) {
    if (hashEntry) return { mode: null, warn: 'useSectionSpy: no default mode under use-prms/hash (the fragment holds params). Pass mode: { kind: "param" }. Spy inert.' }
    return { mode: { kind: 'fragment' } }
  }
  if (mode.kind === 'fragment' && hashEntry) {
    return { mode: null, warn: 'useSectionSpy: fragment mode refused under use-prms/hash (the fragment holds params). Spy inert.' }
  }
  return { mode }
}

function resolveIds(sections: SectionSpyOptions['sections']): string[] {
  if (!sections) sections = { selector: '[data-section]' }
  if (Array.isArray(sections)) return [...sections]
  const sel = (sections as { selector: string }).selector
  return [...document.querySelectorAll(sel)].map(el => el.getAttribute('data-section') || el.id).filter(Boolean)
}

// ----- useWindowNav: the default adapter when no router is passed -----

/** `window.location` + `popstate`, with entry keys stamped into `history.state`. Best-effort `navType` (POP for popstate). */
export function useWindowNav(): NavSource {
  const [, force] = useReducer((c: number) => c + 1, 0)
  const navTypeRef = useRef<NavType>('POP')
  useEffect(() => {
    const onPop = () => { navTypeRef.current = 'POP'; force() }
    const onChange = () => { navTypeRef.current = 'REPLACE'; force() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('use-prms:locationchange', onChange)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('use-prms:locationchange', onChange)
    }
  }, [])
  const { pathname, search, hash } = typeof window !== 'undefined'
    ? window.location
    : { pathname: '/', search: '', hash: '' }
  const location = useMemo<NavLocation>(
    () => ({ pathname, search, hash, key: 'default' }),
    [pathname, search, hash],
  )
  return { location, navType: navTypeRef.current }
}

let mountedSpies = 0

export function useSectionSpy(opts: SectionSpyOptions = {}): void {
  const windowNav = useWindowNav()
  const nav = opts.nav ?? windowNav
  const { location, navType } = nav

  const resolved = useMemo(() => resolveMode(opts.mode), [opts.mode])
  const mode = resolved.mode
  const write = opts.write ?? 'replace'
  const jumpWrite = opts.jumpWrite ?? 'replace'
  const aliases = opts.aliases ?? {}
  const pursuitMs = opts.pursuitMs ?? 20_000
  const posCfg: PosConfig = opts.positions === false
    ? null
    : { ...DEFAULT_POS, ...opts.positions }
  const reference: Required<ReferenceLine> = { ...defaultReference, ...opts.reference }
  const deps = opts.deps ?? []

  // Publish active config for the standalone helpers.
  currentMode = mode ?? { kind: 'fragment' }
  currentJumpWrite = jumpWrite
  currentAliases = aliases

  const prev = useRef<NavSection | null>(null)
  const keyRef = useRef('')
  const target = useRef<NavScroll>({ kind: 'none' })
  const stopPursuit = useRef<() => void>(() => {})

  // Warn when the mode could not be resolved (e.g. fragment mode under
  // use-prms/hash): the spy is inert, so say why.
  useEffect(() => {
    if (resolved.warn) console.warn(resolved.warn)
  }, [resolved.warn])

  // Dev warning for a second concurrent spy.
  useEffect(() => {
    mountedSpies += 1
    if (mountedSpies > 1) {
      console.warn('useSectionSpy: more than one spy mounted; only one per page is supported.')
    }
    return () => { mountedSpies -= 1 }
  }, [])

  const idsFor = (): string[] => resolveIds(opts.sections)

  const pursue = (): void => {
    stopPursuit.current()
    const t = target.current
    if (t.kind !== 'section' && t.kind !== 'restore') return
    const id = t.kind === 'section' ? (aliases[t.id] ?? t.id) : ''
    let last = NaN
    let lastH = NaN
    let tries = 0
    const step = (): boolean => {
      const h = document.documentElement.scrollHeight
      if (t.kind === 'restore') {
        if (Math.abs(window.scrollY - t.y) < 2 && h === lastH) return true
        lastH = h
        window.scrollTo({ top: t.y, behavior: 'instant' })
        return false
      }
      const el = document.getElementById(id)
      if (!el) return false
      const top = el.getBoundingClientRect().top
      if (Math.abs(top - parkedAt(el)) < 4 && top === last && h === lastH) { focusSection(el); return true }
      last = top
      lastH = h
      el.scrollIntoView({ behavior: 'instant', block: 'start' })
      return false
    }
    const stop = (): void => {
      clearInterval(iv)
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, cancel)
      stopPursuit.current = () => {}
    }
    const cancel = (e: Event): void => {
      onInput(e)
      if (performance.now() - lastInputAt() > 50) return
      target.current = { kind: 'none' }
      stop()
    }
    const iv = setInterval(() => { if (++tries > pursuitMs / NUDGE_MS || step()) stop() }, NUDGE_MS)
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, cancel, { passive: true })
    stopPursuit.current = stop
    step()
  }

  // Each location change: decide, before paint, where the page should be.
  useLayoutEffect(() => {
    if (!mode) return
    const from = prev.current
    let next: NavSection = { pathname: location.pathname, section: decodeSection(mode, location), key: location.key }

    // On first render in param mode, adopt a `#id` fragment that names a known
    // section (or alias) into the param, then drop the fragment.
    if (!from && mode.kind === 'param' && (mode.adoptFragment ?? true) && location.hash) {
      const frag = stripLead(location.hash)
      const canonical = aliases[frag] ?? frag
      const hashEntry = getDefaultStrategy() === hashStrategy
      const looksLikeParams = /[=&]/.test(frag)
      if (!looksLikeParams && (!hashEntry) && idsFor().includes(canonical)) {
        next = { ...next, section: canonical }
        publishSection(canonical)
        silentReplaceState(history.state, '', adoptedUrl(mode, canonical))
      }
    }

    const curLive = from ? liveSection : next.section
    const k = entryKey(location.key)
    const act = navScroll(from, next, navType, curLive, savedPosition(posCfg, k))
    prev.current = next
    keyRef.current = k
    liveSection = next.section
    publishSection(next.section)
    if (act.kind === 'none') {
      // Reconcile: if the router carries a stale section, rewrite the URL back to live.
      if (next.section !== liveSection) silentReplaceState(history.state, '', sectionUrl(mode, liveSection))
      return
    }
    resetUserScroll()
    target.current = act
    if (act.kind === 'top') {
      stopPursuit.current()
      window.scrollTo({ top: 0, behavior: 'instant' })
      publishSection('')
      liveSection = ''
      if (next.section) silentReplaceState(history.state, '', sectionUrl(mode, ''))
      savePosition(posCfg, k, 0)
      return
    }
    pursue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search, location.hash])

  // Late content re-arms a still-pending target.
  useEffect(() => {
    if (target.current.kind === 'section' || target.current.kind === 'restore') pursue()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => () => stopPursuit.current(), [])

  // Scroll spy: name the in-view section, save positions — reader scroll only.
  useEffect(() => {
    if (!mode) return
    const prevRestoration = history.scrollRestoration
    history.scrollRestoration = 'manual'
    let raf = 0
    let lastWrite = 0
    const onScroll = (): void => {
      const now = performance.now()
      if (!isUserScroll(now)) return
      markUserScroll(now)
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        savePosition(posCfg, keyRef.current, window.scrollY)
        if (write === 'off') return
        const id = sectionInView(idsFor(), reference)
        if (id === liveSection) return
        if (performance.now() - lastWrite < WRITE_THROTTLE_MS) return
        lastWrite = performance.now()
        writeSection(mode, id, 'replace')
      })
    }
    for (const ev of INPUT_EVENTS) window.addEventListener(ev, onInput, { passive: true, capture: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      for (const ev of INPUT_EVENTS) window.removeEventListener(ev, onInput, { capture: true })
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      history.scrollRestoration = prevRestoration
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, write])
}
