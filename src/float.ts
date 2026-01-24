/**
 * Float encoding utilities for compact URL parameters
 *
 * Provides IEEE 754 decomposition, fixed-point conversion, and bit-level packing
 * for encoding floats with configurable precision.
 */

import { base64Encode, base64Decode, floatToBytes, bytesToFloat } from './binary.js'

/**
 * Decomposed IEEE 754 double-precision float
 */
export interface Float {
  neg: boolean
  exp: number
  mant: bigint
}

/**
 * Fixed-point representation with shared exponent
 */
export interface FixedPoint {
  neg: boolean
  exp: number
  mant: bigint
}

/**
 * Precision scheme for fixed-point encoding
 */
export interface PrecisionScheme {
  expBits: number
  mantBits: number
}

/**
 * Predefined precision schemes for reference
 * Higher mantBits = more precision, larger URL
 */
export const precisionSchemes: PrecisionScheme[] = [
  { expBits: 5, mantBits: 16 },  // ~5 decimal digits
  { expBits: 5, mantBits: 22 },  // ~7 decimal digits
  { expBits: 5, mantBits: 28 },  // ~8 decimal digits
  { expBits: 5, mantBits: 34 },  // ~10 decimal digits
  { expBits: 5, mantBits: 40 },  // ~12 decimal digits
  { expBits: 5, mantBits: 46 },  // ~14 decimal digits
  { expBits: 5, mantBits: 52 },  // ~16 decimal digits (near IEEE 754)
]

/** Default exponent bits (5 bits covers exponents -16 to +15) */
const DEFAULT_EXP_BITS = 5

/** Min/max mantissa bits for bounds checking */
const MIN_MANT_BITS = 8
const MAX_MANT_BITS = 52

/**
 * Resolve precision option to a PrecisionScheme
 * Accepts mantissa bits (number) or a full custom scheme
 */
export function resolvePrecision(precision: number | PrecisionScheme | undefined): PrecisionScheme {
  if (precision === undefined) return { expBits: DEFAULT_EXP_BITS, mantBits: 22 } // sensible default
  if (typeof precision === 'object') return precision
  // precision is mantissa bits
  if (precision < MIN_MANT_BITS || precision > MAX_MANT_BITS) {
    throw new Error(`Precision must be ${MIN_MANT_BITS}-${MAX_MANT_BITS} bits, got ${precision}`)
  }
  return { expBits: DEFAULT_EXP_BITS, mantBits: precision }
}

// Shared buffer for float conversion
const floatBuf = new ArrayBuffer(8)
const floatView = new DataView(floatBuf)

/**
 * Decompose an IEEE 754 double into sign, exponent, and mantissa
 */
export function toFloat(x: number): Float {
  floatView.setFloat64(0, x, false) // big-endian
  const byte0 = floatView.getUint8(0)
  const neg = !!(byte0 & 0x80)
  const exp = ((floatView.getUint16(0, false) & 0x7ff0) >> 4) - 1023
  const mant = floatView.getBigUint64(0, false) & 0xfffffffffffffn
  return { neg, exp, mant }
}

/**
 * Reconstruct a number from decomposed IEEE 754 components
 */
export function fromFloat({ neg, exp, mant }: Float): number {
  floatView.setBigUint64(
    0,
    (neg ? 0x8000000000000000n : 0n) | (BigInt(exp + 1023) << 52n) | mant,
    false
  )
  return floatView.getFloat64(0, false)
}

/**
 * Convert a decomposed float to fixed-point with specified mantissa bits
 */
export function toFixedPoint(
  f: Float,
  opts: { mantBits: number; exp?: number }
): FixedPoint {
  let { neg, exp: fExp, mant } = f
  fExp++
  const exp = opts.exp === undefined ? fExp : opts.exp

  if (fExp > exp) {
    throw Error(`maxExp ${exp} < ${fExp}`)
  }

  const downshiftBy = exp - fExp + 53 - opts.mantBits
  const roundUp = mant & (1n << BigInt(downshiftBy - 1))
  mant >>= BigInt(downshiftBy)
  if (roundUp) {
    mant += 1n
  }
  mant |= 1n << BigInt(opts.mantBits - 1 - (exp - fExp))
  return { neg, exp, mant }
}

