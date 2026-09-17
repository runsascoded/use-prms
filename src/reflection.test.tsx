/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, render, screen, act } from '@testing-library/react'
import { useState } from 'react'
import {
  useUrlState,
  useUrlStates,
  useMultiUrlState,
  useUrlAlias,
  intParam,
  stringParam,
  multiStringParam,
  classifyParam,
  reflectParams,
  reflectUnknown,
  describeParams,
  useParamReflection,
  __resetRegistry,
  setDefaultStrategy,
  queryStrategy,
  hashStrategy,
  updateUrl,
  type ParamReflection,
  type ParamRegistration,
} from './index.js'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  __resetRegistry()
})

afterEach(() => {
  setDefaultStrategy(queryStrategy)
})

const rowFor = (key: string, opts?: { strategy?: 'query' | 'hash' }): ParamReflection =>
  reflectParams(opts).find(p => p.key === key)!

describe('registry ref-counting', () => {
  it('counts readers of one key and drops the entry at zero', () => {
    const a = renderHook(() => useUrlState('c', intParam(0)))
    expect(rowFor('c').refs).toBe(1)

    const b = renderHook(() => useUrlState('c', intParam(0)))
    expect(rowFor('c').refs).toBe(2)

    a.unmount()
    expect(rowFor('c').refs).toBe(1)

    b.unmount()
    expect(reflectParams().find(p => p.key === 'c')).toBeUndefined()
  })

  it('keeps query and hash entries for the same key apart', () => {
    const q = renderHook(() => useUrlState('c', intParam(0)))
    setDefaultStrategy(hashStrategy)
    const h = renderHook(() => useUrlState('c', intParam(0)))
    setDefaultStrategy(queryStrategy)

    expect(reflectParams({ strategy: 'query' }).map(p => p.key)).toEqual(['c'])
    expect(reflectParams({ strategy: 'hash' }).map(p => p.key)).toEqual(['c'])
    expect(rowFor('c', { strategy: 'query' }).strategy).toBe('query')
    expect(rowFor('c', { strategy: 'hash' }).strategy).toBe('hash')

    q.unmount()
    h.unmount()
  })
})

describe('reflectParams', () => {
  it('classifies absent / canonical / stale / malformed to match classifyParam', () => {
    const scenarios: Array<{
      search: string
      state: ParamReflection['state']
      raw?: string
      canonical?: string
      value: number
    }> = [
      { search: '/',       state: 'absent',                              value: 0 },
      { search: '/?c=5',   state: 'canonical', raw: '5',                 value: 5 },
      { search: '/?c=05',  state: 'stale',     raw: '05', canonical: '5', value: 5 },
      { search: '/?c=abc', state: 'malformed', raw: 'abc', canonical: undefined, value: 0 },
    ]
    for (const s of scenarios) {
      __resetRegistry()
      window.history.replaceState({}, '', s.search)
      const { unmount } = renderHook(() => useUrlState('c', intParam(0)))

      // The reflection row agrees with the low-level classifier for the same raw
      const raw = s.search.includes('c=') ? s.search.split('c=')[1] : undefined
      const expectedDiag =
        s.state === 'absent' ? { state: 'absent' }
          : s.state === 'canonical' ? { state: 'canonical', raw: s.raw }
            : { state: s.state, raw: s.raw, canonical: s.canonical }
      expect(classifyParam(intParam(0), raw)).toEqual(expectedDiag)

      const row = rowFor('c')
      expect(row.state).toBe(s.state)
      expect(row.raw).toBe(s.raw)
      expect(row.canonical).toBe(s.canonical)
      expect(row.value).toBe(s.value)
      expect(row.refs).toBe(1)

      unmount()
    }
  })

  it('reports defaultEncoded as param.encode(param.decode(undefined))', () => {
    const { unmount } = renderHook(() => useUrlState('c', intParam(7)))
    const param = intParam(7)
    expect(rowFor('c').defaultEncoded).toBe(param.encode(param.decode(undefined)))
    unmount()
  })

  it('carries describe metadata', () => {
    const { unmount } = renderHook(() =>
      useUrlState('c', intParam(0), {
        describe: { label: 'Count', description: 'how many', examples: ['5', '10'] },
      }),
    )
    const row = rowFor('c')
    expect(row.label).toBe('Count')
    expect(row.description).toBe('how many')
    expect(row.examples).toEqual(['5', '10'])
    unmount()
  })

  it('registers each key of useUrlStates with its per-key describe', () => {
    const { unmount } = renderHook(() =>
      useUrlStates(
        { a: intParam(0), b: intParam(0) },
        { describe: { a: { label: 'Alpha' } } },
      ),
    )
    expect(reflectParams().map(p => `${p.key}:${p.label ?? ''}`).sort()).toEqual(['a:Alpha', 'b:'])
    unmount()
  })

  it('reports a multi-value param with joined raw and decoded array value', () => {
    window.history.replaceState({}, '', '/?tag=x&tag=y')
    const { unmount } = renderHook(() => useMultiUrlState('tag', multiStringParam()))
    const row = rowFor('tag')
    expect(row.multi).toBe(true)
    expect(row.raw).toBe('x,y')
    expect(row.value).toEqual(['x', 'y'])
    expect(row.state).toBe('canonical')
    unmount()
  })

  it('merges a catalogue entry under a live hook of the same key (live wins, catalogue fills gaps)', () => {
    const dispose = describeParams({ c: { label: 'Cat label', description: 'from catalogue' } })
    const { unmount } = renderHook(() =>
      useUrlState('c', intParam(0), { describe: { label: 'Live label' } }),
    )
    const rows = reflectParams().filter(p => p.key === 'c')
    expect(rows.length).toBe(1)
    expect(rows[0].refs).toBe(1)
    expect(rows[0].label).toBe('Live label')
    expect(rows[0].description).toBe('from catalogue')
    unmount()
    dispose()
  })
})

