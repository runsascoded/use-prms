/**
 * Multi-value parameter types for handling repeated URL params
 * e.g., ?tag=a&tag=b&tag=c
 */

import type { MultiEncoded } from './core.js'

/**
 * A bidirectional converter between a typed value and its multi-value URL representation.
 * Similar to Param<T> but works with string[] instead of string | undefined.
 */
export type MultiParam<T> = {
  encode: (value: T) => MultiEncoded
  decode: (encoded: MultiEncoded) => T
}

/**
 * Multi-value string array parameter.
 * Each string becomes a separate URL param with the same key.
 *
 * @example
 * // ?tag=a&tag=b&tag=c → ['a', 'b', 'c']
 * const [tags, setTags] = useMultiUrlState('tag', multiStringParam())
 */
export function multiStringParam(init: string[] = []): MultiParam<string[]> {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return []
      if (arraysEqual(values, init)) return []
      return values
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init
      return encoded
    },
  }
}

/**
 * Multi-value integer array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?id=1&id=2&id=3 → [1, 2, 3]
 * const [ids, setIds] = useMultiUrlState('id', multiIntParam())
 */
export function multiIntParam(init: number[] = []): MultiParam<number[]> {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return []
      if (arraysEqual(values, init)) return []
      return values.map(v => v.toString())
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init
      return encoded.map(v => parseInt(v, 10))
    },
  }
}

/**
 * Multi-value float array parameter.
 * Each number becomes a separate URL param with the same key.
 *
 * @example
 * // ?val=1.5&val=2.7 → [1.5, 2.7]
 * const [vals, setVals] = useMultiUrlState('val', multiFloatParam())
 */
export function multiFloatParam(init: number[] = []): MultiParam<number[]> {
  return {
    encode: (values) => {
      if (values.length === 0 && init.length === 0) return []
      if (arraysEqual(values, init)) return []
      return values.map(v => v.toString())
    },
    decode: (encoded) => {
      if (encoded.length === 0) return init
      return encoded.map(v => parseFloat(v))
    },
  }
}

/** Helper to compare arrays for equality */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
