/**
 * React bindings for URL-parameter state.
 *
 * Thin adapters over the framework-free `UrlBinding` (see `store.ts`): each
 * hook owns a binding for the component's lifetime, feeds it the live codecs +
 * options each render, reads values through `useSyncExternalStore`, and keeps
 * the reflection-registry + diagnostics plumbing (which is React-specific) in
 * this layer. The Vue binding reuses the same `UrlBinding` with Vue reactivity.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import type { Param } from './types.js'
import type { LocationStrategy, MultiEncoded } from './strategies.js'
import { getDefaultStrategy } from './strategies.js'
import {
  UrlBinding,
  getServerSnapshot,
  getUrlSnapshot,
  multiToSingle,
  toMultiCodec,
  type MultiCodec,
} from './store.js'
import { registerParam, strategyName, type ParamDescribe } from './registry.js'
import type { MultiParam } from './multiParams.js'
import {
  classifyParam,
  cleanUrl,
  inspectUrl,
  type CleanUrlPolicy,
  type ParamDiagnostic,
  type Params,
  type UrlDiagnostics,
} from './diagnostics.js'

/**
 * Options for useUrlState hook
 */
export interface UseUrlStateOptions {
  /**
   * Debounce URL writes in milliseconds.
   * State updates immediately, but URL updates are debounced.
   * Useful for high-frequency updates (dragging, animation, typing).
   * @default 0 (no debounce)
   */
  debounce?: number

  /**
   * Use pushState (true) or replaceState (false) when updating URL.
   * @default false (replaceState)
   */
  push?: boolean

  /**
   * Fired with a `ParamDiagnostic` whenever the URL value for this key
   * changes. Use to log/warn about stale or malformed inputs without
   * tying that to cleanup.
   */
  onDiagnostic?: (diag: ParamDiagnostic) => void

  /**
   * Human copy attached to this param in the reflection registry
   * (`reflectParams` / `useParamReflection`). Purely descriptive — it
   * doesn't affect encoding.
   */
  describe?: ParamDescribe
}

/**
 * Options for `useUrlStates` (multi-key) — extends single-key options with
 * URL-level reporting and cleanup.
 */
export interface UseUrlStatesOptions<P extends Params = Params> extends Omit<UseUrlStateOptions, 'onDiagnostic' | 'describe'> {
  /**
   * Fired with a `UrlDiagnostics` whenever the URL changes. Reports
   * unrecognized keys, malformed values, and stale-format values.
   */
  onDiagnostics?: (diag: UrlDiagnostics) => void

  /**
   * If set, runs `cleanUrl(params, policy)` once on mount. Independent of
   * `onDiagnostics`: callers can observe without acting, or act without
   * observing, or both.
   */
  cleanOnMount?: CleanUrlPolicy<P>

  /**
   * Per-key human copy for the reflection registry. Keys not listed still
   * register (label falls back to the key).
   */
  describe?: Partial<Record<keyof P, ParamDescribe>>
}

/** One param's contribution to the reflection registry. */
interface RegSpec {
  key: string
  keys?: string[]
  param: Param<any> | MultiParam<any>
  multi?: boolean
  describe?: ParamDescribe
  aliasParams?: Record<string, Param<any>>
}

/**
 * Register `specs` with the reflection registry for the calling
 * component's lifetime. `param`/metadata are snapshotted from the latest
 * render via a ref, so registration re-runs only when the key set or
 * strategy changes (not when a factory param gets a fresh identity each
 * render).
 */
function useParamRegistrations(strategy: LocationStrategy, specs: RegSpec[]): void {
  const sName = strategyName(strategy)
  const specsRef = useRef(specs)
  specsRef.current = specs
  const sig = specs.map(s => s.key).join('\0')
  useEffect(() => {
    const disposers = specsRef.current.map(s => registerParam({
      key: s.key,
      keys: s.keys,
      strategy: sName,
      param: s.param as Param<unknown>,
      aliasParams: s.aliasParams as Record<string, Param<unknown>> | undefined,
      multi: s.multi,
      label: s.describe?.label,
      description: s.describe?.description,
      examples: s.describe?.examples,
    }))
    return () => { for (const d of disposers) d() }
  }, [sName, sig])
}

