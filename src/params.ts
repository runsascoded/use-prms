/**
 * Built-in parameter types with smart defaults and minimal encoding
 */

import type { Encoded, Param } from './index.js'

/**
 * Optional string parameter.
 * - undefined → not present
 * - empty string → ?key=
 * - non-empty → ?key=value
 */
export function stringParam(init?: string): Param<string | undefined> {
  return {
    encode: (value) => value === init ? undefined : value,
    decode: (encoded) => encoded === undefined ? init : encoded,
  }
}

/**
 * Required string parameter with default.
 * Omitted from URL when equal to default.
 */
export function defStringParam(init: string): Param<string> {
  return {
    encode: (value) => value === init ? undefined : value,
    decode: (encoded) => encoded ?? init,
  }
}

/**
 * Boolean parameter.
 * - true → ?key (valueless)
 * - false → not present
 */
export const boolParam: Param<boolean> = {
  encode: (value) => value ? '' : undefined,
  decode: (encoded) => encoded !== undefined,
}

/**
 * Integer parameter with default.
 * Omitted from URL when equal to default.
 */
export function intParam(init: number): Param<number> {
  return {
    encode: (value) => value === init ? undefined : value.toString(),
    decode: (encoded) => encoded !== undefined ? parseInt(encoded, 10) : init,
  }
}

/**
 * Optional integer parameter.
 * - null → not present
 * - number → ?key=123
 */
export const optIntParam: Param<number | null> = {
  encode: (value) => value === null ? undefined : value.toString(),
  decode: (encoded) => encoded !== undefined ? parseInt(encoded, 10) : null,
}

/**
 * Float parameter with default.
 * Omitted from URL when equal to default.
 */
export function floatParam(init: number): Param<number> {
  return {
    encode: (value) => value === init ? undefined : value.toString(),
    decode: (encoded) => encoded !== undefined ? parseFloat(encoded) : init,
  }
}

/**
 * Enum parameter with validation.
 * Omitted from URL when equal to default.
 * Invalid values fall back to default with console warning.
 */
export function enumParam<T extends string>(
  init: T,
  values: readonly T[]
): Param<T> {
  const validSet = new Set(values)

  return {
    encode: (value) => {
      if (!validSet.has(value)) {
        console.warn(`Invalid enum value: ${value}, expected one of ${values.join(', ')}`)
        return undefined
      }
      return value === init ? undefined : value
    },
    decode: (encoded) => {
      if (encoded === undefined) return init
      if (!validSet.has(encoded as T)) {
        console.warn(`Invalid enum value: ${encoded}, expected one of ${values.join(', ')}. Using default: ${init}`)
        return init
      }
      return encoded as T
    },
  }
}

/**
 * String array parameter with delimiter.
 * Omitted from URL when equal to default.
 * Empty array encodes as empty string (?key=)
 */
export function stringsParam(
  init: string[] = [],
  delimiter = ' '
): Param<string[]> {
  const initEncoded = init.join(delimiter)

  return {
    encode: (values) => {
      const encoded = values.join(delimiter)
      if (encoded === initEncoded) return undefined
      return encoded
    },
    decode: (encoded) => {
      if (encoded === undefined) return init
      if (encoded === '') return []
      return encoded.split(delimiter)
    },
  }
}

/**
 * Number array parameter.
 * Omitted from URL when equal to default.
 * Uses comma delimiter.
 */
export function numberArrayParam(init: number[] = []): Param<number[]> {
  const isEqual = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => v === b[i])

  return {
    encode: (values) => {
      if (isEqual(values, init)) return undefined
      return values.map(v => v.toString()).join(',')
    },
    decode: (encoded) => {
      if (encoded === undefined) return init
      if (encoded === '') return []
      return encoded.split(',').map(v => parseFloat(v))
    },
  }
}
