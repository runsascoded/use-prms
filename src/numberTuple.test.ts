import { describe, it, expect } from 'vitest'
import { numberTupleParam, formatSignedParts, parseSignedParts } from './numberTuple.js'
import type { NumberPath } from './numberTuple.js'

describe('numberTupleParam', () => {
  describe('flat shape, decimals encoding', () => {
    type V = { lat: number; lng: number; zoom: number }
    const def: V = { lat: 40.74, lng: -74.012, zoom: 11.8 }
    const p = numberTupleParam<V>({
      default: def,
      fields: [
        { path: 'lat', decimals: 4 },
        { path: 'lng', decimals: 4 },
        { path: 'zoom', decimals: 2 },
      ],
    })

    it('encodes default as undefined', () => {
      expect(p.encode(def)).toBeUndefined()
    })

    it('encodes non-default with `_` delimiter', () => {
      expect(p.encode({ lat: 40.76, lng: -73.98, zoom: 13 }))
        .toBe('40.7600_-73.9800_13.00')
    })

    it('decodes the full tuple', () => {
      expect(p.decode('40.76_-73.98_13.00')).toEqual({ lat: 40.76, lng: -73.98, zoom: 13 })
    })

    it('decodes per-field fallback for missing parts', () => {
      expect(p.decode('40.76_-73.98')).toEqual({ lat: 40.76, lng: -73.98, zoom: def.zoom })
    })

    it('decodes per-field fallback for unparseable parts', () => {
      expect(p.decode('40.76_garbage_13.00')).toEqual({ lat: 40.76, lng: def.lng, zoom: 13 })
    })

    it('decodes undefined / empty as default', () => {
      expect(p.decode(undefined)).toEqual(def)
      expect(p.decode('')).toEqual(def)
    })
  })

  describe('signedDelim', () => {
    type V = { lat: number; lng: number; zoom: number; pitch: number; bearing: number }
    const def: V = { lat: 40.74, lng: -74.012, zoom: 11.8, pitch: 0, bearing: 0 }
    const p = numberTupleParam<V>({
      default: def,
      fields: [
        { path: 'lat', decimals: 4 },
        { path: 'lng', decimals: 4 },
        { path: 'zoom', decimals: 2 },
        { path: 'pitch', int: true },
        { path: 'bearing', int: true },
      ],
      signedDelim: true,
    })

    it('encodes with signed-delim convention', () => {
      expect(p.encode({ lat: 40.7055, lng: -74.0682, zoom: 11.98, pitch: 27, bearing: 8 }))
        .toBe('40.7055-74.0682 11.98 27 8')
    })

    it('decodes "+" separators (URL-encoded space)', () => {
      const decoded = p.decode('40.7055-74.0682+11.98+27+8'.replace(/\+/g, ' '))
      expect(decoded.lat).toBeCloseTo(40.7055, 4)
      expect(decoded.lng).toBeCloseTo(-74.0682, 4)
      expect(decoded.pitch).toBe(27)
    })

    it('decodes underscore-delimited input (cross-mode tolerance)', () => {
      expect(p.decode('40.7055_-74.0682_11.98_27_8').lat).toBeCloseTo(40.7055, 4)
    })
  })

  describe('mixed encodings (decimals + sigfigs + int)', () => {
    type V = { x: number; y: number; n: number }
    const p = numberTupleParam<V>({
      default: { x: 0, y: 0, n: 0 },
      fields: [
        { path: 'x', decimals: 2 },
        { path: 'y', sigfigs: 3 },
        { path: 'n', int: true },
      ],
      signedDelim: true,
    })

    it('encodes each field per its kind', () => {
      // x → "1.23" (2 decimals)
      // y → "45.7" (3 sigfigs: magnitude=1, decimals=1)
      // n → "7" (truncated)
      expect(p.encode({ x: 1.234, y: 45.6789, n: 7.9 })).toBe('1.23 45.7 7')
    })

    it('sigfigs handles different magnitudes', () => {
      // y=1234 with 3 sigfigs → magnitude=3, decimals=-1 → round to 10s → "1230"
      expect(p.encode({ x: 0, y: 1234, n: 0 })).toBe('0.00 1230 0')
      // y=0.01234 with 3 sigfigs → magnitude=-2, decimals=4 → "0.0123"
      expect(p.encode({ x: 0, y: 0.01234, n: 0 })).toBe('0.00 0.0123 0')
    })

    it('roundtrips through parseFloat', () => {
      const decoded = p.decode('1.23 45.7 7')
      expect(decoded.x).toBe(1.23)
      expect(decoded.y).toBe(45.7)
      expect(decoded.n).toBe(7)
    })
  })

  describe('nested shape (dotted paths)', () => {
    type BBox = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }
    const def: BBox = { sw: { lat: 0, lng: 0 }, ne: { lat: 0, lng: 0 } }
    const p = numberTupleParam<BBox>({
      default: def,
      fields: [
        { path: 'sw.lat', decimals: 2 },
        { path: 'sw.lng', decimals: 2 },
        { path: 'ne.lat', decimals: 2 },
        { path: 'ne.lng', decimals: 2 },
      ],
      signedDelim: true,
    })

    it('encodes via dotted paths', () => {
      expect(p.encode({ sw: { lat: 1, lng: -2 }, ne: { lat: 3, lng: -4 } }))
        .toBe('1.00-2.00 3.00-4.00')
    })

    it('decodes into nested shape', () => {
      expect(p.decode('1.00-2.00 3.00-4.00')).toEqual({
        sw: { lat: 1, lng: -2 },
        ne: { lat: 3, lng: -4 },
      })
    })

    it('does not mutate the default on decode', () => {
      p.decode('1.00-2.00 3.00-4.00')
      expect(def).toEqual({ sw: { lat: 0, lng: 0 }, ne: { lat: 0, lng: 0 } })
    })

    it('per-field fallback preserves untouched nested branches', () => {
      // Only sw.lat and sw.lng provided; ne.* falls back to default.
      const def2: BBox = { sw: { lat: 0, lng: 0 }, ne: { lat: 100, lng: 200 } }
      const p2 = numberTupleParam<BBox>({
        default: def2,
        fields: [
          { path: 'sw.lat', decimals: 2 },
          { path: 'sw.lng', decimals: 2 },
          { path: 'ne.lat', decimals: 2 },
          { path: 'ne.lng', decimals: 2 },
        ],
        signedDelim: true,
      })
      expect(p2.decode('1.00-2.00')).toEqual({
        sw: { lat: 1, lng: -2 },
        ne: { lat: 100, lng: 200 },
      })
    })
  })

  describe('omitDefault: false', () => {
    type V = { x: number }
    const p = numberTupleParam<V>({
      default: { x: 0 },
      fields: [{ path: 'x', decimals: 2 }],
      omitDefault: false,
    })

    it('always emits, even when value matches default', () => {
      expect(p.encode({ x: 0 })).toBe('0.00')
      expect(p.encode({ x: 1.5 })).toBe('1.50')
    })
  })

  describe('NumberPath type', () => {
    it('accepts valid paths and rejects non-number leaves at compile time', () => {
      type T = { a: number; b: { c: number; d: string }; e: number | undefined }
      // Compile-time-only checks via type-level `expect`.
      const _ok1: NumberPath<T> = 'a'
      const _ok2: NumberPath<T> = 'b.c'
      const _ok3: NumberPath<T> = 'e'
      // @ts-expect-error 'b.d' is a string field, not a number
      const _bad1: NumberPath<T> = 'b.d'
      // @ts-expect-error 'b' itself is an object, not a number
      const _bad2: NumberPath<T> = 'b'
      // Reference the locals so the linter / tsc sees them.
      void _ok1; void _ok2; void _ok3; void _bad1; void _bad2
      expect(true).toBe(true)
    })
  })
})

describe('formatSignedParts / parseSignedParts', () => {
  it('roundtrips with fixed delimiter', () => {
    const parts = ['1.23', '-4.56', '7.89']
    const s = formatSignedParts(parts, '_', false)
    expect(s).toBe('1.23_-4.56_7.89')
    expect(parseSignedParts(s, '_', false)).toEqual(parts)
  })

  it('roundtrips with signedDelim', () => {
    const parts = ['1.23', '-4.56', '7.89']
    const s = formatSignedParts(parts, '_', true)
    expect(s).toBe('1.23-4.56 7.89')
    expect(parseSignedParts(s, '_', true)).toEqual(parts)
  })

  it('signedDelim parse returns [] for input with no numbers', () => {
    expect(parseSignedParts('garbage', '_', true)).toEqual([])
  })
})
