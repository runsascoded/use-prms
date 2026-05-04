/**
 * Generic primitive for URL params that pack a heterogeneous tuple of
 * numbers (each with its own encoding — fixed decimals, significant figures,
 * or integer truncation) into a single delimited string. Subsumes the
 * pattern used by `llzParam`, `bboxParam`, `viewStateParam`, and similar
 * factories.
 */

import type { Param } from './index.js'

/**
 * Encoding for a single number field within a tuple. Exactly one of
 * `decimals`, `sigfigs`, or `int` should be set.
 */
export type NumberFieldEncoding =
  | { decimals: number; sigfigs?: undefined; int?: undefined }
  | { sigfigs: number; decimals?: undefined; int?: undefined }
  | { int: true; decimals?: undefined; sigfigs?: undefined }

/**
 * Recursive type extracting dotted paths to `number`-valued leaves of `T`.
 *
 * @example
 * type P = NumberPath<{ x: number; nested: { lat: number; name: string } }>
 * // P = 'x' | 'nested.lat'  (note: 'nested.name' excluded since string)
 */
export type NumberPath<T> = NumberPathRec<T, ''>
type NumberPathRec<T, P extends string> =
  NonNullable<T> extends number
    ? P extends '' ? never : P
    : NonNullable<T> extends object
      ? {
          [K in keyof NonNullable<T> & string]:
            NumberPathRec<NonNullable<T>[K], P extends '' ? K : `${P}.${K}`>
        }[keyof NonNullable<T> & string]
      : never

/** A field declaration: where in `T` the number lives, and how to format it. */
export type NumberTupleField<T> = NumberFieldEncoding & { path: NumberPath<T> }

export interface NumberTupleParamOptions<T extends object> {
  /** Default value. Returned (cloned) when decoding missing/empty input.
   *  Also used per-field as fallback for any field whose part is missing or
   *  unparseable. */
  default: T
  /** Field declarations, in tuple order. */
  fields: NumberTupleField<T>[]
  /** Field delimiter for non-signDelim mode. Default: `'_'`. Ignored when
   *  `signDelim` is true. */
  delimiter?: string
  /** "Sign-as-delimiter" mode (default: `true`): a space (URL-encodes to
   *  `+`) between non-negative parts, no delimiter before negative parts
   *  (the `-` itself separates). Reads more naturally for signed
   *  coordinates: `40.74 -74.01 11.8`. On decode, any of `[ +\-_,]` (and
   *  other non-numeric chars) acts as a separator, so URLs in any prior
   *  delimited format still parse correctly — encode then re-emits in the
   *  current format, effectively auto-migrating in-place. */
  signDelim?: boolean
  /** When false, `encode` always emits (never returns undefined even if the
   *  value matches `default`). Default: true. Useful for nullable wrappers
   *  where a synthetic default is used only for per-field fallback. */
  omitDefault?: boolean
}

/**
 * Format a list of numeric parts into a single string, using either a fixed
 * delimiter or the signed-delim convention. Exposed for advanced reuse
 * (e.g. building custom tuple-style encodings on top).
 */
export function formatSignedParts(parts: string[], delimiter: string, signDelim: boolean): string {
  if (!signDelim) return parts.join(delimiter)
  let result = parts[0]
  for (let i = 1; i < parts.length; i++) {
    if (!parts[i].startsWith('-')) result += ' '
    result += parts[i]
  }
  return result
}

/**
 * Split an encoded string into numeric parts. In `signDelim` mode, matches
 * any signed-decimal substrings (so `[ +\-_]` all act as separators, with
 * `-` retained as part of the next number). Otherwise splits on the literal
 * delimiter.
 */
export function parseSignedParts(s: string, delimiter: string, signDelim: boolean): string[] {
  if (signDelim) return s.match(/-?\d+\.?\d*/g) ?? []
  return s.split(delimiter)
}

function formatNumber(n: number, enc: NumberFieldEncoding): string {
  if (enc.int) return Math.trunc(n).toString()
  if (enc.decimals !== undefined) return n.toFixed(enc.decimals)
  if (enc.sigfigs !== undefined) return formatSigfigs(n, enc.sigfigs)
  throw new Error('numberTupleParam: field has no encoding (decimals/sigfigs/int)')
}

/**
 * Format `n` to `sigfigs` significant figures, always as a non-exponential
 * decimal (so URL roundtrip is clean and the signed-delim regex matches).
 */
function formatSigfigs(n: number, sigfigs: number): string {
  if (n === 0) return sigfigs > 1 ? (0).toFixed(sigfigs - 1) : '0'
  const magnitude = Math.floor(Math.log10(Math.abs(n)))
  const decimals = sigfigs - 1 - magnitude
  if (decimals >= 0) return n.toFixed(decimals)
  // magnitude > sigfigs - 1: round to a multiple of 10^(-decimals)
  const factor = Math.pow(10, -decimals)
  return (Math.round(n / factor) * factor).toString()
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) =>
    o == null ? undefined : (o as Record<string, unknown>)[k], obj)
}

/** Shallow-clone along the path so we don't mutate the input. */
function setPath<T extends object>(obj: T, path: string, val: number): T {
  const parts = path.split('.')
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) }
  let cur = out
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    cur[k] = { ...(cur[k] as Record<string, unknown>) }
    cur = cur[k] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = val
  return out as T
}

/**
 * Create a `Param<T>` that encodes a tuple of numbers (each at a typed path
 * within `T`) into a single delimited string.
 *
 * @example Flat shape, mixed encodings
 * ```ts
 * const p = numberTupleParam<{ lat: number; lng: number; count: number }>({
 *   default: { lat: 0, lng: 0, count: 0 },
 *   fields: [
 *     { path: 'lat', decimals: 4 },
 *     { path: 'lng', decimals: 4 },
 *     { path: 'count', int: true },
 *   ],
 * })
 * // signDelim defaults to true → e.g. `40.7400 -74.0120 5`
 * ```
 *
 * @example Nested shape (TS validates dotted paths)
 * ```ts
 * type BBox = { sw: { lat: number; lng: number }; ne: { lat: number; lng: number } }
 * const p = numberTupleParam<BBox>({
 *   default: { sw: { lat: 0, lng: 0 }, ne: { lat: 0, lng: 0 } },
 *   fields: [
 *     { path: 'sw.lat', decimals: 4 },
 *     { path: 'sw.lng', decimals: 4 },
 *     { path: 'ne.lat', decimals: 4 },
 *     { path: 'ne.lng', decimals: 4 },
 *   ],
 * })
 * ```
 */
export function numberTupleParam<T extends object>(opts: NumberTupleParamOptions<T>): Param<T> {
  const {
    default: def,
    fields,
    delimiter = '_',
    signDelim = true,
    omitDefault = true,
  } = opts

  function format(v: T): string {
    const parts = fields.map(f => {
      const raw = getPath(v, f.path)
      const n = typeof raw === 'number' ? raw : 0
      return formatNumber(n, f)
    })
    return formatSignedParts(parts, delimiter, signDelim)
  }

  const defaultEncoded = format(def)

  return {
    encode(v: T): string | undefined {
      const enc = format(v)
      if (omitDefault && enc === defaultEncoded) return undefined
      return enc
    },
    decode(s: string | undefined): T {
      if (s === undefined || s === '') return def
      const parts = parseSignedParts(s, delimiter, signDelim)
      let result: T = def
      for (let i = 0; i < fields.length; i++) {
        const raw = parts[i]
        if (raw === undefined) continue
        const n = parseFloat(raw)
        if (isNaN(n)) continue
        result = setPath(result, fields[i].path, n)
      }
      return result
    },
  }
}
