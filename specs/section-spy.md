# Section spy (`use-prms/sections`)

**Status:** proposed. **Source:** disky's [`hashSpy.ts`] (+ [`hashSpy.test.ts`], [`SectionAnchor.tsx`]), in production on disky's home page ([`App.tsx`] `useHashSpy`, ~L669) and staged-deletions page ([`StagedPage.tsx`] ~L344), toggled by [`prefs.tsx`]'s `scroll-spy` pref.

## Motivation

Long, sectioned pages want three things that browsers only half-provide:

1. **Deep links that land**, even when sections above the target mount late (query data, lazy charts): native `#id` scrolls once, at load, and is then pushed off-screen by content landing above it.
2. **A URL that names what the reader is looking at**, so copying the address bar shares *that* section. Native behavior never updates the URL on scroll.
3. **Back / forward that returns to where each entry was left**, in an SPA whose router navigations otherwise reset or mis-restore scroll.

`hashSpy` solved these in disky with ~300 lines of hard-won edge-case handling (user-vs-programmatic scroll detection, pursuit of late-landing targets, the bottom-of-page reference-line slide, a router that never sees the spy's writes). It's React-only and router-agnostic already, so it lifts cleanly.

The new piece is **param mode**: the section is a URL *param* (`?s=diff`) instead of the fragment. The fragment never reaches the server, so a dOGI (CF Worker rendering `og:image` per URL) can't see `#diff`; it *can* see `?s=diff` and render a card for that section. disky's dOGI already special-cases `?section=diff` ([`og/routes.ts`] `pageView`), but nothing on the client writes it today.

**Correction to the original framing**: "that would work in hash-mode too" is only true if the section param lives in the **query** while the app's other params live in the hash (`/hash?s=boolean#e&c=5`). A section param written *into* the hash (`#e&c=5&s=boolean`) works client-side, but is just as invisible to a dOGI as `#boolean`. So param mode's `location` defaults to `'query'` regardless of the entry point (see [Modes](#modes)).

## API

New subpath `use-prms/sections` (new `src/sections/` dir, new tsup entry, new `exports` entry). Not re-exported from `use-prms` or `use-prms/hash`. React is the only dependency (already an optional peer).

```ts
// ---- Navigation source (router adapter) ----

export interface NavLocation {
  pathname: string
  search: string
  hash: string
  /** History-entry key (react-router's `location.key`; `'default'` for an entry it didn't create). */
  key: string
}
export type NavType = 'POP' | 'PUSH' | 'REPLACE'
export interface NavSource { location: NavLocation; navType: NavType }

/** Default when no router is passed: `window.location` + `popstate`, entry keys stamped into `history.state`. */
export function useWindowNav(): NavSource

// react-router, no dependency (documented, not shipped):
//   const nav = { location: useLocation(), navType: useNavigationType() }

// ---- Modes ----

export type SectionMode =
  | { kind: 'fragment' }                     // `#diff` (hashSpy parity)
  | {
      kind: 'param'
      /** URL key holding the section. Default: `'s'` (see Open questions). */
      key?: string
      /** Where the param lives. Default `'query'`, even under `use-prms/hash` (dOGI visibility). */
      location?: 'query' | 'hash'
      /** Section id ↔ param value, e.g. strip a `section-` prefix: `?s=boolean` ↔ `#section-boolean`. */
      encode?: (id: string) => string
      decode?: (value: string) => string
      /** Adopt an incoming `#id` fragment that names a known section (or alias) into the param, then drop the fragment. Default true. */
      adoptFragment?: boolean
    }

// ---- Options ----

export interface ReferenceLine {
  /** Height (px) of whatever sticks to the top (header); the line sits just below it. Default `() => 0`. */
  offset?: () => number
  /** Line sits `min(vh * nearFrac, nearPx)` below `offset`. Defaults 1/3, 150. */
  nearFrac?: number
  nearPx?: number
  /** Width (px) of the bottom window over which the line slides to the viewport bottom. Default 280. */
  slidePx?: number
  /** Above this scrollY, no section is "in view" (URL section cleared). Default 40. */
  topPx?: number
}

export interface SectionSpyOptions {
  /** Section ids in page order, OR a selector to discover them (document order; id from `data-section` value, else `id`). Default selector: `'[data-section]'`. */
  sections?: readonly string[] | { selector: string }
  /** Default `{ kind: 'fragment' }` under `use-prms`; under `use-prms/hash`, fragment mode is refused (see Modes). */
  mode?: SectionMode
  /** What reader scrolling does to the URL. `'replace'` (default) | `'off'` (positions still saved/restored; URL changes only on navigation or `jumpToSection`). No `'push'` (one history entry per section scrolled past is an AP). */
  write?: 'replace' | 'off'
  /** History op for an explicit jump (`jumpToSection` / `<SectionLink>` click). Default `'replace'` (hashSpy parity); `'push'` makes Back return to the pre-jump position. */
  jumpWrite?: 'replace' | 'push'
  reference?: ReferenceLine
  /** Scroll-position persistence per history entry. Default `{ storage: 'session', key: 'use-prms:sections:pos', max: 200 }`; `false` disables restore. */
  positions?: { storage?: 'session' | 'local'; key?: string; max?: number } | false
  /** How long a deep link / restore keeps pursuing its target (ms). Default 20_000. */
  pursuitMs?: number
  /** Retired ids → current ids (`{ changes: 'diff' }`). Applied to incoming fragments and params; the URL is rewritten to the current id. */
  aliases?: Record<string, string>
  /** Re-arms a still-pending deep link / restore as content lands. */
  deps?: readonly unknown[]
  /** Router adapter. Default `useWindowNav()`. */
  nav?: NavSource
}

/** One per page (module-level state, as in hashSpy); a second concurrent mount warns in dev. */
export function useSectionSpy(opts?: SectionSpyOptions): void

/** The section currently named in the URL (or ''), as a store: re-renders only when the section changes, never per scroll frame. For TOC highlighting. */
export function useSectionInView(): string

/** Smooth-scroll to `id`'s parked position (its `scroll-margin-top`), focus it (`tabindex=-1`, `preventScroll`), name it in the URL. */
export function jumpToSection(id: string): void

/** The current URL with the section set to `id` (mode-aware), for `href`s, copy-link buttons, share sheets. */
export function sectionHref(id: string, opts?: { pathname?: string }): string

/** `search` (or a `URLSearchParams`) minus the section param: for callers building navigations from router state. */
export function withoutSection(search: string): string

/** Heading link: plain click → `jumpToSection`; modified / middle click → native, via `sectionHref(id)`. */
export function SectionLink(props: { id: string; className?: string; children: ReactNode }): JSX.Element

// ---- Pure, exported for tests and custom spies ----
export function navScroll(prev: NavSection | null, next: NavSection, navType: NavType, live: string, saved: number | undefined): NavScroll
export function sectionInView(ids: readonly string[], ref: Required<ReferenceLine>): string
export function isUserScroll(now: number): boolean
export function resetUserScroll(): void

/** `NavLocation` reduced to what `navScroll` needs; `section` is mode-decoded (fragment or param), '' if none. */
export interface NavSection { pathname: string; section: string; key: string }
export type NavScroll = { kind: 'none' } | { kind: 'top' } | { kind: 'section'; id: string } | { kind: 'restore'; y: number }
```

Required change in `src/core.ts` (internal, not public API): capture the **unpatched** `history.replaceState` / `pushState` before `patchHistoryApi()` wraps them, and export them to `sections/` as `silentReplaceState` / `silentPushState` (see [Silent writes](#silent-writes)).

## Modes

| Entry point | `fragment` mode | `param` mode, `location: 'query'` | `param` mode, `location: 'hash'` |
|---|---|---|---|
| `use-prms` (query params) | default; `#diff` | `?a=1&s=diff`; dOGI-visible | allowed but pointless (`#s=diff`) |
| `use-prms/hash` (hash params) | **refused** (dev error, spy inert): the fragment holds params | `?s=diff#a=1`; dOGI-visible; recommended | `#a=1&s=diff`; not dOGI-visible |

The default-mode switch keys off `getDefaultStrategy() === hashStrategy`, so a `use-prms/hash` app that calls `useSectionSpy()` with no `mode` gets a dev warning and no spy, rather than a clobbered hash. Opting in is `mode: { kind: 'param' }`.

### Param mode vs native `#fragment` behavior

Param mode deliberately takes over what the browser would do for `#id`; each native behavior gets an explicit replacement or a stated loss:

- **Initial load, param present** (`?s=diff`): no native jump happens. The spy's layout effect starts pursuit before first paint, same as hashSpy's deep-link path.
- **Initial load, fragment present** (`#diff`, from old links, other sites, or a hand-typed URL): the browser does its native jump first; then, if `adoptFragment` and the fragment exactly matches a known section id or alias, the spy rewrites to `?s=diff` (fragment dropped) via `silentReplaceState` and pursues. Under `use-prms/hash`, a fragment is adopted only if it contains no `=`/`&` *and* isn't a key registered in use-prms' param registry ([`registry.ts`]), since `#diff` there would otherwise be a valueless boolean param.
- **`:target`**: never matches in param mode (the fragment isn't the section). The spy sets `data-section-target` on the element a deep link / jump / adoption parked, and clears it on the reader's next scroll; apps replace `:target` selectors with `[data-section-target]`. It also sets `data-section-current` on the in-view section, for styling the current section itself (TOC highlighting uses `useSectionInView`).
- **History**: spy writes are `replaceState` only; no `hashchange` fires, no entries are added. Back / forward is served by the position store (`restore`), not by section ids. `history.scrollRestoration = 'manual'` while mounted (restored to the prior value on unmount).
- **Find-in-page / text fragments**: param mode never touches the fragment, so `#:~:text=` directives and any other fragment consumer are unaffected. Browser find-in-page scrolls without input events, so it reads as non-user and doesn't update the section (same as hashSpy; see Open questions).
- **Focus**: native fragment navigation moves the sequential-focus start point; `jumpToSection` and deep-link adoption replicate this by focusing the section with `preventScroll`.
- **Copy link / middle-click**: `<SectionLink>`'s `href` is `sectionHref(id)`: the *live* URL (all current params) with the section set. A copied heading link and a copied address bar are equivalent, and both are dOGI-visible.

### Silent writes

Every `history.replaceState` goes through use-prms' patch, which dispatches `use-prms:locationchange`; in query mode a spy write changes `location.search`, so `getSnapshot` re-parses and every `useUrlState` consumer re-renders. Per scroll frame, that's unacceptable (and a router listening to `popstate` would re-render the whole app, which is why hashSpy never told the router).

So the spy writes with the **unpatched** `replaceState` (`silentReplaceState`), dispatches nothing, and publishes the section through its own tiny store (`useSectionInView`). Writes happen only when the section *changes* (not per frame), coalesced to one rAF, with a trailing 100ms throttle (Safari throws after ~100 history calls per 10s).

Consequences, all made explicit:

- `useUrlState('s', …)` would read a stale value; the spy owns its key. Read it via `useSectionInView`. Registering the key in the param registry (so reflection/diagnostics know it) is fine; it's marked spy-owned.
- Other use-prms writes build from `strategy.parse()` of the live URL, so they preserve the spy's latest `s`. Their next snapshot re-parse sees it; harmless.
- **Required fix in `useUrlState` / `useUrlStates` / `useMultiUrlState` debounce**: the pending-value check (`raw !== pendingRef.current.prevRaw` → "URL changed externally, discard pending") compares the *whole* raw search, so a silent spy write mid-debounce would discard a debounced slider value. Change it to compare the hook's own key(s)' encoded values. (Also a latent bug today for any third-party `replaceState`.)
- The router's `location.search` goes stale, exactly as its `hash` does under hashSpy. See the stale-carry rule below.

### Stale-section rule (param mode generalizes hashSpy's)

hashSpy treats a same-path navigation as a jump iff `next.hash !== liveHash`. Routers that build navigations from their own (stale) `search` make that fire spuriously: the router still holds `s=diff` from load, the reader has scrolled to `mtime`, any `navigate({ search })` carries `s=diff` back and would yank the page. New rule, applied in both modes:

- **Same path**: move only if `next.section !== live` **and** `next.section !== prev.section` (the router has never seen this section; it's an explicit new link). Otherwise `none`, and if `next.section !== live`, the spy silently rewrites the URL back to `live` ("reconcile"), so the address bar stays truthful.
- **Path change**: a `next.section` equal to `prev.section` is a carry-over; treat as no section (`top`) and strip it. Callers should still use `withoutSection` when building navigations from router state.

All existing hashSpy `navScroll` cases keep their expected results under this rule.

## Behavior details (ported from hashSpy, unchanged unless noted)

- **User-scroll detection**: a `scroll` event is the reader's iff within 1000ms of reader input (`wheel`, `touchmove`, scroll keys outside editables, `pointerdown` on the root scrollbar) or within 200ms of a previous reader scroll (touch momentum). Programmatic scrolls, restores, and the browser clamping `scrollY` as the page shrinks never write the URL or save positions.
- **Navigation decisions** (`navScroll`, before paint in a layout effect): first render → restore if the entry has a saved position (reload), else its section (deep link); POP to another entry → saved position, else its section, else top on path change; PUSH/REPLACE to another path → its section, else top; same path → the stale-section rule above.
- **Pursuit**: a section target is nudged every 250ms (`behavior: 'instant'`; smooth never lands when restarted) until its top sits at its `scroll-margin-top` *and* both its top and the document height are unchanged since the last nudge, or `pursuitMs` elapses, or the reader scrolls (which cancels for good). A restore target waits for the page to be tall enough and stop growing. `deps` changes re-arm a still-pending target.
- **Reference line + bottom slide** (`sectionInView`): the line sits `offset + min(vh·nearFrac, nearPx)` below the top; over the last `min(slidePx, maxY, vh − near)` px of scroll it slides to the viewport bottom, so the last short sections each get named. Above `topPx`, no section.
- **Entry keys**: router keys when given; for `'default'` (the entry the page loaded into), a key stamped into `history.state.upKey` (renamed from `hsKey`).
- **Positions**: saved on each reader-scroll frame for the current entry; storage failures degrade to section-based back/forward. New: capped at `max` entries (oldest evicted); hashSpy's map grows unbounded.
- **Aliases**: applied to incoming section values in both modes; the URL is rewritten to the canonical id on adoption.
- **Discovery**: with `{ selector }`, sections are re-queried per rAF write (cheap: one `querySelectorAll` per section change, not per frame) and on `deps` change.

## Tests

Unit (vitest + happy-dom), `src/sections/*.test.ts`:

- Port [`hashSpy.test.ts`] verbatim onto `navScroll` (`hash` → `section`, `kind: 'hash'` → `kind: 'section'`), all 9 cases + `isUserScroll`.
- New `navScroll` cases: same-path stale carry (`prev.section === next.section !== live` → `none`); path change with carried section → `top`; explicit same-path link to a new section still jumps.
- `sectionInView` with stubbed `getBoundingClientRect` / `innerHeight` / `scrollHeight`: header offset, mid-page, bottom slide naming each of three short trailing sections in turn, `topPx` cutoff.
- Silent writes: a component using `useUrlState('x', …)` plus the spy; simulate reader scroll across sections; assert the component's render count is unchanged and `location.search` / `location.hash` are exact expected strings.
- Debounce fix: a debounced `useUrlState` with a pending value survives a silent spy write; its final URL is the exact expected search.
- Mode resolution: under `setDefaultStrategy(hashStrategy)`, default mode is inert (exact dev-warning text asserted); fragment adoption → exact URL; registry-key fragment (`#e`) not adopted.
- `sectionHref` / `withoutSection`: exact output strings for query and hash entry points.

E2E (Playwright, `site/e2e/sections.spec.ts`), since scroll/input detection needs a real browser:

- Reader scroll writes `?s=…` (param) / `#section-…` (fragment); programmatic `scrollTo` writes nothing.
- Deep link to a section below a delayed-mount block lands parked after the block appears.
- Back / forward restore exact `scrollY` (±2px); reload restores.
- `/hash` route: hash params untouched by scrolling; `?s=` written alongside.

## Demo

On the use-prms site ([`site/src`]), whose `/` and `/hash` pages already have long sections (`section-boolean`, `section-string`, `section-numbers`, …, `section-binary`, `section-map`):

- `/` mounts `useSectionSpy({ sections: { selector: 'section[id^="section-"]' }, mode: { kind: 'param', encode: id => id.replace(/^section-/, ''), decode: v => `section-${v}` } })` → `/?e&c=5&s=boolean`.
- `/hash` mounts the same → `/hash?s=boolean#e&c=5`, demonstrating hash params + query section.
- A sticky TOC (desktop) / collapsible TOC (mobile) driven by `useSectionInView`, headings as `<SectionLink>`.
- `FloatingControls` gets a mode switch (param / fragment / off; fragment greyed on `/hash`) and a live readout of `location.href`.
- A "slow section" (mounts after 1.5s) above a lower section, plus a "Try" link deep-linking to the lower one, to show pursuit.
- README: a `## Section Spy` section (`<a id="sections">`) and a use-kbd example (docs only, no dependency):

```tsx
import { useAction, useActionPair } from 'use-kbd'
import { jumpToSection, useSectionInView } from 'use-prms/sections'

const cur = useSectionInView()
const i = SECTIONS.indexOf(cur)
useActionPair('sections:step', {
  label: 'Previous / next section',
  actions: [
    { defaultBindings: ['['], handler: () => jumpToSection(SECTIONS[Math.max(i - 1, 0)]) },
    { defaultBindings: [']'], handler: () => jumpToSection(SECTIONS[Math.min(i + 1, SECTIONS.length - 1)]) },
  ],
})
// One omnibar action per section ("Go to: Diff")
for (const [id, label] of SECTION_LABELS) useAction(`sections:go:${id}`, { label: `Go to: ${label}`, group: 'Sections', handler: () => jumpToSection(id) })
```

(The loop is illustrative; real code uses `useActions` with a record, to keep hook order stable.)

## Migration (disky)

Phase 1, no behavior change (fragment mode):

- Delete `site/src/hashSpy.ts`, `site/src/hashSpy.test.ts` (tests now live upstream).
- `SectionAnchor.tsx` → re-export `SectionLink` with `className="sec-anchor"` (or delete it and update `App.tsx` / `SizeOverTime.tsx` imports).
- `App.tsx`: `useSectionSpy({ sections: SECTION_IDS, nav: { location, navType }, deps: [mapTree, meta, scans], aliases: LEGACY_ANCHORS, reference: { offset: topbarH }, write: spy === 'on' ? 'replace' : 'off', mode: { kind: 'fragment' } })`. `StagedPage.tsx` likewise, `aliases: memberAnchors`.
- `prefs.tsx` keeps the `scroll-spy` pref and `SiteNav` menu item; it maps to `write`.
- Saved positions under the old `hashSpy.pos` sessionStorage key are lost once (per tab); acceptable.

Phase 2, param mode (`key: 'section'`, matching dOGI `pageView`'s existing `sp.get('section') === 'diff'`):

- Existing `#diff`, `#tbl`, legacy `#changes` / `#size-over-time` / `#created-date` links, and StagedPage's `#batch-123` keep working via `adoptFragment` (+ `aliases`): they land, then the URL becomes `?section=diff`.
- `drillTo` (~L746): `withoutSection(search)` alongside its `q.delete('open')`. Audit every `navigate({ search })` built from router state (the `?path=` and legacy-param rewrites at ~L169/~L333 pass `hash: window.location.hash`, which stays correct; their `search` comes from the router and gets the carry rule).
- `app.scss`: `.stage-batch:target` → `.stage-batch[data-section-target]`.
- dOGI: extend `pageView` beyond `diff` (`over-time`, `mtime`, `tbl` cards) as a follow-up; out of scope here.

## Open questions

1. **Default param key**: `s` (short, Ryan's example) vs `section` (self-describing in shared links; disky's dOGI already uses it). Or no default, required in param mode?
2. **Positions inside a section**: worth a sub-section anchor like `?s=diff.40` (40% through the section, viewport-independent) for long sections? Raw pixel `scrollY` in the URL is viewport-dependent, so not that. Element selectors (`?s=css:…`) feel like scope creep.
3. **Adopted fragment: drop or keep?** Keeping (`?s=diff#diff`) preserves native `:target` but duplicates state and goes stale on scroll; proposal drops it.
4. **Find-in-page and third-party `scrollIntoView`** don't count as reader scrolls, so the URL lags. A `scrollend` that follows no programmatic scroll of ours could count; risky (layout clamps also produce `scrollend`).
5. **Per-key snapshot memoization** in `useUrlState` (re-render only when a hook's own key changes) would make silent writes less load-bearing and help all apps. Do it here, or separately?
6. **Non-window scroll containers** (e.g. a scrolling `<main>`): out of scope for v1?
7. **Stale-carry on path change** strips a section that equals the router's previous one; an explicit cross-path link to the *same* section id would be swallowed. Rare in practice; acceptable, or require `withoutSection` and drop the rule?

[`hashSpy.ts`]: ../../../disky/site/src/hashSpy.ts
[`hashSpy.test.ts`]: ../../../disky/site/src/hashSpy.test.ts
[`SectionAnchor.tsx`]: ../../../disky/site/src/SectionAnchor.tsx
[`App.tsx`]: ../../../disky/site/src/App.tsx
[`StagedPage.tsx`]: ../../../disky/site/src/StagedPage.tsx
[`prefs.tsx`]: ../../../disky/site/src/prefs.tsx
[`og/routes.ts`]: ../../../disky/site/functions/_lib/og/routes.ts
[`registry.ts`]: ../src/registry.ts
[`site/src`]: ../site/src