/**
 * Convert a fixed-point value back to decomposed float
 */
export function fromFixedPoint(f: FixedPoint, mantBits: number): Float {
  const { neg } = f
  const nonZeroBits = f.mant ? f.mant.toString(2).length : 0
  const exp = f.exp - (mantBits - nonZeroBits) - 1

  if (!f.mant) {
    return { neg, exp: -1023, mant: 0n }
  }

  let mant = BigInt(f.mant)
  mant = mant & ((1n << BigInt(nonZeroBits - 1)) - 1n)
  mant <<= BigInt(f.exp - exp)
  mant <<= BigInt(52 - mantBits)
  return { neg, exp, mant }
}

/**
 * Bit-level buffer for packing/unpacking arbitrary bit widths
 *
 * Use this for custom binary encodings. Pack data with encodeInt/encodeBigInt,
 * then convert to base64 for URL-safe strings.
 *
 * @example
 * ```ts
 * // Encoding
 * const buf = new BitBuffer()
 * buf.encodeInt(myEnum, 3)      // 3 bits for enum
 * buf.encodeInt(myCount, 8)     // 8 bits for count
 * buf.encodeBigInt(myId, 48)    // 48 bits for ID
 * const urlParam = buf.toBase64()
 *
 * // Decoding
 * const buf = BitBuffer.fromBase64(urlParam)
 * const myEnum = buf.decodeInt(3)
 * const myCount = buf.decodeInt(8)
 * const myId = buf.decodeBigInt(48)
 * ```
 */
export class BitBuffer {
  buf: number[]
  byteOffset: number
  bitOffset: number
  end: number

  constructor(numBytes?: number) {
    this.buf = Array(numBytes || 0).fill(0)
    this.byteOffset = 0
    this.bitOffset = 0
    this.end = 0
  }

  get totalBitOffset(): number {
    return this.byteOffset * 8 + this.bitOffset
  }

  seek(totalBitOffset: number): BitBuffer {
    this.byteOffset = totalBitOffset >> 3
    this.bitOffset = totalBitOffset & 7
    return this
  }

  /**
   * Encode an integer with specified bit width
   */
  encodeInt(n: number, numBits: number): BitBuffer {
    let { buf, byteOffset, bitOffset } = this

    while (numBits > 0) {
      if (byteOffset >= buf.length) {
        buf.push(0)
      }
      const remainingBitsInByte = 8 - bitOffset
      const bitsToWrite = Math.min(numBits, remainingBitsInByte)
      const bitsLeftInByte = remainingBitsInByte - bitsToWrite
      const bitsLeftToWrite = numBits - bitsToWrite
      const mask = ((1 << bitsToWrite) - 1) << bitsLeftToWrite
      const shiftedBitsToWrite = (n & mask) >> bitsLeftToWrite
      buf[byteOffset] |= shiftedBitsToWrite << bitsLeftInByte
      n &= (1 << bitsLeftToWrite) - 1
      numBits -= bitsToWrite
      bitOffset += bitsToWrite
      if (bitOffset === 8) {
        bitOffset = 0
        byteOffset++
      }
    }

    this.byteOffset = byteOffset
    this.bitOffset = bitOffset
    if (this.totalBitOffset > this.end) this.end = this.totalBitOffset
    return this
  }

  /**
   * Decode an integer with specified bit width
   */
  decodeInt(numBits: number): number {
    let { buf, byteOffset, bitOffset } = this
    let n = 0

    while (numBits > 0) {
      const remainingBitsInByte = 8 - bitOffset
      const bitsToRead = Math.min(numBits, remainingBitsInByte)
      const bitsLeftInByte = remainingBitsInByte - bitsToRead
      const mask = ((1 << bitsToRead) - 1) << bitsLeftInByte
      const bits = (buf[byteOffset] & mask) >> bitsLeftInByte
      n = (n << bitsToRead) | bits
      numBits -= bitsToRead
      bitOffset += bitsToRead
      if (bitOffset === 8) {
        bitOffset = 0
        byteOffset++
      }
    }

    this.byteOffset = byteOffset
    this.bitOffset = bitOffset
    return n
  }

