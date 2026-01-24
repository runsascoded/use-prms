import { describe, it, expect } from 'vitest'
import {
  toFloat,
  fromFloat,
  toFixedPoint,
  fromFixedPoint,
  BitBuffer,
  precisionSchemes,
  floatParam,
  base64FloatParam,
  pointParam,
  encodeFloatAllModes,
  encodePointAllModes,
} from './float'

describe('toFloat/fromFloat', () => {
  it('roundtrips positive numbers', () => {
    const values = [1, 1.5, 3.14159, 100.25, 0.001]
    for (const v of values) {
      const f = toFloat(v)
      const result = fromFloat(f)
      expect(result).toBeCloseTo(v, 10)
    }
  })

  it('roundtrips negative numbers', () => {
    const values = [-1, -1.5, -3.14159, -100.25, -0.001]
    for (const v of values) {
      const f = toFloat(v)
      expect(f.neg).toBe(true)
      const result = fromFloat(f)
      expect(result).toBeCloseTo(v, 10)
    }
  })

  it('handles zero', () => {
    const f = toFloat(0)
    expect(f.neg).toBe(false)
    expect(fromFloat(f)).toBe(0)
  })

  it('decomposes correctly', () => {
    const f = toFloat(2.0)
    expect(f.neg).toBe(false)
    expect(f.exp).toBe(1) // 2^1 = 2
    expect(f.mant).toBe(0n) // exact power of 2
  })
})

describe('BitBuffer', () => {
  describe('encodeInt/decodeInt', () => {
    it('roundtrips small integers', () => {
      const buf = new BitBuffer()
      buf.encodeInt(5, 3)
      buf.encodeInt(7, 4)
      buf.encodeInt(15, 5)

      buf.seek(0)
      expect(buf.decodeInt(3)).toBe(5)
      expect(buf.decodeInt(4)).toBe(7)
      expect(buf.decodeInt(5)).toBe(15)
    })

    it('handles non-byte-aligned boundaries', () => {
      const buf = new BitBuffer()
      buf.encodeInt(0b10110, 5)
      buf.encodeInt(0b11001, 5)

      buf.seek(0)
      expect(buf.decodeInt(5)).toBe(0b10110)
      expect(buf.decodeInt(5)).toBe(0b11001)
    })
  })

  describe('encodeBigInt/decodeBigInt', () => {
    it('roundtrips large integers', () => {
      const buf = new BitBuffer()
      const big = 0xabcdef1234567890n
      buf.encodeBigInt(big, 64)

      buf.seek(0)
      expect(buf.decodeBigInt(64)).toBe(big)
    })
  })

  describe('encodeFixedPoints/decodeFixedPoints', () => {
    it('roundtrips single float', () => {
      const buf = new BitBuffer()
      const scheme = precisionSchemes[1] // 22 mant bits
      buf.encodeFixedPoints([3.14159], scheme)

      buf.seek(0)
      const [result] = buf.decodeFixedPoints(1, scheme)
      expect(result).toBeCloseTo(3.14159, 5)
    })

    it('roundtrips multiple floats with shared exponent', () => {
      const buf = new BitBuffer()
      const scheme = precisionSchemes[2] // 28 mant bits
      const values = [1.5, 2.5, 3.5]
      buf.encodeFixedPoints(values, scheme)

      buf.seek(0)
      const results = buf.decodeFixedPoints(3, scheme)
      for (let i = 0; i < values.length; i++) {
        expect(results[i]).toBeCloseTo(values[i], 6)
      }
    })

    it('handles negative floats', () => {
      const buf = new BitBuffer()
      const scheme = precisionSchemes[1]
      buf.encodeFixedPoints([-3.14159, 2.71828], scheme)

      buf.seek(0)
      const [a, b] = buf.decodeFixedPoints(2, scheme)
      expect(a).toBeCloseTo(-3.14159, 5)
      expect(b).toBeCloseTo(2.71828, 5)
    })
  })

  describe('toBytes/fromBytes', () => {
    it('roundtrips bytes', () => {
      const buf = new BitBuffer()
      buf.encodeInt(0xab, 8)
      buf.encodeInt(0xcd, 8)
      const bytes = buf.toBytes()

      const buf2 = BitBuffer.fromBytes(bytes)
      expect(buf2.decodeInt(8)).toBe(0xab)
      expect(buf2.decodeInt(8)).toBe(0xcd)
    })
  })

  describe('toBase64/fromBase64', () => {
    it('roundtrips via base64', () => {
      const buf = new BitBuffer()
      buf.encodeInt(0xab, 8)
      buf.encodeInt(0xcd, 8)
      const base64 = buf.toBase64()

      const buf2 = BitBuffer.fromBase64(base64)
      expect(buf2.decodeInt(8)).toBe(0xab)
      expect(buf2.decodeInt(8)).toBe(0xcd)
    })

    it('produces URL-safe base64', () => {
      const buf = new BitBuffer()
      buf.encodeInt(0xff, 8)
      buf.encodeInt(0xff, 8)
      const base64 = buf.toBase64()

      expect(base64).not.toContain('+')
      expect(base64).not.toContain('/')
    })

    it('roundtrips complex bit patterns', () => {
      const buf = new BitBuffer()
      buf.encodeInt(7, 3)       // 3 bits
      buf.encodeInt(255, 8)     // 8 bits
      buf.encodeBigInt(0x123456789ABCDEFn, 60) // 60 bits
      const base64 = buf.toBase64()

      const buf2 = BitBuffer.fromBase64(base64)
      expect(buf2.decodeInt(3)).toBe(7)
      expect(buf2.decodeInt(8)).toBe(255)
      expect(buf2.decodeBigInt(60)).toBe(0x123456789ABCDEFn)
    })
  })
})

