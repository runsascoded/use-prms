/**
 * `useUrlAlias`: one logical value sourced from N URL keys, with a
 * designated *canonical* key for writes. Reads each alias key via its own
 * `Param<T | undefined>`, hands the decoded values to a user-supplied
 * `merge` function, and on first render rewrites the URL into canonical
 * form (canonical key only, aliases stripped).
 *
 * The prototypical case is ELvis's `?m=mp-2375705` (canonical) /
 * `?mp=2375705` (shorthand) pair: both resolve to the same internal
 * `materialId`, and the URL should normalize to `?m=…` on mount so shared
 * links are predictable.
 *
 * `merge` decides resolution. Return a value (or `undefined`) to adopt
 * it; return (or throw) an `Error` to signal a conflict — `onConflict`
 * controls what happens next (default: warn + adopt the canonical key's
 * decoded value).
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Param } from './index.js'
import type { LocationStrategy, MultiEncoded } from './core.js'
import { getDefaultStrategy } from './core.js'

/** Result returned by an `AliasInput<T>['merge']` callback. */
export type AliasMergeResult<T> = T | undefined | Error

/** Mode for handling a merge-conflict `Error`. */
export type AliasConflictMode = 'warn' | 'throw' | ((err: Error) => void)

export interface AliasInput<T> {
  /**
   * Ordered list of URL keys. Index 0 is the *canonical* write target;
   * later entries are aliases (read-only).
   */
  keys: readonly [string, ...string[]]
  /**
   * Per-key decoder. Maps each entry in `keys` to a `Param<T | undefined>`
   * so an absent key reads as `undefined`. Different aliases can use
   * different decoders (e.g. canonical `m` decodes `'mp-2375705'`
   * unchanged; alias `mp` decodes `'2375705'` → `'mp-2375705'`).
   */
  params: Record<string, Param<T | undefined>>
  /**
   * Merge raw decoded values into the resolved state. Receives a record
   * keyed by every entry in `keys` (each value is the decoded result, or
   * `undefined` if the key is absent). Return the resolved value, or
   * return/throw an `Error` to signal a conflict; see `onConflict`.
   */
  merge: (vals: Record<string, T | undefined>) => AliasMergeResult<T>
  /**
   * What to do when `merge` returns/throws an `Error`.
   * - `'warn'` *(default)*: `console.warn` the message, then adopt the
   *   canonical key's decoded value.
   * - `'throw'`: rethrow.
   * - `function`: invoked with the error; afterwards we adopt the
   *   canonical key's decoded value.
   */
  onConflict?: AliasConflictMode
  /**
   * If `true` *(default)*, on first render strip every non-canonical
   * alias key and re-write the canonical key from the resolved value.
   * Set `false` to leave the URL alone (aliases are still resolved on
   * subsequent navigations).
   */
  canonicalizeOnMount?: boolean
}

const snapshotCache = new WeakMap<LocationStrategy, {
  raw: string
  snapshot: Record<string, MultiEncoded>
}>()

function getSnapshot(strategy: LocationStrategy): Record<string, MultiEncoded> {
  const raw = strategy.getRaw()
  const cached = snapshotCache.get(strategy)
  if (cached && cached.raw === raw) return cached.snapshot
  const snapshot = strategy.parse()
  snapshotCache.set(strategy, { raw, snapshot })
  return snapshot
}

function getServerSnapshot(): Record<string, MultiEncoded> {
  return {}
}

function handleConflict(err: Error, mode: AliasConflictMode): void {
  if (mode === 'throw') throw err
  if (mode === 'warn') {
    console.warn(`[use-prms] useUrlAlias: ${err.message}`)
    return
  }
  mode(err)
}