/**
 * Shared React glue: hold a `UrlBinding` for this component's lifetime, feed
 * it the live codecs + options each render, and read values through
 * `useSyncExternalStore`. Returns the decoded value per key, a batched write
 * fn, and the raw snapshot (for diagnostics).
 */
function useUrlBinding(
  codecs: Record<string, MultiCodec<unknown>>,
  push: boolean,
  debounceMs: number,
): {
  values: Record<string, unknown>
  write: (values: Record<string, unknown>) => void
  snapshot: Record<string, MultiEncoded>
} {
  const strategy = getDefaultStrategy()
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0)

  // One binding per component instance; recreated only if the strategy swaps.
  const bindingRef = useRef<UrlBinding | null>(null)
  const strategyRef = useRef(strategy)
  if (bindingRef.current === null || strategyRef.current !== strategy) {
    bindingRef.current = new UrlBinding(strategy, forceUpdate)
    strategyRef.current = strategy
  }
  const binding = bindingRef.current

  binding.setCodecs(codecs)
  binding.setPush(push)

  const snapshot = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getUrlSnapshot(strategy),
    getServerSnapshot,
  )

  const values = binding.read(snapshot)

  useEffect(() => {
    binding.setDebounce(debounceMs)
    return () => binding.dispose()
  }, [binding, debounceMs])

  const write = useCallback((v: Record<string, unknown>) => binding.write(v), [binding])

  return { values, write, snapshot }
}

/**
 * React hook for managing a single URL query parameter.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param key - Query parameter key
 * @param param - Param encoder/decoder
 * @param options - Options (debounce, push)
 * @returns Tuple of [value, setValue, diagnostic]
 *
 * @example
 * ```tsx
 * // Basic usage
 * const [zoom, setZoom] = useUrlState('z', boolParam)
 *
 * // With debounce for high-frequency updates
 * const [position, setPosition] = useUrlState('pos', floatParam(0), { debounce: 300 })
 * ```
 */
export function useUrlState<T>(
  key: string,
  param: Param<T>,
  options: UseUrlStateOptions | boolean = {},
): [T, (value: T) => void, ParamDiagnostic] {
  // Handle legacy boolean `push` argument for backwards compatibility
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false, onDiagnostic } = opts

  const strategy = getDefaultStrategy()

  // Advertise this param to the reflection registry
  useParamRegistrations(strategy, [{ key, param, describe: opts.describe }])

  const codec = useMemo(() => toMultiCodec(param), [param])
  const codecs = useMemo(() => ({ [key]: codec }) as Record<string, MultiCodec<unknown>>, [key, codec])
  const { values, write, snapshot } = useUrlBinding(codecs, push, debounceMs)

  const value = values[key] as T
  const setValue = useCallback((v: T) => write({ [key]: v }), [write, key])

  // Round-trip classify the URL's current raw value. Recomputed on each
  // render — cheap (one encode + decode + string compare).
  const encoded = multiToSingle(snapshot[key] ?? [])
  const diagnostic = classifyParam(param, encoded)

  // Fire onDiagnostic callback when the diagnostic changes shape (state +
  // raw). We compare a serialized signature; the diagnostic objects
  // themselves are fresh per render.
  const lastDiagSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onDiagnostic) return
    const sig = JSON.stringify(diagnostic)
    if (sig === lastDiagSigRef.current) return
    lastDiagSigRef.current = sig
    onDiagnostic(diagnostic)
  })

  return [value, setValue, diagnostic]
}

/**
 * React hook for managing multiple URL query parameters together.
 * Updates are batched into a single history entry.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param params - Object mapping keys to Param types
 * @param options - Options (debounce, push)
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useUrlStates({
 *   zoom: boolParam,
 *   device: stringParam('default'),
 *   count: intParam(10)
 * })
 *
 * // Update multiple params at once
 * setValues({ zoom: true, count: 20 })
 * ```
 */