  /**
   * Encode a bigint with specified bit width
   */
  encodeBigInt(n: bigint, numBits: number): BitBuffer {
    let { buf, byteOffset, bitOffset } = this

    while (numBits > 0) {
      if (byteOffset >= buf.length) {
        buf.push(0)
      }
      const remainingBitsInByte = 8 - bitOffset
      const bitsToWrite = Math.min(numBits, remainingBitsInByte)
      const bitsLeftInByte = remainingBitsInByte - bitsToWrite
      const bitsLeftToWrite = numBits - bitsToWrite
      const mask = ((1n << BigInt(bitsToWrite)) - 1n) << BigInt(bitsLeftToWrite)
      const shiftedBitsToWrite = Number((n & mask) >> BigInt(bitsLeftToWrite))
      buf[byteOffset] |= shiftedBitsToWrite << bitsLeftInByte
      n &= (1n << BigInt(bitsLeftToWrite)) - 1n
      numBits -= bitsToWrite
      bitOffset += bitsToWrite
      if (bitOffset === 8) {
        bitOffset = 0
        byteOffset++
      }
    }

    this.byteOffset = byteOffset
    this.bitOffset = bitOffset
    if (this.totalBitOffset > this.end) this.end = this.totalBitOffset
    return this
  }

  /**
   * Decode a bigint with specified bit width
   */
  decodeBigInt(numBits: number): bigint {
    let { buf, byteOffset, bitOffset } = this
    let n = 0n

    while (numBits > 0) {
      const remainingBitsInByte = 8 - bitOffset
      const bitsToRead = Math.min(numBits, remainingBitsInByte)
      const bitsLeftInByte = remainingBitsInByte - bitsToRead
      const mask = ((1 << bitsToRead) - 1) << bitsLeftInByte
      const bits = BigInt((buf[byteOffset] & mask) >> bitsLeftInByte)
      n = (n << BigInt(bitsToRead)) | bits
      numBits -= bitsToRead
      bitOffset += bitsToRead
      if (bitOffset === 8) {
        bitOffset = 0
        byteOffset++
      }
    }

    this.byteOffset = byteOffset
    this.bitOffset = bitOffset
    return n
  }

  /**
   * Encode an array of floats with shared exponent
   */
  encodeFixedPoints(
    vals: number[],
    { expBits, mantBits }: PrecisionScheme
  ): BitBuffer {
    const floats = vals.map(toFloat)
    const maxExp = Math.max(...floats.map(({ exp }) => exp + 1))

    if (maxExp >= 1 << (expBits - 1)) {
      throw Error(`maxExp ${maxExp} >= ${1 << expBits}`)
    }

    const expToWrite = (maxExp + (1 << (expBits - 1))) & ((1 << expBits) - 1)
    this.encodeInt(expToWrite, expBits)

    const fixedPoints = floats.map((f) => toFixedPoint(f, { mantBits, exp: maxExp }))
    fixedPoints.forEach(({ neg, mant }) => {
      this.encodeInt(neg ? 1 : 0, 1)
      this.encodeBigInt(mant, mantBits)
    })

    return this
  }

  /**
   * Decode an array of floats with shared exponent
   */
  decodeFixedPoints(
    count: number,
    { expBits, mantBits }: PrecisionScheme
  ): number[] {
    const expRaw = this.decodeInt(expBits)
    const exp = expRaw - (1 << (expBits - 1))

    const result: number[] = []
    for (let i = 0; i < count; i++) {
      const neg = this.decodeInt(1) === 1
      const mant = this.decodeBigInt(mantBits)
      const fp: FixedPoint = { neg, exp, mant }
      const f = fromFixedPoint(fp, mantBits)
      result.push(fromFloat(f))
    }

    return result
  }

  /**
   * Get bytes as Uint8Array
   */
  toBytes(): Uint8Array {
    const numBytes = Math.ceil(this.end / 8)
    return new Uint8Array(this.buf.slice(0, numBytes))
  }

