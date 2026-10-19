/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memo } from 'react'
import { act, renderHook, render } from '@testing-library/react'
import {
  useSectionSpy,
  useSectionInView,
  jumpToSection,
  sectionHref,
  withoutSection,
  type NavSource,
  type NavType,
  type SectionMode,
} from './index.js'
import { useUrlState, stringParam, setDefaultStrategy, queryStrategy, hashStrategy } from '../index.js'

const navAt = (
  { search = '', hash = '', pathname = '/', key = 'default', navType = 'POP' as NavType } = {},
): NavSource => ({ location: { pathname, search, hash, key }, navType })

// Section id ↔ param value: `sec-a` ↔ `a`.
const prefixed: SectionMode = {
  kind: 'param',
  key: 's',
  encode: id => id.replace(/^sec-/, ''),
  decode: v => `sec-${v}`,
}

function addSections(ids: string[]): void {
  for (const id of ids) {
    const el = document.createElement('section')
    el.id = id
    document.body.appendChild(el)
  }
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  document.body.innerHTML = ''
  // happy-dom lacks these scroll APIs.
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = (() => {}) as typeof window.scrollTo
})

afterEach(() => {
  setDefaultStrategy(queryStrategy)
  vi.restoreAllMocks()
})

describe('mode resolution', () => {
  it('under use-prms/hash, no default mode: inert + dev warning', () => {
    setDefaultStrategy(hashStrategy)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState({}, '', '/#e&c=5')
    renderHook(() => useSectionSpy({ sections: ['sec-a'], nav: navAt({ hash: '#e&c=5' }) }))
    expect(warn.mock.calls).toEqual([
      ['useSectionSpy: no default mode under use-prms/hash (the fragment holds params). Pass mode: { kind: "param" }. Spy inert.'],
    ])
    // Inert: the hash is untouched.
    expect(window.location.hash).toBe('#e&c=5')
  })

  it('under use-prms (query), the default mode is fragment', () => {
    addSections(['sec-a'])
    renderHook(() => useSectionSpy({ sections: ['sec-a'], nav: navAt() }))
    // fragment mode → jumpToSection writes a bare `#id`.
    jumpToSection('sec-a')
    expect(window.location.hash).toBe('#sec-a')
    expect(window.location.search).toBe('')
  })
})

describe('sectionHref / withoutSection', () => {
  it('param mode (query): href sets `?s=`, withoutSection strips it, both preserve other params', () => {
    window.history.replaceState({}, '', '/?x=1')
    renderHook(() => useSectionSpy({ sections: ['sec-a'], mode: prefixed, nav: navAt({ search: '?x=1' }) }))
    expect(sectionHref('sec-a')).toBe('/?x=1&s=a')
    expect(withoutSection('?x=1&s=a')).toBe('?x=1')
    expect(withoutSection('?x=1')).toBe('?x=1')
  })

  it('fragment mode: href is a bare `#id`; withoutSection is a no-op', () => {
    window.history.replaceState({}, '', '/?x=1')
    renderHook(() => useSectionSpy({ sections: ['sec-a'], mode: { kind: 'fragment' }, nav: navAt({ search: '?x=1' }) }))
    expect(sectionHref('sec-a')).toBe('/?x=1#sec-a')
    expect(withoutSection('?x=1#sec-a')).toBe('?x=1#sec-a')
  })

  it('param mode (hash location): href writes the section into the hash alongside app params', () => {
    window.history.replaceState({}, '', '/?e&c=5')
    const hashParam: SectionMode = { kind: 'param', key: 's', location: 'hash' }
    renderHook(() => useSectionSpy({ sections: ['boolean'], mode: hashParam, nav: navAt({ search: '?e&c=5' }) }))
    // Preserves `?e&c=5` in the search and adds `#s=boolean`.
    expect(sectionHref('boolean')).toBe('/?e&c=5#s=boolean')
  })
})

