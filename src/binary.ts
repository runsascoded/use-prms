/**
 * Binary encoding utilities for compact URL parameters
 *
 * Provides base64url encoding for arbitrary binary data.
 * Use these to create compact URL representations of complex data structures.
 */

import { ALPHABETS, resolveAlphabet, validateAlphabet, createLookupMap, type Alphabet, type AlphabetName } from './alphabet.js'

/**
 * URL-safe base64 alphabet (RFC 4648 base64url)
 * Uses - and _ instead of + and / for URL safety
 * @deprecated Use ALPHABETS.rfc4648 instead
 */
const BASE64_CHARS = ALPHABETS.rfc4648

// Default lookup table for fast decoding (rfc4648)
const DEFAULT_LOOKUP = createLookupMap(ALPHABETS.rfc4648)

// Cache for custom alphabet lookup maps
const lookupCache = new Map<string, Map<string, number>>()

function getLookupMap(alphabet: string): Map<string, number> {
  if (alphabet === ALPHABETS.rfc4648) return DEFAULT_LOOKUP
  let lookup = lookupCache.get(alphabet)
  if (!lookup) {
    lookup = createLookupMap(alphabet)
    lookupCache.set(alphabet, lookup)
  }
  return lookup
}

/**
 * Options for base64 encoding/decoding
 */
export interface Base64Options {
  /**
   * Alphabet to use: preset name or 64-character string
   * @default 'rfc4648'
   */
  alphabet?: Alphabet
}

/**
 * Encode a Uint8Array to base64 string
 * @param bytes - The bytes to encode
 * @param options - Encoding options (alphabet)
 */
export function base64Encode(bytes: Uint8Array, options?: Base64Options): string {
  const chars = options?.alphabet ? resolveAlphabet(options.alphabet) : ALPHABETS.rfc4648
  let result = ''
  let i = 0

  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0
    const b1 = bytes[i++] ?? 0
    const b2 = bytes[i++] ?? 0

    // Combine 3 bytes into 24 bits, then split into 4 6-bit values
    const n = (b0 << 16) | (b1 << 8) | b2

    result += chars[(n >> 18) & 0x3f]
    result += chars[(n >> 12) & 0x3f]

    // Only add padding chars if we have the bytes
    if (i - 2 < bytes.length) {
      result += chars[(n >> 6) & 0x3f]
    }
    if (i - 1 < bytes.length) {
      result += chars[n & 0x3f]
    }
  }

  return result
}

/**
 * Decode a base64 string to Uint8Array
 * @param str - The base64 string to decode
 * @param options - Decoding options (alphabet)
 */
export function base64Decode(str: string, options?: Base64Options): Uint8Array {
  const alphabet = options?.alphabet ? resolveAlphabet(options.alphabet) : ALPHABETS.rfc4648
  const lookup = getLookupMap(alphabet)

  // Remove any padding (we don't require it)
  str = str.replace(/=+$/, '')

  const bytes: number[] = []

  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup.get(str[i]) ?? 0
    const c1 = lookup.get(str[i + 1]) ?? 0
    const c2 = i + 2 < str.length ? lookup.get(str[i + 2]) ?? 0 : 0
    const c3 = i + 3 < str.length ? lookup.get(str[i + 3]) ?? 0 : 0

    // Combine 4 6-bit values into 24 bits, then split into 3 bytes
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3

    bytes.push((n >> 16) & 0xff)
    if (i + 2 < str.length) bytes.push((n >> 8) & 0xff)
    if (i + 3 < str.length) bytes.push(n & 0xff)
  }

  return new Uint8Array(bytes)
}

/**
 * Options for binary param creation
 */
export interface BinaryParamOptions<T> {
  /**
   * Convert value to bytes
   */
  toBytes: (value: T) => Uint8Array

  /**
   * Convert bytes to value
   */
  fromBytes: (bytes: Uint8Array) => T

  /**
   * Alphabet to use: preset name or 64-character string
   * @default 'rfc4648'
   */
  alphabet?: Alphabet
}

import type { Param } from './types.js'

/**
 * Create a param that encodes/decodes via binary representation
 *
 * This is a mid-level helper for creating custom binary-encoded params.
 * You provide toBytes/fromBytes converters, and it handles the base64url encoding.
 *
 * @example
 * ```ts
 * // Custom binary encoding for a shape array
 * const shapesParam = binaryParam<Shape[]>({
 *   toBytes: (shapes) => encodeShapesToBytes(shapes),
 *   fromBytes: (bytes) => decodeBytesToShapes(bytes),
 * })
 *
 * // Use with useUrlState
 * const [shapes, setShapes] = useUrlState('s', shapesParam)
 * ```
 */
export function binaryParam<T>(options: BinaryParamOptions<T>): Param<T | null> {
  const { toBytes, fromBytes, alphabet } = options
  const encodeOpts = alphabet ? { alphabet } : undefined

  return {
    encode: (value) => {
      if (value === null) return undefined
      const bytes = toBytes(value)
      if (bytes.length === 0) return undefined
      return base64Encode(bytes, encodeOpts)
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return null
      try {
        const bytes = base64Decode(encoded, encodeOpts)
        return fromBytes(bytes)
      } catch {
        return null
      }
    },
  }
}

/**
 * Create a base64-encoded binary param
 * Shorthand for binaryParam
 */
export function base64Param<T>(
  toBytes: (value: T) => Uint8Array,
  fromBytes: (bytes: Uint8Array) => T,
  alphabet?: Alphabet
): Param<T | null> {
  return binaryParam({ toBytes, fromBytes, alphabet })
}

/**
 * Convert a 64-bit float to 8 bytes (IEEE 754 big-endian)
 */
export function floatToBytes(value: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setFloat64(0, value, false) // big-endian for consistent encoding
  return new Uint8Array(buf)
}

/**
 * Convert 8 bytes to a 64-bit float (IEEE 754 big-endian)
 */
export function bytesToFloat(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getFloat64(0, false)
}

// Re-export alphabet utilities
export { ALPHABETS, resolveAlphabet, validateAlphabet, createLookupMap, type Alphabet, type AlphabetName } from './alphabet.js'

/**
 * @deprecated Use ALPHABETS.rfc4648 instead
 */
export { BASE64_CHARS }