  /**
   * Create from bytes
   */
  static fromBytes(bytes: Uint8Array): BitBuffer {
    const buf = new BitBuffer()
    buf.buf = Array.from(bytes)
    buf.end = bytes.length * 8
    return buf
  }

  /**
   * Convert buffer to URL-safe base64 string
   *
   * This is the primary way to serialize a BitBuffer for use in URL parameters.
   */
  toBase64(): string {
    return base64Encode(this.toBytes())
  }

  /**
   * Create a BitBuffer from a URL-safe base64 string
   *
   * This is the primary way to deserialize a URL parameter back to a BitBuffer.
   */
  static fromBase64(str: string): BitBuffer {
    return BitBuffer.fromBytes(base64Decode(str))
  }
}

import type { Param } from './index.js'

/**
 * Encoding mode for float params
 */
export type FloatEncoding = 'string' | 'base64'

/**
 * Parse precision string like '5+22' into { exp, mant }
 */
function parsePrecisionString(s: string): { exp: number; mant: number } {
  const match = s.match(/^(\d+)\+(\d+)$/)
  if (!match) {
    throw new Error(`Invalid precision format: "${s}". Expected format like "5+22" (exp+mant)`)
  }
  return { exp: parseInt(match[1], 10), mant: parseInt(match[2], 10) }
}

/**
 * Options for floatParam
 */
export interface FloatParamOptions {
  /** Default value when param is missing */
  default?: number
  /** Encoding mode: 'base64' (default) or 'string' */
  encoding?: FloatEncoding
  /** For string encoding: number of decimal places */
  decimals?: number
  /** For lossy base64: exponent bits (requires mant) */
  exp?: number
  /** For lossy base64: mantissa bits (requires exp) */
  mant?: number
  /** For lossy base64: string shorthand like '5+22' (exp+mant) */
  precision?: string
}

/**
 * Create a float param with configurable encoding
 *
 * @example
 * ```ts
 * // Lossless base64 (default) - 11 chars, exact
 * const f = floatParam(0)
 * const f = floatParam({ default: 0 })
 * const f = floatParam({ default: 0, encoding: 'base64' })
 *
 * // Lossy base64 - fewer chars, approximate
 * const f = floatParam({ default: 0, encoding: 'base64', exp: 5, mant: 22 })
 * const f = floatParam({ default: 0, encoding: 'base64', precision: '5+22' })
 *
 * // String encoding - full precision toString()
 * const f = floatParam({ default: 0, encoding: 'string' })
 *
 * // Truncated string - fixed decimal places
 * const f = floatParam({ default: 0, encoding: 'string', decimals: 6 })
 * ```
 */
export function floatParam(optsOrDefault: number | FloatParamOptions = 0): Param<number> {
  // Handle simple number default
  const opts: FloatParamOptions = typeof optsOrDefault === 'number'
    ? { default: optsOrDefault }
    : optsOrDefault

  const {
    default: defaultValue = 0,
    encoding = 'base64',
    decimals,
    exp,
    mant,
    precision,
  } = opts

  // Validate options
  if (encoding === 'string') {
    if (exp !== undefined || mant !== undefined || precision !== undefined) {
      throw new Error('exp/mant/precision options are only valid with encoding: "base64"')
    }
  }

  if (encoding === 'base64') {
    if (decimals !== undefined) {
      throw new Error('decimals option is only valid with encoding: "string"')
    }

    // Check for lossy vs lossless
    const hasExpMant = exp !== undefined || mant !== undefined
    const hasPrecision = precision !== undefined

    if (hasExpMant && hasPrecision) {
      throw new Error('Cannot specify both exp/mant and precision')
    }

    if (hasExpMant) {
      if (exp === undefined || mant === undefined) {
        throw new Error('Both exp and mant must be specified together')
      }
      // Lossy base64 with explicit exp/mant
      return createLossyBase64Param(defaultValue, { expBits: exp, mantBits: mant })
    }

    if (hasPrecision) {
      // Lossy base64 with string precision
      const { exp: e, mant: m } = parsePrecisionString(precision)
      return createLossyBase64Param(defaultValue, { expBits: e, mantBits: m })
    }

    // Lossless base64 (default)
    return createLosslessBase64Param(defaultValue)
  }

  // String encoding
  if (decimals !== undefined) {
    return createTruncatedStringParam(defaultValue, decimals)
  }

  // Full precision string
  return createFullStringParam(defaultValue)
}

