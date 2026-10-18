import { useEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { useSectionSpy, useSectionInView, SectionLink, type SectionMode } from 'use-prms/sections'

export type SpyMode = 'param' | 'fragment' | 'off'

// Section id ↔ param value: strip the `section-` prefix (`?s=boolean` ↔ `#section-boolean`).
const paramMode: SectionMode = {
  kind: 'param',
  key: 's',
  encode: id => id.replace(/^section-/, ''),
  decode: v => `section-${v}`,
}

// The demo's sections, in page order, with human labels for the TOC.
export const SECTION_NAV: readonly [string, string][] = [
  ['section-boolean', 'Boolean'],
  ['section-string', 'String'],
  ['section-numbers', 'Numbers'],
  ['section-enum', 'Enum'],
  ['section-strings', 'String array'],
  ['section-pagination', 'Pagination'],
  ['section-codes', 'Code mapping'],
  ['section-multi', 'Multi-value'],
  ['section-batch', 'Batch'],
  ['section-alias', 'Alias'],
  ['section-flagpack', 'Flag pack'],
  ['section-dates', 'Date sets'],
  ['section-debounce', 'Debounce'],
  ['section-binary', 'Binary'],
  ['section-approximate', 'Approximate'],
  ['section-point', 'Point'],
  ['section-map', 'Map view'],
]

/** Mount the page's one section spy. `spyMode` is driven by the panel's toggle. */
export function useDemoSectionSpy(spyMode: SpyMode): void {
  const location = useLocation()
  const navType = useNavigationType()
  useSectionSpy({
    sections: { selector: 'section[id^="section-"]' },
    mode: spyMode === 'fragment' ? { kind: 'fragment' } : paramMode,
    write: spyMode === 'off' ? 'off' : 'replace',
    nav: {
      location: { pathname: location.pathname, search: location.search, hash: location.hash, key: location.key },
      navType,
    },
  })
}

const label = (id: string): string => SECTION_NAV.find(([s]) => s === id)?.[1] ?? id

/** Explainer + mode toggle + a live readout driven by `useSectionInView`. */
export function SectionSpyPanel({ spyMode, setSpyMode, pageMode }: {
  spyMode: SpyMode
  setSpyMode: (m: SpyMode) => void
  pageMode: 'query' | 'hash'
}) {
  const cur = useSectionInView()
  // The spy writes the URL silently (no router update), so read the live bar here.
  const [href, setHref] = useState('')
  useEffect(() => { setHref(window.location.href.replace(window.location.origin, '')) }, [cur])

  const modes: [SpyMode, string, boolean][] = [
    ['param', '?s=…', false],
    ['fragment', '#id', pageMode === 'hash'], // refused under /hash (fragment holds params)
    ['off', 'off', false],
  ]

  return (
    <section id="section-sections" className="section">
      <h2>Section Spy (useSectionSpy)</h2>
      <p className="section-intro">
        The page names the section you're reading in the URL — as a query param
        (<code>?s=boolean</code>, so a dynamic <code>og:image</code> can see it), as a
        fragment (<code>#section-boolean</code>), or off. Scroll and watch the address bar;
        deep links land under the header and back/forward restore your scroll.
        Written silently, so no <code>useUrlState</code> consumer re-renders per frame.
      </p>
      <div className="controls">
        {modes.map(([m, lbl, disabled]) => (
          <button
            key={m}
            className={spyMode === m ? 'active' : ''}
            disabled={disabled}
            title={disabled ? 'Fragment mode is unavailable under /hash (the fragment holds params)' : undefined}
            onClick={() => setSpyMode(m)}
          >{lbl}</button>
        ))}
      </div>
      <div className="controls" style={{ marginTop: '0.5rem' }}>
        <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>
          In view: <strong>{cur ? label(cur) : '(top)'}</strong>
          {' · '}URL: <code>{href || '/'}</code>
        </div>
      </div>
      <details className="code-sample">
        <summary>Code</summary>
        <pre>{`import { useSectionSpy, useSectionInView, SectionLink } from 'use-prms/sections'
import { useLocation, useNavigationType } from 'react-router-dom'

useSectionSpy({
  sections: { selector: 'section[id^="section-"]' },
  mode: { kind: 'param', key: 's',
    encode: id => id.replace(/^section-/, ''),   // ?s=boolean
    decode: v => \`section-\${v}\` },
  nav: { location: useLocation(), navType: useNavigationType() },
})
const inView = useSectionInView()   // for TOC highlighting`}</pre>
      </details>
    </section>
  )
}

/** A sticky table of contents (desktop) driven by `useSectionInView`; items are `SectionLink`s. */
export function SectionTOC() {
  const cur = useSectionInView()
  return (
    <nav className="section-toc" aria-label="Sections">
      <div className="section-toc-title">On this page</div>
      <ul>
        {SECTION_NAV.map(([id, lbl]) => (
          <li key={id} className={cur === id ? 'current' : ''}>
            <SectionLink id={id} className="section-toc-link">{lbl}</SectionLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
