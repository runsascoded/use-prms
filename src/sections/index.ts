/**
 * `use-prms/sections` — a page's in-view section in the URL (fragment or param)
 * plus scroll restore across navigation. A separate subpath: not re-exported
 * from `use-prms` or `use-prms/hash`. React is the only dependency.
 */
export {
  useSectionSpy,
  useSectionInView,
  useWindowNav,
  jumpToSection,
  sectionHref,
  withoutSection,
  SectionLink,
  // Pure, exported for tests and custom spies:
  navScroll,
  sectionInView,
  isUserScroll,
  resetUserScroll,
} from './spy.js'

export type {
  NavLocation,
  NavSource,
  NavType,
  NavScroll,
  NavSection,
  SectionMode,
  SectionSpyOptions,
  ReferenceLine,
} from './spy.js'