/**
 * Lossless base64 encoding (full 64-bit IEEE 754)
 */
function createLosslessBase64Param(defaultValue: number): Param<number> {
  return {
    encode: (value) => {
      if (value === defaultValue) return undefined
      return base64Encode(floatToBytes(value))
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultValue
      try {
        return bytesToFloat(base64Decode(encoded))
      } catch {
        return defaultValue
      }
    },
  }
}

/**
 * Lossy base64 encoding (fixed-point with shared exponent)
 */
function createLossyBase64Param(defaultValue: number, scheme: PrecisionScheme): Param<number> {
  return {
    encode: (value) => {
      if (value === defaultValue) return undefined
      const buf = new BitBuffer()
      buf.encodeFixedPoints([value], scheme)
      return buf.toBase64()
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultValue
      try {
        const buf = BitBuffer.fromBase64(encoded)
        const [value] = buf.decodeFixedPoints(1, scheme)
        return value
      } catch {
        return defaultValue
      }
    },
  }
}

/**
 * Full precision string encoding (naive toString)
 */
function createFullStringParam(defaultValue: number): Param<number> {
  return {
    encode: (value) => {
      if (value === defaultValue) return undefined
      return value.toString()
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultValue
      const parsed = parseFloat(encoded)
      return isNaN(parsed) ? defaultValue : parsed
    },
  }
}

/**
 * Truncated string encoding (fixed decimal places)
 */
function createTruncatedStringParam(defaultValue: number, decimals: number): Param<number> {
  const multiplier = Math.pow(10, decimals)

  return {
    encode: (value) => {
      if (value === defaultValue) return undefined
      const truncated = Math.round(value * multiplier) / multiplier
      return truncated.toFixed(decimals)
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultValue
      const parsed = parseFloat(encoded)
      return isNaN(parsed) ? defaultValue : parsed
    },
  }
}

/**
 * Convenience wrapper for base64 float encoding
 *
 * @example
 * ```ts
 * base64FloatParam(0)                    // lossless
 * base64FloatParam({ exp: 5, mant: 22 }) // lossy
 * ```
 */
export function base64FloatParam(optsOrDefault: number | Omit<FloatParamOptions, 'encoding' | 'decimals'> = 0): Param<number> {
  const opts = typeof optsOrDefault === 'number'
    ? { default: optsOrDefault }
    : optsOrDefault
  return floatParam({ ...opts, encoding: 'base64' })
}

/**
 * 2D point type
 */
export interface Point {
  x: number
  y: number
}

/**
 * Options for point param
 */
export interface PointParamOptions {
  /** Encoding mode */
  encoding?: FloatEncoding
  /** For string encoding: decimal places */
  decimals?: number
  /** For binary encoding: mantissa bits (8-52) or custom scheme. Default: 22 bits */
  precision?: number | PrecisionScheme
  /** Default point when param is missing */
  default?: Point
}

/**
 * Create a param for encoding a 2D point
 *
 * String mode: "x,y" with truncated decimals
 * Binary mode: packed fixed-point with shared exponent
 *
 * @example
 * ```ts
 * // String encoding
 * const posParam = pointParam({ encoding: 'string', decimals: 2 })
 * posParam.encode({ x: 1.234, y: 5.678 }) // "1.23 5.68"
 *
 * // Binary encoding (more compact)
 * const posParam = pointParam({ encoding: 'base64', precision: 22 })
 * posParam.encode({ x: 1.234, y: 5.678 }) // compact base64
 * ```
 */