describe('silent writes', () => {
  it('a jump does not re-render a useUrlState consumer, and the URL is exact', () => {
    window.history.replaceState({}, '', '/?x=1')
    addSections(['sec-a'])
    let renders = 0
    function App() {
      renders++
      useUrlState('x', stringParam())
      useSectionSpy({ sections: ['sec-a'], mode: prefixed, nav: navAt({ search: '?x=1' }) })
      return null
    }
    render(<App />)
    const before = renders
    jumpToSection('sec-a')
    // Silent write: no use-prms:locationchange dispatched → no re-render.
    expect(renders).toBe(before)
    expect(window.location.search).toBe('?x=1&s=a')
  })
})

describe('fragment adoption (param mode)', () => {
  it('adopts a `#sec-a` fragment naming a known section into `?s=a`, dropping the fragment', () => {
    window.history.replaceState({}, '', '/#sec-a')
    addSections(['sec-a'])
    renderHook(() => useSectionSpy({ sections: ['sec-a'], mode: prefixed, nav: navAt({ hash: '#sec-a' }) }))
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?s=a')
  })

  it('does not adopt a fragment that names no known section', () => {
    window.history.replaceState({}, '', '/#unknown')
    addSections(['sec-a'])
    renderHook(() => useSectionSpy({ sections: ['sec-a'], mode: prefixed, nav: navAt({ hash: '#unknown' }) }))
    expect(window.location.hash).toBe('#unknown')
    expect(window.location.search).toBe('')
  })
})

describe('same-path navigation from stale router state', () => {
  const ids = ['sec-a', 'sec-b', 'sec-c']
  // Load at `?s=b`, then the reader moves the live section to `c` without the
  // router seeing (a jump writes silently, as a reader scroll does).
  function loadThenMoveToC(write: 'replace' | 'off') {
    window.history.replaceState({}, '', '/?s=b')
    addSections(ids)
    const hook = renderHook(
      ({ nav }) => { useSectionSpy({ sections: ids, mode: prefixed, write, nav }); return useSectionInView() },
      { initialProps: { nav: navAt({ search: '?s=b' }) } },
    )
    act(() => jumpToSection('sec-c'))
    expect(window.location.search).toBe('?s=c')
    return hook
  }

  it('a navigation carrying the stale section rewrites the URL back to the live one', () => {
    const { result, rerender } = loadThenMoveToC('replace')
    // e.g. `navigate({ search })` built from the router's (stale) `?s=b`.
    window.history.replaceState(window.history.state, '', '/?s=b')
    rerender({ nav: navAt({ search: '?s=b', key: 'k1', navType: 'PUSH' }) })
    expect(window.location.search).toBe('?s=c')
    expect(result.current).toBe('sec-c')
  })

  it('with write: "off", the router\'s section is adopted (the URL is not the spy\'s)', () => {
    const { result, rerender } = loadThenMoveToC('off')
    window.history.replaceState(window.history.state, '', '/?s=b')
    rerender({ nav: navAt({ search: '?s=b', key: 'k1', navType: 'PUSH' }) })
    expect(window.location.search).toBe('?s=b')
    expect(result.current).toBe('sec-b')
  })
})

describe('useSectionInView subscribers', () => {
  it('are notified when a navigation changes the section', () => {
    window.history.replaceState({}, '', '/?s=a')
    addSections(['sec-a', 'sec-b'])
    const seen: string[] = []
    // Memoized with no props: it re-renders only via its store subscription.
    const Reader = memo(function Reader() { seen.push(useSectionInView()); return null })
    function Host({ nav }: { nav: NavSource }) {
      useSectionSpy({ sections: ['sec-a', 'sec-b'], mode: prefixed, nav })
      return <Reader />
    }
    const { rerender } = render(<Host nav={navAt({ search: '?s=a' })} />)
    window.history.replaceState(window.history.state, '', '/?s=b')
    rerender(<Host nav={navAt({ search: '?s=b', key: 'k1', navType: 'PUSH' })} />)
    expect(seen[seen.length - 1]).toBe('sec-b')
  })
})

describe('mode identity', () => {
  it('an inline mode literal binds the scroll listener once across re-renders', () => {
    addSections(['sec-a'])
    const add = vi.spyOn(window, 'addEventListener')
    const { rerender } = renderHook(() => useSectionSpy({ sections: ['sec-a'], mode: { kind: 'param', key: 's' }, nav: navAt() }))
    rerender()
    rerender()
    expect(add.mock.calls.filter(([type]) => type === 'scroll').length).toBe(1)
  })
})
