/**
 * `flagPackParam`: collapse N boolean flags into one URL key. Each entry
 * in the spec is `<letter>: <default>`; the encoded value lists only the
 * letters whose current state differs from their default, in spec-declared
 * order. So `?_=` is omitted entirely when every flag is at its default.
 *
 * @example
 * ```ts
 * const flagsParam = flagPackParam({ Z: true, H: true, A: true })
 * const [flags, setFlags] = useUrlState('_', flagsParam)
 * // ?_=Z → { Z: false, H: true, A: true }
 * // ?_=ZA → { Z: false, H: true, A: false }  (declaration order)
 * // ?    → { Z: true,  H: true, A: true }    (all default)
 * ```
 *
 * Decode is lenient: out-of-order tokens (`?_=AZ`), duplicates (`?_=ZZ`),
 * and unknown letters all parse without throwing — they round-trip through
 * `cleanUrl({ stale: 'normalize' })` to the canonical spec-declared form.
 */

import type { Param } from './index.js'

/** Spec describing a flag pack: `<letter>: <default value>` map. */
export type FlagPackSpec = Record<string, boolean>

/** Flag-record type derived from a {@link FlagPackSpec}. */
export type FlagPackValues<S extends FlagPackSpec> = { [K in keyof S]: boolean }

function validateSpec(spec: FlagPackSpec): void {
  const seen = new Set<string>()
  for (const letter of Object.keys(spec)) {
    if (letter.length === 0) {
      throw new Error('flagPackParam: flag name must be non-empty')
    }
    if (seen.has(letter)) {
      throw new Error(`flagPackParam: duplicate flag ${JSON.stringify(letter)}`)
    }
    seen.add(letter)
  }
}

/**
 * Create a {@link Param} that packs `spec`'s flags into one URL token.
 * Encode emits the letters whose current state differs from their default,
 * in declaration order. Decode parses the same format (lenient on order,
 * dupes, and unknown letters).
 */
export function flagPackParam<S extends FlagPackSpec>(
  spec: S,
): Param<FlagPackValues<S>> {
  validateSpec(spec)
  const orderedKeys = Object.keys(spec) as (keyof S & string)[]
  const known = new Set<string>(orderedKeys)
  const defaults = { ...spec } as FlagPackValues<S>

  return {
    encode(values: FlagPackValues<S>): string | undefined {
      const parts: string[] = []
      for (const key of orderedKeys) {
        if (values[key] !== spec[key]) parts.push(key)
      }
      if (parts.length === 0) return undefined
      return parts.join('')
    },
    decode(encoded: string | undefined): FlagPackValues<S> {
      const out = { ...defaults }
      if (!encoded) return out
      // Greedy longest-match scan so multi-char letters compose cleanly.
      // (Even though spec letters are typically single-char, declared keys
      // may differ in length — match the longest known prefix first.)
      const sortedByLen = [...orderedKeys].sort((a, b) => b.length - a.length)
      let i = 0
      while (i < encoded.length) {
        let matched: string | null = null
        for (const k of sortedByLen) {
          if (encoded.startsWith(k, i)) { matched = k; break }
        }
        if (matched && known.has(matched)) {
          out[matched as keyof S] = (!spec[matched]) as FlagPackValues<S>[keyof S]
          i += matched.length
        } else {
          // Unknown letter: skip one char, leave diagnostics to inspectUrl.
          i += 1
        }
      }
      return out
    },
  }
}
