/**
 * @vitest-environment happy-dom
 *
 * Framework-free tests for the URL-state engine (`store.ts`). No React or Vue
 * — this is the shared oracle both bindings are built on, so the causality /
 * debounce / per-key-discard behaviour is pinned here once, independent of any
 * UI framework.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryStrategy } from './strategies.js'
import type { Param } from './types.js'
import { intParam } from './params.js'
import {
  UrlBinding,
  getUrlSnapshot,
  getServerSnapshot,
  multiToSingle,
  singleToMulti,
  toMultiCodec,
  writeParams,
  type MultiCodec,
} from './store.js'

/** A param whose `decode` returns a fresh object, to probe referential stability. */
const boxParam: Param<{ n: number }> = {
  encode: (v) => (v.n === 0 ? undefined : String(v.n)),
  decode: (e) => ({ n: e === undefined ? 0 : parseInt(e, 10) }),
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('encode/decode adapters', () => {
  it('singleToMulti / multiToSingle round-trip', () => {
    expect(singleToMulti(undefined)).toEqual([])
    expect(singleToMulti('a')).toEqual(['a'])
    expect(multiToSingle([])).toBeUndefined()
    expect(multiToSingle(['a', 'b'])).toBe('a')
  })

  it('toMultiCodec wraps a single-value Param into the MultiEncoded domain', () => {
    const codec = toMultiCodec(intParam(0))
    expect(codec.encode(5)).toEqual(['5'])
    expect(codec.encode(0)).toEqual([]) // intParam(0) drops the default
    expect(codec.decode(['5'])).toBe(5)
    expect(codec.decode([])).toBe(0)
  })
})

describe('getUrlSnapshot', () => {
  it('returns a stable reference while the raw URL is unchanged, a fresh one after', () => {
    window.history.replaceState({}, '', '/?a=1')
    const s1 = getUrlSnapshot(queryStrategy)
    const s2 = getUrlSnapshot(queryStrategy)
    expect(s1).toBe(s2)
    expect(s1).toEqual({ a: ['1'] })

    window.history.replaceState({}, '', '/?a=2')
    const s3 = getUrlSnapshot(queryStrategy)
    expect(s3).not.toBe(s1)
    expect(s3).toEqual({ a: ['2'] })
  })

  it('server snapshot is empty', () => {
    expect(getServerSnapshot()).toEqual({})
  })
})

describe('writeParams', () => {
  it('sets, overwrites, and deletes (empty array) keys in one entry', () => {
    writeParams(queryStrategy, { a: ['1'], b: ['x'] })
    expect(window.location.search).toBe('?a=1&b=x')

    writeParams(queryStrategy, { a: ['2'] })
    expect(window.location.search).toBe('?a=2&b=x')

    writeParams(queryStrategy, { a: [] })
    expect(window.location.search).toBe('?b=x')
  })
})

describe('UrlBinding.read', () => {
  const bind = (codecs: Record<string, MultiCodec<unknown>>) => {
    const b = new UrlBinding(queryStrategy, () => {})
    b.setCodecs(codecs)
    return b
  }

  it('decodes each owned key from the snapshot', () => {
    const b = bind({ a: toMultiCodec(intParam(0)), b: toMultiCodec(intParam(0)) })
    expect(b.read({ a: ['5'] })).toEqual({ a: 5, b: 0 })
  })

  it('memoizes the decoded value while encoded + codec are unchanged', () => {
    const b = bind({ a: toMultiCodec(boxParam) })
    const v1 = b.read({ a: ['5'] }).a
    const v2 = b.read({ a: ['5'] }).a
    expect(v1).toBe(v2) // same object reference
    const v3 = b.read({ a: ['6'] }).a
    expect(v3).not.toBe(v1)
    expect(v3).toEqual({ n: 6 })
  })
})

describe('UrlBinding causality (no debounce)', () => {
  it('returns the exact written value until the URL catches up', () => {
    const b = new UrlBinding(queryStrategy, () => {})
    b.setCodecs({ a: toMultiCodec(boxParam) })
    const written = { n: 5 }
    b.write({ a: written })
    expect(window.location.search).toBe('?a=5')
    // URL now says a=5; a plain decode would yield a *different* {n:5}. The
    // binding returns the authoritative instance it wrote.
    const read = b.read(getUrlSnapshot(queryStrategy)).a
    expect(read).toBe(written)
  })
})

describe('UrlBinding debounce + per-key discard', () => {
  beforeEach(() => vi.useFakeTimers())
  const restore = () => vi.useRealTimers()

  it('holds a pending value, then flushes to the URL after the delay', () => {
    const b = new UrlBinding(queryStrategy, () => {})
    b.setCodecs({ a: toMultiCodec(intParam(0)) })
    b.setDebounce(100)

    b.write({ a: 7 })
    // Not written yet; read reflects the pending value.
    expect(window.location.search).toBe('')
    expect(b.read(getUrlSnapshot(queryStrategy))).toEqual({ a: 7 })

    vi.advanceTimersByTime(100)
    expect(window.location.search).toBe('?a=7')
    restore()
  })

  it('keeps the pending value when an UNOWNED key changes externally', () => {
    const b = new UrlBinding(queryStrategy, () => {})
    b.setCodecs({ a: toMultiCodec(intParam(0)) })
    b.setDebounce(100)

    b.write({ a: 7 })
    // An external write to `s` (not owned by this binding): pending survives.
    expect(b.read({ s: ['x'] })).toEqual({ a: 7 })
    restore()
  })

  it('discards the pending value when an OWNED key changes externally', () => {
    const b = new UrlBinding(queryStrategy, () => {})
    b.setCodecs({ a: toMultiCodec(intParam(0)) })
    b.setDebounce(100)

    b.write({ a: 7 })
    // `a` itself changed externally during the window → discard, decode URL.
    expect(b.read({ a: ['3'] })).toEqual({ a: 3 })
    // And the scheduled flush was cancelled: advancing time writes nothing.
    vi.advanceTimersByTime(100)
    expect(window.location.search).toBe('')
    restore()
  })
})
