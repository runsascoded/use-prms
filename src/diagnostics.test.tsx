/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  classifyParam,
  inspectUrl,
  cleanUrl,
  useUrlState,
  useUrlStates,
  intParam,
  stringParam,
  llzParam,
} from './index.js'

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('classifyParam', () => {
  describe('absent', () => {
    it('returns absent for undefined raw', () => {
      expect(classifyParam(intParam(0), undefined)).toEqual({ state: 'absent' })
    })
  })

  describe('canonical', () => {
    it('intParam with default value as encoded equivalent', () => {
      // intParam(0).encode(0) === undefined; raw='0' decodes to 0, re-encodes to undefined → not canonical
      // canonical example: intParam(0).encode(5) === '5'; raw='5' decodes to 5, re-encodes to '5' → canonical
      expect(classifyParam(intParam(0), '5')).toEqual({ state: 'canonical', raw: '5' })
    })

    it('llzParam in current canonical (signDelim) format', () => {
      const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
      const raw = '40.7600-73.9800 13.00'
      expect(classifyParam(p, raw)).toEqual({ state: 'canonical', raw })
    })
  })

  describe('stale', () => {
    it('llzParam in legacy underscore-delim format (non-default value)', () => {
      const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
      const raw = '40.7600_-73.9800_13.00'
      expect(classifyParam(p, raw)).toEqual({
        state: 'stale',
        raw,
        canonical: '40.7600-73.9800 13.00',
      })
    })
  })

  describe('malformed', () => {
    it('intParam with non-numeric raw falls back to default', () => {
      // raw='garbage' → decode → 0 (default) → encode → undefined → !== 'garbage'
      expect(classifyParam(intParam(0), 'garbage')).toEqual({
        state: 'malformed',
        raw: 'garbage',
        canonical: undefined,
      })
    })

    it('llzParam with garbage raw', () => {
      const p = llzParam({ default: { lat: 1, lng: 2, zoom: 3 } })
      // signDelim regex matches no numbers in 'totally-not-coords-X' literal,
      // so all fields fall back to default and re-encode is undefined.
      // (Use a string with no digits to make this unambiguous.)
      expect(classifyParam(p, 'foo')).toEqual({
        state: 'malformed',
        raw: 'foo',
        canonical: undefined,
      })
    })
  })
})

describe('inspectUrl', () => {
  it('reports unrecognized keys', () => {
    window.history.replaceState({}, '', '/?known=5&unknown=foo&extra=bar')
    const diag = inspectUrl({ known: intParam(0) })
    expect(diag.unrecognized).toEqual(['unknown', 'extra'])
    expect(diag.malformed).toEqual([])
    expect(diag.stale).toEqual([])
  })

  it('reports stale keys with canonical form', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00')
    const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    const diag = inspectUrl({ ll: p })
    expect(diag.unrecognized).toEqual([])
    expect(diag.malformed).toEqual([])
    expect(diag.stale).toEqual([
      { key: 'll', raw: '40.76_-73.98_13.00', canonical: '40.7600-73.9800 13.00' },
    ])
  })

  it('reports malformed keys', () => {
    window.history.replaceState({}, '', '/?n=garbage')
    const diag = inspectUrl({ n: intParam(0) })
    expect(diag.malformed).toEqual([{ key: 'n', raw: 'garbage', canonical: undefined }])
    expect(diag.stale).toEqual([])
    expect(diag.unrecognized).toEqual([])
  })

  it('canonical URL produces an empty diagnostic', () => {
    window.history.replaceState({}, '', '/?n=42')
    const diag = inspectUrl({ n: intParam(0) })
    expect(diag).toEqual({ unrecognized: [], malformed: [], stale: [] })
  })

  it('handles a mix of all three states in one call', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00&n=garbage&legacy=foo')
    const diag = inspectUrl({
      ll: llzParam({ default: { lat: 0, lng: 0, zoom: 0 } }),
      n: intParam(0),
    })
    expect(diag.unrecognized).toEqual(['legacy'])
    expect(diag.malformed).toEqual([{ key: 'n', raw: 'garbage', canonical: undefined }])
    expect(diag.stale).toEqual([
      { key: 'll', raw: '40.76_-73.98_13.00', canonical: '40.7600-73.9800 13.00' },
    ])
  })
})

describe('cleanUrl', () => {
  it('default policy is a no-op (returns diag, leaves URL unchanged)', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00&legacy=foo')
    const before = window.location.search
    const diag = cleanUrl({ ll: llzParam({ default: { lat: 0, lng: 0, zoom: 0 } }) })
    expect(window.location.search).toBe(before)
    expect(diag.unrecognized).toEqual(['legacy'])
    expect(diag.stale).toHaveLength(1)
  })

  it('unrecognized: strip removes unknown keys', () => {
    window.history.replaceState({}, '', '/?n=5&legacy=foo&also=bar')
    cleanUrl({ n: intParam(0) }, { unrecognized: 'strip' })
    // n=5 stays canonical; legacy and also are stripped.
    expect(window.location.search).toBe('?n=5')
  })

  it('stale: normalize re-emits canonical form', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00')
    const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    cleanUrl({ ll: p }, { stale: 'normalize' })
    // signDelim emits '+' (URL-encoded space) and '-' as separators.
    expect(window.location.search).toBe('?ll=40.7600-73.9800+13.00')
  })

  it('malformed: reset strips garbage values', () => {
    window.history.replaceState({}, '', '/?n=garbage')
    cleanUrl({ n: intParam(0) }, { malformed: 'reset' })
    expect(window.location.search).toBe('')
  })

  it('combines policies independently', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00&n=garbage&legacy=foo')
    cleanUrl(
      {
        ll: llzParam({ default: { lat: 0, lng: 0, zoom: 0 } }),
        n: intParam(0),
      },
      { unrecognized: 'strip', malformed: 'reset', stale: 'normalize' },
    )
    expect(window.location.search).toBe('?ll=40.7600-73.9800+13.00')
  })

  it('returns diagnostics observed before the cleanup', () => {
    window.history.replaceState({}, '', '/?legacy=foo')
    const diag = cleanUrl({}, { unrecognized: 'strip' })
    expect(diag.unrecognized).toEqual(['legacy'])
  })
})