export function pointParam(opts: PointParamOptions = {}): Param<Point | null> {
  const {
    encoding = 'base64',
    decimals = 2,
    precision,
    default: defaultPoint = null,
  } = opts

  const scheme = resolvePrecision(precision)
  const multiplier = Math.pow(10, decimals)

  return {
    encode: (point) => {
      if (point === null) return undefined
      if (defaultPoint && point.x === defaultPoint.x && point.y === defaultPoint.y) {
        return undefined
      }

      if (encoding === 'string') {
        // String encoding: "x y" or "x-y" (space encodes as + in URLs)
        // When y is negative, omit space - the minus sign acts as delimiter
        const xTrunc = Math.round(point.x * multiplier) / multiplier
        const yTrunc = Math.round(point.y * multiplier) / multiplier
        // Always show full precision for consistent output length
        const xStr = xTrunc.toFixed(decimals)
        const yStr = yTrunc.toFixed(decimals)
        // Only need space delimiter if y is non-negative
        const delimiter = yTrunc >= 0 ? ' ' : ''
        return `${xStr}${delimiter}${yStr}`
      } else {
        // Binary encoding with shared exponent
        const buf = new BitBuffer()
        buf.encodeFixedPoints([point.x, point.y], scheme)
        return buf.toBase64()
      }
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return defaultPoint

      try {
        if (encoding === 'string') {
          // Split on space (URL decoding converts + back to space)
          // If no space, look for minus sign (not at start) as delimiter
          let x: number, y: number
          if (encoded.includes(' ')) {
            const parts = encoded.split(' ')
            if (parts.length !== 2) return defaultPoint
            x = parseFloat(parts[0])
            y = parseFloat(parts[1])
          } else {
            // Find the minus sign that delimits y (skip any leading minus for x)
            const minusIdx = encoded.indexOf('-', encoded[0] === '-' ? 1 : 0)
            if (minusIdx === -1) return defaultPoint
            x = parseFloat(encoded.slice(0, minusIdx))
            y = parseFloat(encoded.slice(minusIdx))
          }
          if (isNaN(x) || isNaN(y)) return defaultPoint
          return { x, y }
        } else {
          const buf = BitBuffer.fromBase64(encoded)
          const [x, y] = buf.decodeFixedPoints(2, scheme)
          return { x, y }
        }
      } catch {
        return defaultPoint
      }
    },
  }
}

/**
 * Encode a float to string and base64 representations for comparison
 *
 * Utility for demo/debugging to show encoding modes
 */
export function encodeFloatAllModes(
  value: number,
  opts: { decimals?: number; precision?: number | PrecisionScheme } = {}
): { string: string; base64: string; bits: number } {
  const { decimals = 2, precision } = opts
  const scheme = resolvePrecision(precision)

  // String encoding - always show full precision for consistent output length
  const multiplier = Math.pow(10, decimals)
  const truncated = Math.round(value * multiplier) / multiplier
  const stringEncoded = truncated.toFixed(decimals)

  // Binary encoding
  const buf = new BitBuffer()
  buf.encodeFixedPoints([value], scheme)

  return {
    string: stringEncoded,
    base64: buf.toBase64(),
    bits: buf.end,
  }
}

/**
 * Encode a point to string and base64 representations for comparison
 */
export function encodePointAllModes(
  point: Point,
  opts: { decimals?: number; precision?: number | PrecisionScheme } = {}
): { string: string; base64: string; bits: number } {
  const { decimals = 2, precision } = opts
  const scheme = resolvePrecision(precision)

  // String encoding (space becomes + in URL, omit delimiter when y is negative)
  const multiplier = Math.pow(10, decimals)
  const xTrunc = Math.round(point.x * multiplier) / multiplier
  const yTrunc = Math.round(point.y * multiplier) / multiplier
  // Always show full precision for consistent output length
  const xStr = xTrunc.toFixed(decimals)
  const yStr = yTrunc.toFixed(decimals)
  // Use + to show what actually appears in URL (space encodes as +)
  const delimiter = yTrunc >= 0 ? '+' : ''
  const stringEncoded = `${xStr}${delimiter}${yStr}`

  // Binary encoding with shared exponent
  const buf = new BitBuffer()
  buf.encodeFixedPoints([point.x, point.y], scheme)

  return {
    string: stringEncoded,
    base64: buf.toBase64(),
    bits: buf.end,
  }
}

// Re-export precision schemes
export { precisionSchemes as PRECISION_SCHEMES }
