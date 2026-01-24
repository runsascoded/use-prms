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
    decode: (encoded) => {
      if (encoded === undefined || encoded === '') return init
      const parsed = parseInt(encoded, 10)
      return isNaN(parsed) ? init : parsed
    },
  }
}

/**
 * Optional integer parameter.
 * - null → not present
 * - number → ?key=123
 */
export const optIntParam: Param<number | null> = {
  encode: (value) => value === null ? undefined : value.toString(),
  decode: (encoded) => {
    if (encoded === undefined || encoded === '') return null
    const parsed = parseInt(encoded, 10)
    return isNaN(parsed) ? null : parsed
  },
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

/**
 * Pagination parameter combining offset and page size.
 * Uses space (which encodes as + in URLs) as delimiter.
 *
 * Encoding rules:
 * - offset=0, pageSize=default → not present (undefined)
 * - offset=0, pageSize=custom → " pageSize" (e.g., " 20" → +20 in URL)
 * - offset>0, pageSize=default → "offset" (e.g., "100")
 * - offset>0, pageSize=custom → "offset pageSize" (e.g., "100 20" → 100+20 in URL)
 *
 * @param defaultPageSize - The default page size (omitted from URL when used)
 * @param validPageSizes - Optional array of valid page sizes for validation
 */
export type Pagination = { offset: number; pageSize: number }

export function paginationParam(
  defaultPageSize: number,
  validPageSizes?: readonly number[],
): Param<Pagination> {
  return {
    encode: ({ offset, pageSize }) => {
      if (offset === 0 && pageSize === defaultPageSize) return undefined
      if (offset === 0) return ` ${pageSize}` // Space prefix → +pageSize in URL
      if (pageSize === defaultPageSize) return String(offset)
      return `${offset} ${pageSize}` // Space encodes as + in URL
    },
    decode: (encoded) => {
      if (!encoded) return { offset: 0, pageSize: defaultPageSize }
      const parts = encoded.split(' ') // URL + decodes to space
      // Handle " pageSize" case (offset 0 with custom page size)
      const offset = parts[0] === '' ? 0 : parseInt(parts[0], 10) || 0
      let pageSize = parts[1] ? parseInt(parts[1], 10) : defaultPageSize
      // Validate page size if validation array provided
      if (validPageSizes && !validPageSizes.includes(pageSize)) {
        pageSize = defaultPageSize
      }
      return { offset, pageSize }
    },
  }
}

/**
 * Code mapping for enum values - maps full values to short codes for compact URLs.
 * Can be specified as:
 * - Array of [value, code] tuples: [['Rides', 'r'], ['Minutes', 'm']]
 * - Object mapping values to codes: { Rides: 'r', Minutes: 'm' }
 */
export type CodeMap<T extends string> = [T, string][] | Record<T, string>

function normalizeCodeMap<T extends string>(codeMap: CodeMap<T>): [T, string][] {
  if (Array.isArray(codeMap)) return codeMap
  return Object.entries(codeMap) as [T, string][]
}

/**
 * Single-value enum parameter with short code mapping.
 * Maps full enum values to abbreviated codes for compact URLs.
 * Omitted from URL when equal to default.
 *
 * @example
 * // ?y=r for "Rides", ?y=m for "Minutes", omitted for default "Rides"
 * codeParam('Rides', [['Rides', 'r'], ['Minutes', 'm']])
 * // or with object syntax:
 * codeParam('Rides', { Rides: 'r', Minutes: 'm' })
 */
export function codeParam<T extends string>(
  init: T,
  codeMap: CodeMap<T>,
): Param<T> {
  const entries = normalizeCodeMap(codeMap)
  const valueToCode = new Map(entries)
  const codeToValue = new Map(entries.map(([v, c]) => [c, v]))

  return {
    encode: (value) => {
      if (value === init) return undefined
      return valueToCode.get(value) ?? value
    },
    decode: (encoded) => {
      if (encoded === undefined) return init
      return codeToValue.get(encoded) ?? init
    },
  }
}

/**
 * Multi-value parameter with short code mapping.
 * Maps full values to abbreviated codes for compact URLs.
 * Omitted from URL when all values are selected.
 *
 * @param allValues - Array of all possible values (used to detect "all selected")
 * @param codeMap - Mapping from values to short codes
 * @param separator - Delimiter between codes (default: '' for most compact URLs)
 *
 * @example
 * // Regions: ?r=nj for NYC+JC, ?r=njh or omitted for all three
 * codesParam(['NYC', 'JC', 'HOB'], [['NYC', 'n'], ['JC', 'j'], ['HOB', 'h']])
 * // or with object syntax and custom separator:
 * codesParam(['NYC', 'JC', 'HOB'], { NYC: 'n', JC: 'j', HOB: 'h' }, ',')
 */
export function codesParam<T extends string>(
  allValues: readonly T[],
  codeMap: CodeMap<T>,
  separator: string = '',
): Param<T[]> {
  const entries = normalizeCodeMap(codeMap)
  const valueToCode = new Map(entries)
  const codeToValue = new Map(entries.map(([v, c]) => [c, v]))

  return {
    encode: (values) => {
      // Omit when all values selected
      if (values.length === allValues.length && allValues.every(v => values.includes(v))) {
        return undefined
      }
      return values.map(v => valueToCode.get(v) ?? v).join(separator)
    },
    decode: (encoded) => {
      if (encoded === undefined) return [...allValues]
      if (encoded === '') return []
      const codes = separator ? encoded.split(separator) : encoded.split('')
      return codes.map(c => codeToValue.get(c)).filter((v): v is T => v !== undefined)
    },
  }
}
