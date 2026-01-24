/**
 * Binary encoding utilities for compact URL parameters
 *
 * Provides base64url encoding for arbitrary binary data.
 * Use these to create compact URL representations of complex data structures.
 */

/**
 * URL-safe base64 alphabet (RFC 4648 base64url)
 * Uses - and _ instead of + and / for URL safety
 */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Lookup table for fast decoding
const BASE64_LOOKUP = new Map(BASE64_CHARS.split('').map((c, i) => [c, i]))

/**
 * Encode a Uint8Array to base64url string
 */
export function base64Encode(bytes: Uint8Array): string {
  let result = ''
  let i = 0

  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0
    const b1 = bytes[i++] ?? 0
    const b2 = bytes[i++] ?? 0

    // Combine 3 bytes into 24 bits, then split into 4 6-bit values
    const n = (b0 << 16) | (b1 << 8) | b2

    result += BASE64_CHARS[(n >> 18) & 0x3f]
    result += BASE64_CHARS[(n >> 12) & 0x3f]

    // Only add padding chars if we have the bytes
    if (i - 2 < bytes.length) {
      result += BASE64_CHARS[(n >> 6) & 0x3f]
    }
    if (i - 1 < bytes.length) {
      result += BASE64_CHARS[n & 0x3f]
    }
  }

  return result
}

/**
 * Decode a base64url string to Uint8Array
 */
export function base64Decode(str: string): Uint8Array {
  // Remove any padding (we don't require it)
  str = str.replace(/=+$/, '')

  const bytes: number[] = []

  for (let i = 0; i < str.length; i += 4) {
    const c0 = BASE64_LOOKUP.get(str[i]) ?? 0
    const c1 = BASE64_LOOKUP.get(str[i + 1]) ?? 0
    const c2 = i + 2 < str.length ? BASE64_LOOKUP.get(str[i + 2]) ?? 0 : 0
    const c3 = i + 3 < str.length ? BASE64_LOOKUP.get(str[i + 3]) ?? 0 : 0

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
}

import type { Param } from './index.js'

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
 * // Use with useUrlParam
 * const [shapes, setShapes] = useUrlParam('s', shapesParam)
 * ```
 */
export function binaryParam<T>(options: BinaryParamOptions<T>): Param<T | null> {
  const { toBytes, fromBytes } = options

  return {
    encode: (value) => {
      if (value === null) return undefined
      const bytes = toBytes(value)
      if (bytes.length === 0) return undefined
      return base64Encode(bytes)
    },
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return null
      try {
        const bytes = base64Decode(encoded)
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
  fromBytes: (bytes: Uint8Array) => T
): Param<T | null> {
  return binaryParam({ toBytes, fromBytes })
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

// Re-export the alphabet for custom implementations
export { BASE64_CHARS }
