/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Param } from './index.js'
import { stringParam } from './params.js'
import { useUrlAlias } from './useUrlAlias.js'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Param that decodes a bare numeric id into `mp-<id>` (and inverse). */
const mpAliasParam: Param<string | undefined> = {
  encode: v => (v ? v.slice(3) : undefined),
  decode: v => (v ? `mp-${v}` : undefined),
}

const elvisInput = {
  keys: ['m', 'mp'] as const,
  params: {
    m: stringParam(),
    mp: mpAliasParam,
  },
  merge: ({ m, mp }: Record<string, string | undefined>): string | undefined | Error => {
    if (m && mp && m !== mp) return new Error(`m=${m} conflicts with mp=${mp}`)
    return m ?? mp
  },
}

describe('useUrlAlias — canonicalize on mount', () => {
  it('leaves canonical-only URL unchanged', () => {
    window.history.replaceState({}, '', '/?m=mp-2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBe('mp-2375705')
    expect(window.location.search).toBe('?m=mp-2375705')
  })

  it('adopts alias value and strips alias key', () => {
    window.history.replaceState({}, '', '/?mp=2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBe('mp-2375705')
    expect(window.location.search).toBe('?m=mp-2375705')
  })

  it('canonical wins on conflict; strips alias and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState({}, '', '/?m=mp-149&mp=2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBe('mp-149')
    expect(window.location.search).toBe('?m=mp-149')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe(
      '[use-prms] useUrlAlias: m=mp-149 conflicts with mp=mp-2375705',
    )
  })

  it('empty URL yields undefined state and stays empty', () => {
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBeUndefined()
    expect(window.location.search).toBe('')
  })

  it('canonicalizeOnMount: false leaves alias keys in place', () => {
    window.history.replaceState({}, '', '/?mp=2375705')
    const { result } = renderHook(() =>
      useUrlAlias({ ...elvisInput, canonicalizeOnMount: false }),
    )
    expect(result.current[0]).toBe('mp-2375705')
    expect(window.location.search).toBe('?mp=2375705')
  })
})

describe('useUrlAlias — conflict modes', () => {
  it('"throw" rethrows the merge error', () => {
    window.history.replaceState({}, '', '/?m=mp-149&mp=2375705')
    expect(() =>
      renderHook(() =>
        useUrlAlias({ ...elvisInput, onConflict: 'throw' }),
      ),
    ).toThrowError('m=mp-149 conflicts with mp=mp-2375705')
  })

  it('function callback receives the error and adopts canonical', () => {
    const onConflict = vi.fn<(e: Error) => void>()
    window.history.replaceState({}, '', '/?m=mp-149&mp=2375705')
    const { result } = renderHook(() =>
      useUrlAlias({ ...elvisInput, onConflict }),
    )
    expect(result.current[0]).toBe('mp-149')
    expect(onConflict).toHaveBeenCalledTimes(1)
    expect(onConflict.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(onConflict.mock.calls[0][0].message).toBe(
      'm=mp-149 conflicts with mp=mp-2375705',
    )
  })

  it('thrown merge errors are caught the same as returned errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState({}, '', '/?m=A&mp=B')
    const { result } = renderHook(() =>
      useUrlAlias<string>({
        keys: ['m', 'mp'] as const,
        params: {
          m: stringParam(),
          mp: stringParam(),
        },
        merge: ({ m, mp }) => {
          if (m && mp && m !== mp) throw new Error(`thrown: ${m}/${mp}`)
          return m ?? mp
        },
      }),
    )
    expect(result.current[0]).toBe('A')
    expect(warn).toHaveBeenCalledWith('[use-prms] useUrlAlias: thrown: A/B')
  })

  it('non-Error throws are normalized to Error', () => {
    const onConflict = vi.fn<(e: Error) => void>()
    window.history.replaceState({}, '', '/?m=A&mp=B')
    renderHook(() =>
      useUrlAlias<string>({
        keys: ['m', 'mp'] as const,
        params: { m: stringParam(), mp: stringParam() },
        merge: () => { throw 'plain-string-conflict' },
        onConflict,
      }),
    )
    expect(onConflict).toHaveBeenCalledTimes(1)
    const err = onConflict.mock.calls[0][0]
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('plain-string-conflict')
  })
})

describe('useUrlAlias — setValue', () => {
  it('writes only to the canonical key', () => {
    window.history.replaceState({}, '', '/?mp=2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(window.location.search).toBe('?m=mp-2375705')

    act(() => {
      result.current[1]('mp-1000020')
    })
    expect(result.current[0]).toBe('mp-1000020')
    expect(window.location.search).toBe('?m=mp-1000020')
  })

  it('clears canonical key when value is undefined', () => {
    window.history.replaceState({}, '', '/?m=mp-2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    act(() => {
      result.current[1](undefined)
    })
    expect(result.current[0]).toBeUndefined()
    expect(window.location.search).toBe('')
  })

  it('strips aliases on subsequent setValue', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    window.history.replaceState({}, '', '/?m=mp-2375705')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    // Simulate external nav re-introducing an alias key
    act(() => {
      window.history.replaceState({}, '', '/?m=mp-2375705&mp=999')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    act(() => {
      result.current[1]('mp-1000020')
    })
    expect(window.location.search).toBe('?m=mp-1000020')
  })
})

describe('useUrlAlias — reactivity', () => {
  it('re-resolves on external URL change', () => {
    window.history.replaceState({}, '', '/?m=mp-100')
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBe('mp-100')

    act(() => {
      window.history.replaceState({}, '', '/?m=mp-200')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current[0]).toBe('mp-200')
  })

  it('re-resolves alias-only URL after external nav (no re-canonicalize)', () => {
    const { result } = renderHook(() => useUrlAlias(elvisInput))
    expect(result.current[0]).toBeUndefined()

    act(() => {
      window.history.replaceState({}, '', '/?mp=42')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current[0]).toBe('mp-42')
    expect(window.location.search).toBe('?mp=42')
  })
})

describe('useUrlAlias — 3+ keys', () => {
  /** Three-key form: canonical `m`, plus aliases `mp` and `mpid`. */
  const threeKeyInput = {
    keys: ['m', 'mp', 'mpid'] as const,
    params: {
      m: stringParam(),
      mp: mpAliasParam,
      mpid: mpAliasParam,
    },
    merge: ({ m, mp, mpid }: Record<string, string | undefined>) => {
      const found = [m, mp, mpid].filter((v): v is string => v !== undefined)
      const unique = new Set(found)
      if (unique.size > 1) return new Error(`conflict: ${[...unique].join(' vs ')}`)
      return found[0]
    },
  }

  it('adopts alias from any non-canonical key', () => {
    window.history.replaceState({}, '', '/?mpid=42')
    const { result } = renderHook(() => useUrlAlias(threeKeyInput))
    expect(result.current[0]).toBe('mp-42')
    expect(window.location.search).toBe('?m=mp-42')
  })

  it('strips all alias keys on canonicalization', () => {
    window.history.replaceState({}, '', '/?mp=42&mpid=42')
    const { result } = renderHook(() => useUrlAlias(threeKeyInput))
    expect(result.current[0]).toBe('mp-42')
    expect(window.location.search).toBe('?m=mp-42')
  })
})