describe('floatParam with string encoding', () => {
  const param = floatParam({ encoding: 'string', decimals: 2, default: 0 })

  it('encodes with truncation and full precision', () => {
    expect(param.encode(3.14159)).toBe('3.14')
    expect(param.encode(3.1)).toBe('3.10')  // Always shows full precision
    expect(param.encode(3)).toBe('3.00')
  })

  it('encodes default as undefined', () => {
    expect(param.encode(0)).toBeUndefined()
  })

  it('decodes correctly', () => {
    expect(param.decode('3.14')).toBe(3.14)
    expect(param.decode('3.1')).toBe(3.1)
    expect(param.decode('3')).toBe(3)
  })

  it('decodes undefined as default', () => {
    expect(param.decode(undefined)).toBe(0)
    expect(param.decode('')).toBe(0)
  })

  it('roundtrips', () => {
    const values = [1.23, -4.56, 100.99, 0.01]
    for (const v of values) {
      const encoded = param.encode(v)
      const decoded = param.decode(encoded)
      expect(decoded).toBeCloseTo(v, 2)
    }
  })
})

describe('base64FloatParam', () => {
  describe('lossless (default)', () => {
    const param = base64FloatParam(0)

    it('encodes to 11 base64 chars', () => {
      const encoded = param.encode(3.14159)
      expect(encoded).toBeDefined()
      expect(encoded!.length).toBe(11) // 8 bytes = 11 base64 chars
      // Should not contain URL-unsafe chars
      expect(encoded).not.toContain('+')
      expect(encoded).not.toContain('/')
    })

    it('encodes default as undefined', () => {
      expect(param.encode(0)).toBeUndefined()
    })

    it('roundtrips exactly', () => {
      const values = [Math.PI, Math.E, 0.1 + 0.2, 123.456789012345]
      for (const v of values) {
        const encoded = param.encode(v)
        const decoded = param.decode(encoded)
        expect(decoded).toBe(v) // Exact equality
      }
    })
  })

  describe('lossy with exp+mant', () => {
    const param = base64FloatParam({ exp: 5, mant: 22, default: 0 })

    it('encodes to shorter base64', () => {
      const encoded = param.encode(3.14159)
      expect(encoded).toBeDefined()
      expect(encoded!.length).toBeLessThan(11)
    })

    it('decodes approximately', () => {
      const encoded = param.encode(3.14159)
      const decoded = param.decode(encoded)
      expect(decoded).toBeCloseTo(3.14159, 5)
    })

    it('roundtrips approximately', () => {
      const values = [1.23, -4.56, 100.99, 0.001, -0.001]
      for (const v of values) {
        const encoded = param.encode(v)
        const decoded = param.decode(encoded)
        expect(decoded).toBeCloseTo(v, 4)
      }
    })
  })

  describe('lossy with precision string', () => {
    const param = base64FloatParam({ precision: '5+22', default: 0 })

    it('encodes same as exp+mant', () => {
      const paramExplicit = base64FloatParam({ exp: 5, mant: 22, default: 0 })
      const encoded1 = param.encode(Math.PI)
      const encoded2 = paramExplicit.encode(Math.PI)
      expect(encoded1).toBe(encoded2)
    })
  })

  it('different precision levels produce different lengths', () => {
    const lowPrecision = base64FloatParam({ exp: 5, mant: 16 })
    const highPrecision = base64FloatParam({ exp: 5, mant: 40 })

    const lowEncoded = lowPrecision.encode(3.14159)!
    const highEncoded = highPrecision.encode(3.14159)!

    expect(lowEncoded.length).toBeLessThan(highEncoded.length)
  })
})

