import { useEffect, useState } from 'react'
import {
  useUrlState,
  useUrlStates,
  boolParam,
  stringParam,
  intParam,
} from 'use-prms'

/**
 * React half of the React↔Vue parity demo. Same keys / codecs as the Vue page
 * (site/src/vue-demo/ParityDemo.vue), so identical inputs produce identical
 * URLs. The Playwright `parity` suite drives both and asserts byte-equality.
 */
export function ParityReact() {
  const [n, setN] = useUrlState('n', intParam(0))
  const [s, setS] = useUrlState('s', stringParam(''))
  const [b, setB] = useUrlState('b', boolParam)
  const [q, setQ] = useUrlState('q', stringParam(''), { debounce: 300 })
  const { values: batch, setValues: setBatch } = useUrlStates({
    bx: intParam(0),
    by: intParam(0),
  })

  // Live readout of the raw query string.
  const [search, setSearch] = useState(window.location.search)
  useEffect(() => {
    const sync = () => setSearch(window.location.search)
    window.addEventListener('popstate', sync)
    window.addEventListener('use-prms:locationchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('use-prms:locationchange', sync)
    }
  }, [])

  return (
    <main className="parity" style={{ maxWidth: '48rem', margin: '0 auto', padding: '2rem 1rem' }}>
      <header>
        <h1>
          use-prms{' '}
          <span style={{ fontSize: '0.6em', verticalAlign: 'middle', padding: '0.15em 0.5em', borderRadius: '0.5em', background: '#61dafb', color: '#000' }}>React</span>
        </h1>
        <p>
          The same URL-param codecs as the Vue demo, through <code>use-prms</code>.
          Identical inputs produce identical URLs. <a href="/vue.html">Vue version →</a>
        </p>
      </header>

      <div
        data-testid="search"
        style={{ fontFamily: 'ui-monospace, monospace', padding: '0.6rem 0.8rem', border: '1px solid #ccc', borderRadius: '0.4rem', marginBottom: '1.5rem', wordBreak: 'break-all' }}
      >
        {search || '(empty)'}
      </div>

      <section style={{ display: 'grid', gap: '1rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span>int <code>n</code></span>
          <input data-testid="n" type="number" value={n} onChange={e => setN(e.target.value === '' ? 0 : Number(e.target.value))} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span>string <code>s</code></span>
          <input data-testid="s" type="text" value={s ?? ''} onChange={e => setS(e.target.value)} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input data-testid="b" type="checkbox" checked={b} onChange={e => setB(e.target.checked)} />
          <span>bool <code>b</code></span>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span>search <code>q</code> (debounced 300ms)</span>
          <input data-testid="q" type="text" value={q ?? ''} onChange={e => setQ(e.target.value)} />
        </label>
      </section>

      <section style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span>batched <code>bx</code>/<code>by</code> = {batch.bx}/{batch.by}</span>
        <button data-testid="set-both" onClick={() => setBatch({ bx: 1, by: 2 })}>Set both (one entry)</button>
        <button data-testid="clear-both" onClick={() => setBatch({ bx: 0, by: 0 })}>Clear</button>
      </section>
    </main>
  )
}