describe('useUrlState 3-tuple', () => {
  it('legacy 2-element destructuring still works (no warnings, correct types at runtime)', () => {
    window.history.replaceState({}, '', '/?n=42')
    const { result } = renderHook(() => useUrlState('n', intParam(0)))
    // This is the existing API shape; the 3rd slot is additive.
    const [value, setValue] = result.current
    expect(value).toBe(42)
    expect(typeof setValue).toBe('function')
  })

  it('returns diagnostic as 3rd tuple element', () => {
    window.history.replaceState({}, '', '/?n=5')
    const { result } = renderHook(() => useUrlState('n', intParam(0)))
    const [value, , diag] = result.current
    expect(value).toBe(5)
    expect(diag).toEqual({ state: 'canonical', raw: '5' })
  })

  it('reports malformed for garbage URL', () => {
    window.history.replaceState({}, '', '/?n=garbage')
    const { result } = renderHook(() => useUrlState('n', intParam(0)))
    const [value, , diag] = result.current
    expect(value).toBe(0) // fell back to default
    expect(diag).toEqual({ state: 'malformed', raw: 'garbage', canonical: undefined })
  })

  it('reports stale for legacy-format llzParam URL', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00')
    const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    const { result } = renderHook(() => useUrlState('ll', p))
    const [value, , diag] = result.current
    expect(value.lat).toBeCloseTo(40.76, 2)
    expect(diag).toEqual({
      state: 'stale',
      raw: '40.76_-73.98_13.00',
      canonical: '40.7600-73.9800 13.00',
    })
  })

  it('fires onDiagnostic callback', () => {
    window.history.replaceState({}, '', '/?n=garbage')
    const onDiagnostic = vi.fn()
    renderHook(() => useUrlState('n', intParam(0), { onDiagnostic }))
    expect(onDiagnostic).toHaveBeenCalledWith({
      state: 'malformed',
      raw: 'garbage',
      canonical: undefined,
    })
  })
})

describe('useUrlStates diagnostics', () => {
  it('returns diagnostics field', () => {
    window.history.replaceState({}, '', '/?known=5&unknown=foo')
    const { result } = renderHook(() =>
      useUrlStates({ known: intParam(0) })
    )
    expect(result.current.diagnostics.unrecognized).toEqual(['unknown'])
  })

  it('cleanOnMount strips unrecognized keys at mount', () => {
    window.history.replaceState({}, '', '/?known=5&legacy=foo')
    renderHook(() =>
      useUrlStates(
        { known: intParam(0) },
        { cleanOnMount: { unrecognized: 'strip' } },
      )
    )
    expect(window.location.search).toBe('?known=5')
  })

  it('cleanOnMount normalizes stale values', () => {
    window.history.replaceState({}, '', '/?ll=40.76_-73.98_13.00')
    const p = llzParam({ default: { lat: 0, lng: 0, zoom: 0 } })
    renderHook(() =>
      useUrlStates({ ll: p }, { cleanOnMount: { stale: 'normalize' } })
    )
    expect(window.location.search).toBe('?ll=40.7600-73.9800+13.00')
  })

  it('fires onDiagnostics with the structured report', () => {
    window.history.replaceState({}, '', '/?known=garbage&legacy=foo')
    const onDiagnostics = vi.fn()
    renderHook(() =>
      useUrlStates({ known: intParam(0) }, { onDiagnostics })
    )
    expect(onDiagnostics).toHaveBeenCalledTimes(1)
    expect(onDiagnostics.mock.calls[0][0]).toEqual({
      unrecognized: ['legacy'],
      malformed: [{ key: 'known', raw: 'garbage', canonical: undefined }],
      stale: [],
    })
  })

  it('observe-only without acting (onDiagnostics + no cleanOnMount)', () => {
    window.history.replaceState({}, '', '/?legacy=foo')
    const onDiagnostics = vi.fn()
    renderHook(() =>
      useUrlStates({ x: stringParam() }, { onDiagnostics })
    )
    // URL is untouched
    expect(window.location.search).toBe('?legacy=foo')
    // But the caller still got the report
    expect(onDiagnostics.mock.calls[0][0].unrecognized).toEqual(['legacy'])
  })
})

describe('cleanUrl edge cases', () => {
  it('no-op when nothing matches the policy', () => {
    window.history.replaceState({}, '', '/?n=5')
    const before = window.location.search
    cleanUrl({ n: intParam(0) }, { unrecognized: 'strip', stale: 'normalize', malformed: 'reset' })
    expect(window.location.search).toBe(before)
  })

  it('handles fully canonical URL with no policy', () => {
    window.history.replaceState({}, '', '/?n=5')
    const diag = cleanUrl({ n: intParam(0) })
    expect(diag).toEqual({ unrecognized: [], malformed: [], stale: [] })
    expect(window.location.search).toBe('?n=5')
  })
})
