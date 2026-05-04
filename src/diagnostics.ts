/**
 * Structured reporting on the state of the URL relative to a declared param
 * spec, plus an imperative cleanup helper. Decoupled by design: `inspectUrl`
 * is pure (no side effects); `cleanUrl` mutates the URL but never on its own
 * — callers opt in via policy. Together they let apps observe and (separately)
 * normalize URL state without conflating the two concerns.
 */

import type { Param } from './index.js'
import type { LocationStrategy } from './core.js'
import { getDefaultStrategy } from './core.js'

/**
 * Per-key diagnostic for a declared parameter.
 *
 * - `absent`: key not present in URL
 * - `canonical`: URL value round-trips identically (encode(decode(raw)) === raw)
 * - `stale`: URL parses cleanly but is in a non-canonical format — re-emitting would change the URL
 * - `malformed`: URL value is garbage — decode produced the default and re-encode differs from raw
 */
export type ParamDiagnostic =
  | { state: 'absent' }
  | { state: 'canonical'; raw: string }
  | { state: 'stale'; raw: string; canonical: string | undefined }
  | { state: 'malformed'; raw: string; canonical: string | undefined }

/** A keyed pointer to a non-canonical URL value plus its canonical form. */
export interface KeyedDiagnostic {
  key: string
  raw: string
  /** What encode(decode(raw)) produced — the form the URL would take after normalization. `undefined` means the key would be stripped. */
  canonical: string | undefined
}

/**
 * Structured report on the URL's relationship to a declared param spec.
 */
export interface UrlDiagnostics {
  /** Keys present in the URL but not declared in `params`. */
  unrecognized: string[]
  /** Declared keys whose URL value is garbage. */
  malformed: KeyedDiagnostic[]
  /** Declared keys whose URL value parses but is non-canonical. */
  stale: KeyedDiagnostic[]
}

/**
 * Round-trip classify a single param's URL value. Pure helper; usable
 * outside React.
 *
 * Note on the malformed/stale split: when a URL legitimately encodes the
 * default value in a non-canonical format, this is reported as `malformed`
 * (a benign false-positive — `cleanUrl` with `malformed: 'reset'` produces
 * the correct outcome of stripping the key, since the value is the default).
 */
export function classifyParam<T>(
  param: Param<T>,
  raw: string | undefined,
): ParamDiagnostic {
  if (raw === undefined) return { state: 'absent' }
  const decoded = param.decode(raw)
  const reencoded = param.encode(decoded)
  if (raw === reencoded) return { state: 'canonical', raw }
  // Round-trip differs: distinguish stale (parsed cleanly into a non-default
  // value, just in old format) from malformed (decode collapsed to default,
  // i.e. the URL contained no usable info).
  const defaultEncoded = param.encode(param.decode(undefined))
  if (reencoded === defaultEncoded) return { state: 'malformed', raw, canonical: reencoded }
  return { state: 'stale', raw, canonical: reencoded }
}

/**
 * Inspect the current URL relative to a declared param spec. Pure — does
 * not mutate the URL.
 */
export function inspectUrl(
  params: Record<string, Param<any>>,
  strategy: LocationStrategy = getDefaultStrategy(),
): UrlDiagnostics {
  const urlParams = strategy.parse()
  const declared = new Set(Object.keys(params))

  const unrecognized = Object.keys(urlParams).filter(k => !declared.has(k))
  const malformed: KeyedDiagnostic[] = []
  const stale: KeyedDiagnostic[] = []

  for (const key of declared) {
    const raw = urlParams[key]?.[0]
    const c = classifyParam(params[key], raw)
    if (c.state === 'malformed') malformed.push({ key, raw: c.raw, canonical: c.canonical })
    else if (c.state === 'stale') stale.push({ key, raw: c.raw, canonical: c.canonical })
  }

  return { unrecognized, malformed, stale }
}

/**
 * Policy for `cleanUrl`. Each axis is independent; defaults are conservative
 * (`'keep'` everywhere — `cleanUrl` is a no-op until the caller opts in).
 */
export interface CleanUrlPolicy {
  /** What to do with unrecognized keys. Default: `'keep'`. */
  unrecognized?: 'keep' | 'strip'
  /** What to do with malformed values. `'reset'` re-emits canonical (stripping the key when canonical is `undefined`). Default: `'keep'`. */
  malformed?: 'keep' | 'reset'
  /** What to do with stale values. `'normalize'` re-emits canonical. Default: `'keep'`. */
  stale?: 'keep' | 'normalize'
}

/**
 * Apply a cleanup policy to the current URL in-place (via
 * `history.replaceState`). Returns the diagnostics observed (so the caller
 * can log/notify based on what was acted on).
 *
 * Calling with the default policy (`{}`) returns diagnostics without
 * touching the URL — equivalent to `inspectUrl`.
 */
export function cleanUrl(
  params: Record<string, Param<any>>,
  policy: CleanUrlPolicy = {},
  strategy: LocationStrategy = getDefaultStrategy(),
): UrlDiagnostics {
  const diag = inspectUrl(params, strategy)
  const {
    unrecognized = 'keep',
    malformed = 'keep',
    stale = 'keep',
  } = policy

  const willStripUnrecognized = unrecognized === 'strip' && diag.unrecognized.length > 0
  const willResetMalformed = malformed === 'reset' && diag.malformed.length > 0
  const willNormalizeStale = stale === 'normalize' && diag.stale.length > 0
  if (!willStripUnrecognized && !willResetMalformed && !willNormalizeStale) return diag

  if (typeof window === 'undefined') return diag

  const next: Record<string, string[]> = { ...strategy.parse() }

  if (willStripUnrecognized) {
    for (const k of diag.unrecognized) delete next[k]
  }
  const applyKeyed = (entries: KeyedDiagnostic[]) => {
    for (const { key, canonical } of entries) {
      if (canonical === undefined) delete next[key]
      else next[key] = [canonical]
    }
  }
  if (willResetMalformed) applyKeyed(diag.malformed)
  if (willNormalizeStale) applyKeyed(diag.stale)

  const url = new URL(window.location.href)
  const updated = strategy.buildUrl(url, next)
  window.history.replaceState({ ...window.history.state }, '', updated)
  // Notify subscribers (React Router etc. — same pattern used in core.ts).
  window.dispatchEvent(new PopStateEvent('popstate'))

  return diag
}
