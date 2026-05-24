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
  /** Keys present in the URL but not declared (and not declared-deprecated). */
  unrecognized: string[]
  /** Subset of declared-deprecated keys present in the URL. */
  deprecated: string[]
  /** Declared keys whose URL value is garbage. */
  malformed: KeyedDiagnostic[]
  /** Declared keys whose URL value parses but is non-canonical. */
  stale: KeyedDiagnostic[]
}

/** Record of declared params. */
export type Params = Record<string, Param<any>>

/** Map a params record `P` to the corresponding decoded-value record. */
export type ParamValues<P extends Params> = {
  [K in keyof P]: P[K] extends Param<infer T> ? T : never
}

/**
 * Function form of a deprecated entry: receives the old raw URL value,
 * returns a partial record from declared param keys to the new typed values.
 * `cleanUrl` encodes each via `params[k].encode(v)`.
 */
export type DeprecatedMigration<P extends Params = Params> =
  (raw: string) => Partial<ParamValues<P>>

/**
 * Declaration of which URL keys are deprecated:
 * - `string[]`: drop these keys.
 * - `Record<string, null | DeprecatedMigration<P>>`: `null` drops; a function
 *   migrates the old value to new typed param values, then drops the old key.
 */
export type DeprecatedSpec<P extends Params = Params> =
  | readonly string[]
  | { [key: string]: null | DeprecatedMigration<P> }

/** Info fired to `onDeprecated` for each deprecated key found in the URL. */
export interface DeprecatedInfo {
  key: string
  raw: string
  /** Present only if a migration function ran for this key. */
  migrated?: Partial<ParamValues<Params>>
}

function deprecatedKeysOf(spec: DeprecatedSpec<any> | undefined): string[] {
  if (!spec) return []
  return Array.isArray(spec) ? [...spec] : Object.keys(spec)
}

function migrationFor(spec: DeprecatedSpec<any> | undefined, key: string): DeprecatedMigration<any> | null {
  if (!spec || Array.isArray(spec)) return null
  const v = (spec as Record<string, null | DeprecatedMigration<any>>)[key]
  return typeof v === 'function' ? v : null
}

const defaultOnDeprecated = ({ key, raw, migrated }: DeprecatedInfo) => {
  if (migrated) {
    console.warn(`[use-prms] migrated deprecated URL param "${key}"=${raw} →`, migrated)
  } else {
    console.warn(`[use-prms] stripping deprecated URL param "${key}"=${raw}`)
  }
}

/** Options accepted by `inspectUrl`. */
export interface InspectUrlOptions<P extends Params = Params> {
  deprecated?: DeprecatedSpec<P>
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
export function inspectUrl<P extends Params>(
  params: P,
  options: InspectUrlOptions<P> = {},
  strategy: LocationStrategy = getDefaultStrategy(),
): UrlDiagnostics {
  const urlParams = strategy.parse()
  const declared = new Set(Object.keys(params))
  const deprecatedSet = new Set(
    deprecatedKeysOf(options.deprecated).filter(k => !declared.has(k))
  )
  const present = Object.keys(urlParams)

  const unrecognized = present.filter(k => !declared.has(k) && !deprecatedSet.has(k))
  const deprecated = present.filter(k => deprecatedSet.has(k))
  const malformed: KeyedDiagnostic[] = []
  const stale: KeyedDiagnostic[] = []

  for (const key of declared) {
    const raw = urlParams[key]?.[0]
    const c = classifyParam(params[key], raw)
    if (c.state === 'malformed') malformed.push({ key, raw: c.raw, canonical: c.canonical })
    else if (c.state === 'stale') stale.push({ key, raw: c.raw, canonical: c.canonical })
  }

  return { unrecognized, deprecated, malformed, stale }
}

/**
 * Policy for `cleanUrl`. Each axis is independent; defaults are conservative
 * (`'keep'` everywhere — `cleanUrl` is a no-op until the caller opts in).
 */
export interface CleanUrlPolicy<P extends Params = Params> {
  /** What to do with unrecognized keys. Default: `'keep'`. */
  unrecognized?: 'keep' | 'strip'
  /** What to do with malformed values. `'reset'` re-emits canonical (stripping the key when canonical is `undefined`). Default: `'keep'`. */
  malformed?: 'keep' | 'reset'
  /** What to do with stale values. `'normalize'` re-emits canonical. Default: `'keep'`. */
  stale?: 'keep' | 'normalize'
  /**
   * Named keys to strip (optionally migrating first). See `DeprecatedSpec`.
   * Independent of `unrecognized`.
   */
  deprecated?: DeprecatedSpec<P>
  /**
   * Fires once per deprecated key actually present in the URL. Default:
   * `console.warn` with a structured message. Pass `null` to silence.
   */
  onDeprecated?: ((info: DeprecatedInfo) => void) | null
}

/**
 * Apply a cleanup policy to the current URL in-place (via
 * `history.replaceState`). Returns the diagnostics observed (so the caller
 * can log/notify based on what was acted on).
 *
 * Calling with the default policy (`{}`) returns diagnostics without
 * touching the URL — equivalent to `inspectUrl`.
 */
export function cleanUrl<P extends Params>(
  params: P,
  policy: CleanUrlPolicy<P> = {},
  strategy: LocationStrategy = getDefaultStrategy(),
): UrlDiagnostics {
  const diag = inspectUrl(params, { deprecated: policy.deprecated }, strategy)
  const {
    unrecognized = 'keep',
    malformed = 'keep',
    stale = 'keep',
    deprecated: depSpec,
    onDeprecated,
  } = policy

  const willStripUnrecognized = unrecognized === 'strip' && diag.unrecognized.length > 0
  const willResetMalformed = malformed === 'reset' && diag.malformed.length > 0
  const willNormalizeStale = stale === 'normalize' && diag.stale.length > 0
  const willHandleDeprecated = diag.deprecated.length > 0
  if (!willStripUnrecognized && !willResetMalformed && !willNormalizeStale && !willHandleDeprecated) return diag

  if (typeof window === 'undefined') return diag

  const current = strategy.parse()
  const next: Record<string, string[]> = { ...current }

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

  if (willHandleDeprecated) {
    const handler = onDeprecated === null ? null
      : onDeprecated ?? defaultOnDeprecated
    for (const key of diag.deprecated) {
      const raw = current[key]?.[0] ?? ''
      const migrate = migrationFor(depSpec, key)
      let migrated: Record<string, unknown> | undefined
      if (migrate) {
        migrated = migrate(raw)
        for (const [mk, mv] of Object.entries(migrated)) {
          const p = params[mk]
          if (!p) continue
          const enc = p.encode(mv)
          if (enc === undefined) delete next[mk]
          else next[mk] = [enc]
        }
      }
      delete next[key]
      handler?.({ key, raw, ...(migrated !== undefined && { migrated }) })
    }
  }

  const url = new URL(window.location.href)
  const updated = strategy.buildUrl(url, next)
  window.history.replaceState({ ...window.history.state }, '', updated)
  // Notify subscribers (React Router etc. — same pattern used in core.ts).
  window.dispatchEvent(new PopStateEvent('popstate'))

  return diag
}