describe('pointParam', () => {
  describe('string encoding', () => {
    const param = pointParam({ encoding: 'string', decimals: 2 })

    it('encodes as "x y" with space (positive y)', () => {
      expect(param.encode({ x: 1.234, y: 5.678 })).toBe('1.23 5.68')
    })

    it('encodes as "x-y" without space (negative y)', () => {
      expect(param.encode({ x: 1.234, y: -5.678 })).toBe('1.23-5.68')
    })

    it('encodes null as undefined', () => {
      expect(param.encode(null)).toBeUndefined()
    })

    it('decodes space-delimited correctly', () => {
      const decoded = param.decode('1.23 5.68')
      expect(decoded).toEqual({ x: 1.23, y: 5.68 })
    })

    it('decodes minus-delimited correctly', () => {
      const decoded = param.decode('1.23-5.68')
      expect(decoded).toEqual({ x: 1.23, y: -5.68 })
    })

    it('decodes negative x with negative y correctly', () => {
      const decoded = param.decode('-1.23-5.68')
      expect(decoded).toEqual({ x: -1.23, y: -5.68 })
    })

    it('decodes undefined as null', () => {
      expect(param.decode(undefined)).toBeNull()
    })

    it('roundtrips', () => {
      const point = { x: 1.234, y: 5.678 }
      const encoded = param.encode(point)
      const decoded = param.decode(encoded)
      expect(decoded!.x).toBeCloseTo(point.x, 2)
      expect(decoded!.y).toBeCloseTo(point.y, 2)
    })
  })

  describe('base64 encoding', () => {
    const param = pointParam({ encoding: 'base64', precision: 22 })

    it('encodes to base64', () => {
      const encoded = param.encode({ x: 1.234, y: 5.678 })
      expect(encoded).toBeDefined()
      expect(encoded!.length).toBeGreaterThan(0)
    })

    it('is more compact than string for same precision', () => {
      const stringParam = pointParam({ encoding: 'string', decimals: 6 })
      const binaryParam = pointParam({ encoding: 'base64', precision: 28 })

      const point = { x: 37.7749, y: -122.4194 }
      const stringEncoded = stringParam.encode(point)!
      const binaryEncoded = binaryParam.encode(point)!

      expect(binaryEncoded.length).toBeLessThan(stringEncoded.length)
    })

    it('roundtrips', () => {
      const point = { x: 37.7749, y: -122.4194 }
      const encoded = param.encode(point)
      const decoded = param.decode(encoded)
      expect(decoded!.x).toBeCloseTo(point.x, 5)
      expect(decoded!.y).toBeCloseTo(point.y, 5)
    })
  })

  describe('default handling', () => {
    const param = pointParam({ default: { x: 0, y: 0 } })

    it('encodes default as undefined', () => {
      expect(param.encode({ x: 0, y: 0 })).toBeUndefined()
    })

    it('decodes undefined as default', () => {
      expect(param.decode(undefined)).toEqual({ x: 0, y: 0 })
    })
  })
})

describe('encodeFloatAllModes', () => {
  it('returns string and base64 encodings', () => {
    const result = encodeFloatAllModes(3.14159, { decimals: 2, precision: 22 })

    expect(result.string).toBe('3.14')
    expect(result.base64).toBeDefined()
    expect(result.bits).toBeGreaterThan(0)
  })
})

describe('encodePointAllModes', () => {
  it('returns string and base64 encodings', () => {
    const result = encodePointAllModes({ x: 37.7749, y: -122.4194 }, { decimals: 2, precision: 22 })

    // Negative y means no delimiter needed (minus sign acts as delimiter)
    expect(result.string).toBe('37.77-122.42')
    expect(result.base64).toBeDefined()
    expect(result.bits).toBeGreaterThan(0)
  })

  it('binary is more compact than string for high precision', () => {
    const result = encodePointAllModes({ x: 37.7749, y: -122.4194 }, { decimals: 6, precision: 28 })

    // Binary should be shorter than string "37.7749,-122.4194"
    expect(result.base64.length).toBeLessThan(result.string.length)
  })
})

describe('precision schemes', () => {
  it('has 7 predefined schemes', () => {
    expect(precisionSchemes.length).toBe(7)
  })

  it('all have 5 exponent bits', () => {
    for (const scheme of precisionSchemes) {
      expect(scheme.expBits).toBe(5)
    }
  })

  it('mantissa bits increase', () => {
    for (let i = 1; i < precisionSchemes.length; i++) {
      expect(precisionSchemes[i].mantBits).toBeGreaterThan(precisionSchemes[i - 1].mantBits)
    }
  })
})
