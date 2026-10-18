/**
 * Fundamental, framework-free value ↔ URL types.
 *
 * Kept in a dependency leaf (no imports) so every codec and the `core`
 * barrel can import them without forming a cycle.
 */

/**
 * Encodes a value to a URL query parameter string.
 * - undefined: parameter not present in URL
 * - "": valueless parameter (e.g., ?z)
 * - string: parameter with value (e.g., ?z=foo)
 */
export type Encoded = string | undefined

/**
 * A bidirectional converter between a typed value and its URL representation.
 */
export type Param<T> = {
  encode: (value: T) => Encoded
  decode: (encoded: Encoded) => T
}