/**
 * React hook for managing one logical value sourced from multiple URL
 * keys. See {@link AliasInput} for the full options shape.
 *
 * Returns `[value, setValue]`. `setValue` always writes to `keys[0]`
 * (the canonical key) and strips every alias key from the URL.
 *
 * @example
 * ```tsx
 * type MatId = string
 * const [materialId, setMaterialId] = useUrlAlias<MatId>({
 *   keys: ['m', 'mp'] as const,
 *   params: {
 *     m: stringParam(),
 *     mp: {
 *       encode: v => v ? v.slice(3) : undefined,
 *       decode: v => v ? `mp-${v}` : undefined,
 *     },
 *   },
 *   merge: ({ m, mp }) => {
 *     if (m && mp && m !== mp) return new Error(`m=${m} vs mp=${mp}`)
 *     return m ?? mp
 *   },
 * })
 * // `?mp=2375705` → URL becomes `?m=mp-2375705`, materialId === 'mp-2375705'
 * ```
 */
export function useUrlAlias<T>(
  input: AliasInput<T>,
): [T | undefined, (v: T | undefined) => void] {
  const {
    keys,
    params,
    merge,
    onConflict = 'warn',
    canonicalizeOnMount = true,
  } = input

  const canonicalKey = keys[0]
  const aliasKeys = keys.slice(1)
  const strategy = getDefaultStrategy()

  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot,
  )

  // Causality tracking: remember the last value we wrote so a re-render
  // triggered by our own URL update returns the authoritative value
  // without re-decoding (avoids lossy snap-back if encode/decode isn't
  // perfectly bijective).
  const lastWrittenRef = useRef<{
    canonicalEncoded: string | undefined
    value: T | undefined
  } | null>(null)

  const rawValues: Record<string, string | undefined> = {}
  const decodedValues: Record<string, T | undefined> = {}
  for (const k of keys) {
    const enc = urlParams[k]?.[0]
    rawValues[k] = enc
    decodedValues[k] = params[k].decode(enc)
  }

  const canonicalEnc = rawValues[canonicalKey]
  const aliasesAbsent = aliasKeys.every(k => rawValues[k] === undefined)

  let value: T | undefined
  const lastWritten = lastWrittenRef.current
  if (
    lastWritten &&
    lastWritten.canonicalEncoded === canonicalEnc &&
    aliasesAbsent
  ) {
    value = lastWritten.value
  } else {
    lastWrittenRef.current = null
    let result: AliasMergeResult<T>
    try {
      result = merge(decodedValues)
    } catch (e) {
      result = e instanceof Error ? e : new Error(String(e))
    }
    if (result instanceof Error) {
      handleConflict(result, onConflict)
      value = decodedValues[canonicalKey]
    } else {
      value = result
    }
  }

  const writeToUrl = useCallback(
    (canonicalEncoded: string | undefined) => {
      if (typeof window === 'undefined') return

      const current = strategy.parse()
      const next: Record<string, MultiEncoded> = { ...current }

      if (canonicalEncoded === undefined) delete next[canonicalKey]
      else next[canonicalKey] = [canonicalEncoded]
      for (const k of aliasKeys) delete next[k]

      const url = new URL(window.location.href)
      const newUrl = strategy.buildUrl(url, next)
      window.history.replaceState({ ...window.history.state }, '', newUrl)
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [canonicalKey, aliasKeys.join('\0'), strategy], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const setValue = useCallback(
    (v: T | undefined) => {
      const enc = params[canonicalKey].encode(v)
      lastWrittenRef.current = { canonicalEncoded: enc, value: v }
      writeToUrl(enc)
    },
    [params, canonicalKey, writeToUrl],
  )

  const canonicalizedRef = useRef(false)
  useEffect(() => {
    if (!canonicalizeOnMount || canonicalizedRef.current) return
    canonicalizedRef.current = true

    const targetEnc = params[canonicalKey].encode(value)
    const canonicalMatches = targetEnc === canonicalEnc
    if (canonicalMatches && aliasesAbsent) return

    lastWrittenRef.current = { canonicalEncoded: targetEnc, value }
    writeToUrl(targetEnc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return [value, setValue]
}