export function useUrlStates<P extends Record<string, Param<any>>>(
  params: P,
  options: UseUrlStatesOptions<P> | boolean = {},
): {
  values: { [K in keyof P]: P[K] extends Param<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>) => void
  diagnostics: UrlDiagnostics
} {
  // Handle legacy boolean `push` argument for backwards compatibility
  const opts: UseUrlStatesOptions<P> = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false, onDiagnostics, cleanOnMount } = opts

  const strategy = getDefaultStrategy()

  // Advertise every declared param to the reflection registry
  useParamRegistrations(
    strategy,
    Object.entries(params).map(([key, param]) => ({ key, param, describe: opts.describe?.[key] })),
  )

  const codecs = useMemo(
    () => Object.fromEntries(
      Object.entries(params).map(([key, param]) => [key, toMultiCodec(param)]),
    ) as Record<string, MultiCodec<unknown>>,
    [params],
  )
  const { values: rawValues, write } = useUrlBinding(codecs, push, debounceMs)

  const values = rawValues as { [K in keyof P]: P[K] extends Param<infer T> ? T : never }
  const setValues = useCallback(
    (updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>) =>
      write(updates as Record<string, unknown>),
    [write],
  )

  // Compute diagnostics for the current URL — recomputed each render.
  const diagnostics = inspectUrl(params, { deprecated: cleanOnMount?.deprecated }, strategy)

  // Fire onDiagnostics callback when shape changes.
  const lastDiagSigRef = useRef<string | null>(null)
  useEffect(() => {
    if (!onDiagnostics) return
    const sig = JSON.stringify(diagnostics)
    if (sig === lastDiagSigRef.current) return
    lastDiagSigRef.current = sig
    onDiagnostics(diagnostics)
  })

  // Run cleanUrl once on mount if a policy is provided.
  useEffect(() => {
    if (cleanOnMount) cleanUrl(params, cleanOnMount, strategy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { values, setValues, diagnostics }
}

/**
 * React hook for managing a single multi-value URL parameter.
 * Supports repeated params like ?tag=a&tag=b&tag=c
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param key - Query parameter key
 * @param param - MultiParam encoder/decoder
 * @param options - Options (debounce, push)
 * @returns Tuple of [value, setValue]
 *
 * @example
 * ```tsx
 * const [tags, setTags] = useMultiUrlState('tag', multiStringParam())
 * // URL: ?tag=a&tag=b → tags = ['a', 'b']
 * ```
 */
export function useMultiUrlState<T>(
  key: string,
  param: MultiParam<T>,
  options: UseUrlStateOptions | boolean = {},
): [T, (value: T) => void] {
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  // Advertise this multi-value param to the reflection registry
  useParamRegistrations(strategy, [{ key, param, multi: true, describe: opts.describe }])

  // A MultiParam already is a MultiCodec.
  const codecs = useMemo(
    () => ({ [key]: param }) as Record<string, MultiCodec<unknown>>,
    [key, param],
  )
  const { values, write } = useUrlBinding(codecs, push, debounceMs)

  const value = values[key] as T
  const setValue = useCallback((v: T) => write({ [key]: v }), [write, key])

  return [value, setValue]
}

/**
 * React hook for managing multiple multi-value URL parameters together.
 * Updates are batched into a single history entry.
 *
 * Features:
 * - Bidirectional sync: state ↔ URL
 * - Causality tracking: prevents feedback loops and lossy re-decoding
 * - Optional debounce for high-frequency updates
 *
 * @param params - Object mapping keys to MultiParam types
 * @param options - Options (debounce, push)
 * @returns Object with decoded values and update function
 *
 * @example
 * ```tsx
 * const { values, setValues } = useMultiUrlStates({
 *   tags: multiStringParam(),
 *   ids: multiIntParam()
 * })
 *
 * // Update multiple multi-value params at once
 * setValues({ tags: ['a', 'b'], ids: [1, 2, 3] })
 * ```
 */
export function useMultiUrlStates<P extends Record<string, MultiParam<any>>>(
  params: P,
  options: UseUrlStateOptions | boolean = {},
): {
  values: { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>) => void
} {
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  // Advertise every declared multi-value param to the reflection registry
  useParamRegistrations(
    strategy,
    Object.keys(params).map(key => ({ key, param: params[key], multi: true })),
  )

  const codecs = useMemo(
    () => ({ ...params }) as unknown as Record<string, MultiCodec<unknown>>,
    [params],
  )
  const { values: rawValues, write } = useUrlBinding(codecs, push, debounceMs)

  const values = rawValues as { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }
  const setValues = useCallback(
    (updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>) =>
      write(updates as Record<string, unknown>),
    [write],
  )

  return { values, setValues }
}
