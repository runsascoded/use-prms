# Section spy: the bottom slide names a section early; dead reconcile; mode identity

**Status:** done 2026-10-19 (see [Implementation](#implementation)); proposed by disky the same day. **Scope:** `src/sections/nav.ts` `sectionInView`, `src/sections/spy.tsx`. Found while adopting `use-prms/sections` in disky (its spec `specs/done/use-prms-sections.md`). disky reports: "the spy was jumping ahead to e.g. diff when over-time was still not even at top of screen".

## 1. The bottom slide names the next section while the current one is far below the header

### Rule today

`sectionInView` puts the reference line at `near = offset + min(vh·nearFrac, nearPx)`. Over the last `descend = min(vh − near, maxY, slidePx)` px of scroll, the line slides linearly from `near` to the **viewport bottom** (`vh`). The last section in document order whose `top ≤ yRef` is named.

### Repro (disky home page, r2 demo data, desktop)

| | |
|---|---|
| viewport height `vh` | 1188 |
| `maxY` (`scrollHeight − vh`) | 825 |
| sticky header (`reference.offset`) | 76 |
| `near` = 76 + min(396, 150) | 226 |
| `descend` = min(962, 825, 280) | 280, so the slide spans scrollY 545 → 825 |
| section tops (document) | `tree-map` 98, `tbl` 773, `over-time` 982, `diff` 1277 (689 px tall; it ends the page) |

While sliding, `yRef` moves 962 px over 280 px of scroll, about 3.4 px per px scrolled. The sections themselves move 1 px per px. So the line sweeps past section tops about 4.4× faster than the reader scrolls.

Measured in Chrome (synthetic `wheel` + `scrollTo`, then read the URL), matching the formula exactly:

```
current rule:   0:-  40:tree-map  546:tbl  593:over-time  660:diff
```

At scrollY 660, `diff` is named, but "Size over time" (`over-time`) has its top at 322 px. That is 246 px below the header's bottom edge, with the whole 274 px chart fully on screen. `over-time` gets only 67 px of scroll as the named section. It never reaches its parked position (92 px) at all, since the page ends first. Its top at `maxY` is 155.

### Cause

The slide's end point is the viewport bottom. But the last section's top at `maxY` is usually far above it: here `1277 − 825 = 452`, not 1188. Sliding to `vh` overshoots by ~736 px. Every trailing section gets named well before the page needs it to be. The slide's purpose is only to give sections that can never reach `near` a turn, and here only `diff` is one (452 > 226). `over-time` reaches `near` unaided at scrollY 756.

### Proposed rule

Slide only as far, and only as early, as the unreachable sections need:

1. **End point:** `yEnd = max(near, min(vh, max over sections of (absTop − maxY)) + 1)`. That is the deepest top any section has at the bottom of the page, plus 1 px so the last one is named at `maxY` despite sub-pixel tops. If every section reaches `near` (`yEnd = near`), there is no slide.
2. **Start point:** `slideStart = max(maxY − slidePx, reachEnd)`, where `reachEnd = absTop(last section with absTop − maxY ≤ near) − near`. That is the scrollY at which the last section that *can* reach the line does so. Sections that reach `near` on their own are named by the plain rule, never early.
3. `yRef = near + (yEnd − near) · clamp01((scrollY − slideStart) / (maxY − slideStart))`. When `slideStart ≥ maxY` (nothing to slide), use `near`.

Same page under the proposal:

```
proposed (1 only):    0:-  40:tree-map  546:tbl  662:over-time  825:diff
proposed (1 + 2):     0:-  40:tree-map  546:tbl  756:over-time  825:diff
```

With (1 + 2), `over-time` is named exactly when its top meets the line (226), as everywhere else on the page. `diff` (which can't reach the line) is named at the bottom. The original intent is kept: several short trailing sections, none of which can reach `near`, each still get a turn, spread over `[slideStart, maxY]` in document order, because the line ends at the deepest of their tops.

### Tests (`nav.test.ts`, stubbed geometry; exact transitions)

- The repro geometry above: the transition list equals `['0:', '40:tree-map', '546:tbl', '756:over-time', '825:diff']`. Sample every px from 0 to `maxY` with a `transitions(ids, ref)` helper, and assert exact equality.
- Three short trailing sections, none reaching `near`: each is named in turn, in order, and the last at exactly `maxY`.
- A page where every section reaches `near`: no slide (`yRef === near` at `maxY`).
- The existing `topPx` and header-offset cases unchanged.

## 2. `useSectionSpy`'s stale-carry "reconcile" is dead code

In the location layout effect:

```ts
prev.current = next
keyRef.current = k
liveSection = next.section
publishSection(next.section)
if (act.kind === 'none') {
  // Reconcile: if the router carries a stale section, rewrite the URL back to live.
  if (next.section !== liveSection) silentReplaceState(history.state, '', sectionUrl(mode, liveSection))
  return
}
```

`liveSection` is assigned `next.section` just before the comparison, so the reconcile never runs. Worse, a same-path router navigation built from stale router state (e.g. `navigate({ search })` while the reader scrolled from the load-time `diff` to `tbl`) leaves the URL saying `section=diff` and *adopts* `diff` as live, though the page didn't move. The address bar then lies until the reader's next scroll. In disky, a share/copy in that window would get the diff card for a page showing the table. Spec intent ("the spy silently rewrites the URL back to `live`"): capture `const live = from ? liveSection : next.section` (already computed as `curLive`), and on `none` with `next.section !== live`, rewrite to `live` and keep `liveSection = live`. Only set `liveSection = next.section` when the navigation is honored. Test: in `spy.test.tsx`, load with `?s=b`, simulate a reader scroll to `c`, rerender with a same-path location whose search still has `s=b`. Assert `location.search === '?s=c'` and `useSectionInView() === 'c'`.

disky works around it by stripping the section (`withoutSection`) from its own router-built navigations (`drillTo`, `openObject`). Other `navigate`s built from the router's `search` (scan picker links, legacy rewrites) still hit it.

## 3. `mode` is compared by identity

`useMemo(() => resolveMode(opts.mode), [opts.mode])`, plus the scroll effect's `[mode, write]` deps, mean an inline `mode: { kind: 'param' }` (the README / spec's own example) produces a new resolved mode every render. That tears down and re-adds the scroll and input listeners, and resets `lastH` and `history.scrollRestoration`, on every render of the host component. On disky's home page that is many renders per data load. disky passes a module constant. Fix: key the memo on the mode's fields (`kind`, `key`, `location`, `adoptFragment`; `encode`/`decode` by identity), or document "pass a stable `mode`". The first is better: the obvious inline usage should be correct.

## Implementation <a id="implementation"></a>

All three items landed as proposed, with these deltas:

- **(1) Slide:** pulled out as a pure, exported `referenceLine(absTops, y, maxY, near, h, slidePx)` in `nav.ts` (re-exported from `use-prms/sections`). `sectionInView` measures tops once and delegates. One deviation: **scrollY within 1 px of `maxY` counts as the bottom**, so the slide runs over `[slideStart, maxY − 1]`. `maxY` comes from the integer-rounded `scrollHeight`, and a fractional scroll (DPR / zoom) can stop just short of it. At ~3.3 px of line per px of scroll, a 0.3 px shortfall would otherwise mean the last section is never named. So the repro's transitions are `['0:', '40:tree-map', '547:tbl', '756:over-time', '824:diff']`. `tbl` is at 547 rather than 546 because the old rule's slide, which started at 545, named it 1 px early. Against the old `nav.ts`, the same test yields exactly disky's measured `546:tbl 593:over-time 660:diff`.
  - Known trade-off: when the last reachable section reaches `near` just before `maxY`, the unreachable sections below it share a short slide. Each still gets a turn, in order. They're all on screen at that point, so naming one early would be worse.
- **(2) Reconcile:** on `none` with `next.section !== live`, the URL is rewritten to `live`, and `live` is kept. **Except with `write: 'off'`**: the URL isn't the spy's to keep there, so the router's section is adopted, as before. Also fixed in the same block: `liveSection = x` ran right before `publishSection(x)`, which returns early when the value is unchanged, so **`useSectionInView` subscribers were never notified of a navigation-driven section change**. The direct assignments are gone; `publishSection` is the only writer.
- **(3) Mode identity:** the resolved-mode memo is keyed on `kind`, `key`, `location`, `adoptFragment`, and `encode` / `decode` (the last two by identity).

Tests (each new one TFFP'd: it fails on the pre-fix code):

- `nav.test.ts`: a `transitions()` helper, with exact lists for the disky repro, three short trailing sections, and the no-slide page; `referenceLine` unit cases, including the sub-pixel bottom. The existing mid-slide case changes from `b` to `a`, because the line now ends at the deepest top + 1 (711), not the viewport bottom (900).
- `spy.test.tsx`: stale same-path navigation rewrites to live; `write: 'off'` adopts the router's section; a memoized `useSectionInView` reader is notified on navigation; an inline `mode` literal binds the scroll listener once across re-renders.