describe('reflectUnknown', () => {
  it('lists URL keys nothing registered, with raw values', () => {
    window.history.replaceState({}, '', '/?c=5&legacy=9')
    const { unmount } = renderHook(() => useUrlState('c', intParam(0)))
    expect(reflectUnknown()).toEqual([{ key: 'legacy', raw: '9' }])
    unmount()
  })

  it('does not report a describeParams catalogue key as unknown, and reflects it with refs 0', () => {
    window.history.replaceState({}, '', '/?known=3')
    const dispose = describeParams({ known: { label: 'Known', param: intParam(0) } })
    expect(reflectUnknown()).toEqual([])
    const row = rowFor('known')
    expect(row.refs).toBe(0)
    expect(row.label).toBe('Known')
    expect(row.state).toBe('canonical')
    expect(row.value).toBe(3)
    dispose()
  })
})

describe('useUrlAlias reflection', () => {
  it('registers one entry claiming all keys and reports the live key', () => {
    window.history.replaceState({}, '', '/?mp=2375705')
    const { unmount } = renderHook(() =>
      useUrlAlias<string>({
        keys: ['m', 'mp'] as const,
        params: {
          m: stringParam(),
          mp: { encode: v => (v ? v.slice(3) : undefined), decode: v => (v ? `mp-${v}` : undefined) },
        },
        merge: ({ m, mp }) => m ?? mp,
        canonicalizeOnMount: false,
      }),
    )
    const row = rowFor('m')
    expect(row.keys).toEqual(['m', 'mp'])
    expect(row.liveKey).toBe('mp')
    expect(row.value).toBe('mp-2375705')
    expect(reflectUnknown()).toEqual([])
    unmount()
  })
})

describe('useParamReflection', () => {
  it('re-renders on reader mount/unmount and on URL change', () => {
    function Reader() {
      useUrlState('c', intParam(0))
      return null
    }
    let setShow!: (v: boolean) => void
    function App() {
      const [show, setShowState] = useState(false)
      setShow = setShowState
      const { params } = useParamReflection()
      return (
        <div>
          <span data-testid="rows">
            {params.map(p => `${p.key}=${String(p.value)}:${p.state}:${p.refs}`).join('|')}
          </span>
          {show && <Reader />}
        </div>
      )
    }
    render(<App />)
    expect(screen.getByTestId('rows').textContent).toBe('')

    act(() => setShow(true))
    expect(screen.getByTestId('rows').textContent).toBe('c=0:absent:1')

    act(() => updateUrl({ c: '5' }))
    expect(screen.getByTestId('rows').textContent).toBe('c=5:canonical:1')

    act(() => setShow(false))
    expect(screen.getByTestId('rows').textContent).toBe('')
  })
})

describe('types', () => {
  it('accepts describe on every hook and ParamReflection is a ParamRegistration', () => {
    renderHook(() => useUrlState('a', intParam(0), { describe: { label: 'A' } })).unmount()
    renderHook(() => useUrlStates({ a: intParam(0) }, { describe: { a: { label: 'A' } } })).unmount()
    renderHook(() => useMultiUrlState('t', multiStringParam(), { describe: { label: 'T' } })).unmount()
    renderHook(() =>
      useUrlAlias<string>({
        keys: ['m'] as const,
        params: { m: stringParam() },
        merge: ({ m }) => m,
        describe: { label: 'M' },
      }),
    ).unmount()

    renderHook(() => useUrlState('a', intParam(0)))
    const [row] = reflectParams()
    const reg: ParamRegistration = row // ParamReflection extends ParamRegistration
    expect(reg.key).toBe('a')
  })
})
