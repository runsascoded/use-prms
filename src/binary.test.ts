import { describe, it, expect } from 'vitest'
import {
  base64Encode,
  base64Decode,
  binaryParam,
  base64Param,
  floatToBytes,
  bytesToFloat,
  BASE64_CHARS,
} from './binary'
import { floatParam } from './float'

describe('base64', () => {
  describe('encode/decode roundtrip', () => {
    it('handles empty array', () => {
      const bytes = new Uint8Array([])
      const encoded = base64Encode(bytes)
      expect(encoded).toBe('')
      expect(base64Decode(encoded)).toEqual(bytes)
    })

    it('handles single byte', () => {
      const bytes = new Uint8Array([0x41])
      const encoded = base64Encode(bytes)
      expect(base64Decode(encoded)).toEqual(bytes)
    })

    it('handles two bytes', () => {
      const bytes = new Uint8Array([0x41, 0x42])
      const encoded = base64Encode(bytes)
      expect(base64Decode(encoded)).toEqual(bytes)
    })

    it('handles three bytes (no padding needed)', () => {
      const bytes = new Uint8Array([0x41, 0x42, 0x43])
      const encoded = base64Encode(bytes)
      expect(encoded).toBe('QUJD') // Standard base64 for "ABC"
      expect(base64Decode(encoded)).toEqual(bytes)
    })

    it('handles various byte patterns', () => {
      const testCases = [
        [0x00],
        [0xff],
        [0x00, 0xff],
        [0xff, 0x00],
        [0x00, 0x00, 0x00],
        [0xff, 0xff, 0xff],
        [0x12, 0x34, 0x56, 0x78],
      ]

      for (const arr of testCases) {
        const bytes = new Uint8Array(arr)
        const encoded = base64Encode(bytes)
        expect(base64Decode(encoded)).toEqual(bytes)
      }
    })

    it('handles random bytes', () => {
      const bytes = new Uint8Array(100)
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256)
      }
      const encoded = base64Encode(bytes)
      expect(base64Decode(encoded)).toEqual(bytes)
    })
  })

  describe('URL safety', () => {
    it('uses URL-safe alphabet (no + or /)', () => {
      // Test bytes that would produce + and / in standard base64
      const bytes = new Uint8Array([0xfb, 0xef, 0xbe]) // Would be ++++ in std base64
      const encoded = base64Encode(bytes)
      expect(encoded).not.toContain('+')
      expect(encoded).not.toContain('/')
    })

    it('alphabet has 64 chars', () => {
      expect(BASE64_CHARS.length).toBe(64)
      expect(new Set(BASE64_CHARS).size).toBe(64)
    })
  })
})

describe('binaryParam', () => {
  // Simple test: encode/decode array of numbers as raw bytes
  const numbersParam = binaryParam<number[]>({
    toBytes: (nums) => new Uint8Array(nums),
    fromBytes: (bytes) => Array.from(bytes),
  })

  it('encodes value to base64', () => {
    const encoded = numbersParam.encode([65, 66, 67])
    expect(encoded).toBe('QUJD') // "ABC" in base64
  })

  it('decodes base64 to value', () => {
    const decoded = numbersParam.decode('QUJD')
    expect(decoded).toEqual([65, 66, 67])
  })

  it('returns undefined for null', () => {
    expect(numbersParam.encode(null)).toBeUndefined()
  })

  it('returns null for undefined/empty', () => {
    expect(numbersParam.decode(undefined)).toBeNull()
    expect(numbersParam.decode('')).toBeNull()
  })

  it('handles empty bytes gracefully', () => {
    // Empty bytes result in undefined encode
    expect(numbersParam.encode([])).toBeUndefined()
  })
})

describe('base64Param', () => {
  it('creates param with base64 encoding', () => {
    const param = base64Param<number[]>(
      (nums) => new Uint8Array(nums),
      (bytes) => Array.from(bytes)
    )
    const encoded = param.encode([1, 2, 3])
    const decoded = param.decode(encoded!)
    expect(decoded).toEqual([1, 2, 3])
  })
})

describe('floatToBytes/bytesToFloat', () => {
  it('roundtrips various floats', () => {
    const values = [0, 1, -1, Math.PI, Math.E, 0.001, -123.456, Infinity, -Infinity]
    for (const v of values) {
      const bytes = floatToBytes(v)
      expect(bytes.length).toBe(8) // 64 bits
      expect(bytesToFloat(bytes)).toBe(v)
    }
  })

  it('preserves NaN (though not bit-for-bit)', () => {
    const bytes = floatToBytes(NaN)
    expect(bytes.length).toBe(8)
    expect(Number.isNaN(bytesToFloat(bytes))).toBe(true)
  })

  it('produces 8 bytes', () => {
    expect(floatToBytes(Math.PI).length).toBe(8)
  })
})

describe('floatParam (lossless base64 default)', () => {
  const param = floatParam(0)

  it('encodes to 11 base64 chars', () => {
    const encoded = param.encode(Math.PI)
    expect(encoded).toBeDefined()
    expect(encoded!.length).toBe(11) // ceil(64/6) = 11
  })

  it('roundtrips exactly', () => {
    const values = [Math.PI, Math.E, 0.1 + 0.2, 123.456789012345]
    for (const v of values) {
      const encoded = param.encode(v)
      const decoded = param.decode(encoded)
      expect(decoded).toBe(v) // Exact equality, not toBeCloseTo
    }
  })

  it('encodes default as undefined', () => {
    expect(param.encode(0)).toBeUndefined()
  })

  it('decodes undefined as default', () => {
    expect(param.decode(undefined)).toBe(0)
    expect(param.decode('')).toBe(0)
  })

  it('produces URL-safe output', () => {
    const encoded = param.encode(Math.PI)!
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).not.toContain('=')
  })
})
