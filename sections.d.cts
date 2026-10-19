import { ReactNode, ReactElement } from 'react';

/**
 * Pure navigation/scroll decisions for the section spy — no DOM state beyond
 * what's passed in, so they're unit-testable. Ported from disky's `hashSpy`
 * (`navScroll` / `sectionInView`), generalized from the URL fragment to a
 * mode-decoded "section" string (fragment or URL param), with a stale-carry
 * rule a router's own (stale) section can't trip.
 */
/** react-router's `useNavigationType()` values. */
type NavType = 'POP' | 'PUSH' | 'REPLACE';
/**
 * A location reduced to what {@link navScroll} needs. `section` is the
 * mode-decoded section id (from the fragment or the section param), `''`
 * when the URL names none.
 */
interface NavSection {
    pathname: string;
    section: string;
    /** History-entry key (react-router's `location.key`; `'default'` otherwise). */
    key: string;
}
/** What a location change does to the scroll position. */
type NavScroll = {
    kind: 'none';
} | {
    kind: 'top';
} | {
    kind: 'section';
    id: string;
} | {
    kind: 'restore';
    y: number;
};
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
declare function navScroll(prev: NavSection | null, next: NavSection, navType: NavType, live: string, saved: number | undefined): NavScroll;
/** Reference-line geometry for {@link sectionInView}. */
interface ReferenceLine {
    /** Height (px) of whatever sticks to the top; the line sits just below it. Default `() => 0`. */
    offset?: () => number;
    /** Line sits `min(vh * nearFrac, nearPx)` below `offset`. Defaults 1/3, 150. */
    nearFrac?: number;
    nearPx?: number;
    /** Most scroll (px) the bottom slide may span. Default 280. */
    slidePx?: number;
    /** Above this scrollY, no section is "in view" (URL section cleared). Default 40. */
    topPx?: number;
}
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
declare function referenceLine(absTops: readonly number[], y: number, maxY: number, near: number, h: number, slidePx: number): number;
/**
 * The section id the spy would name for the current scroll position, or `''`
 * at the very top: the last section (document order) whose top is at or
 * above the {@link referenceLine}.
 */
declare function sectionInView(ids: readonly string[], ref: Required<ReferenceLine>): string;

/** Whether the scroll happening now is the reader's own. */
declare function isUserScroll(now: number): boolean;
/** Forget any pending reader input: a navigation's own scroll must not read as theirs. */
declare function resetUserScroll(): void;

/** A location reduced to what the spy reads: the full URL parts + the history key. */
interface NavLocation {
    pathname: string;
    search: string;
    hash: string;
    /** History-entry key (react-router's `location.key`; `'default'` for an entry it didn't create). */
    key: string;
}
/** The navigation source: a location + how it was reached. */
interface NavSource {
    location: NavLocation;
    navType: NavType;
}
/** Where the section lives in the URL and how its id maps to the stored value. */
type SectionMode = {
    kind: 'fragment';
} | {
    kind: 'param';
    /** URL key holding the section. Default `'s'`. */
    key?: string;
    /** Where the param lives. Default `'query'`, even under `use-prms/hash` (dOGI visibility). */
    location?: 'query' | 'hash';
    /** Section id ↔ param value, e.g. strip a `section-` prefix: `?s=boolean` ↔ `section-boolean`. */
    encode?: (id: string) => string;
    decode?: (value: string) => string;
    /** Adopt an incoming `#id` fragment that names a known section into the param, then drop it. Default true. */
    adoptFragment?: boolean;
};
interface SectionSpyOptions {
    /** Section ids in page order, OR a selector to discover them (document order; id from `data-section`, else `id`). */
    sections?: readonly string[] | {
        selector: string;
    };
    /** Default `{ kind: 'fragment' }` under `use-prms`; refused under `use-prms/hash` (see resolution). */
    mode?: SectionMode;
    /** What reader scrolling does to the URL. `'replace'` (default) names the in-view section; `'off'` only saves/restores positions. */
    write?: 'replace' | 'off';
    /** History op for an explicit jump. Default `'replace'`; `'push'` makes Back return to the pre-jump position. */
    jumpWrite?: 'replace' | 'push';
    reference?: ReferenceLine;
    /** Scroll-position persistence per history entry. `false` disables restore. */
    positions?: {
        storage?: 'session' | 'local';
        key?: string;
        max?: number;
    } | false;
    /** How long a deep link / restore keeps pursuing its target (ms). Default 20_000. */
    pursuitMs?: number;
    /** Retired ids → current ids. Applied to incoming fragments and params; the URL is rewritten to the current id. */
    aliases?: Record<string, string>;
    /** Re-arms a still-pending deep link / restore as content lands. */
    deps?: readonly unknown[];
    /** Router adapter. Default {@link useWindowNav}. */
    nav?: NavSource;
}
/** The section currently named in the URL (or `''`), as a store: re-renders only when it changes, never per scroll frame. */
declare function useSectionInView(): string;
/** Smooth-scroll to `id`'s parked position, focus it, and name it in the URL (mode-aware). */
declare function jumpToSection(id: string): void;
/** The current URL with the section set to `id` (mode-aware), for `href`s, copy-link buttons, share sheets. */
declare function sectionHref(id: string, opts?: {
    pathname?: string;
}): string;
/** `search` (or a `URLSearchParams`-ish string) minus the section param (param mode only; fragment mode returns it unchanged). */
declare function withoutSection(search: string): string;
/** Heading link: plain click → {@link jumpToSection}; modified / middle click → native, via {@link sectionHref}. */
declare function SectionLink({ id, className, children }: {
    id: string;
    className?: string;
    children: ReactNode;
}): ReactElement;
/** `window.location` + `popstate`, with entry keys stamped into `history.state`. Best-effort `navType` (POP for popstate). */
declare function useWindowNav(): NavSource;
declare function useSectionSpy(opts?: SectionSpyOptions): void;

export { type NavLocation, type NavScroll, type NavSection, type NavSource, type NavType, type ReferenceLine, SectionLink, type SectionMode, type SectionSpyOptions, isUserScroll, jumpToSection, navScroll, referenceLine, resetUserScroll, sectionHref, sectionInView, useSectionInView, useSectionSpy, useWindowNav, withoutSection };
