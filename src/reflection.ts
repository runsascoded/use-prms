/**
 * Reflection: read the {@link registry} against the live URL so a host can
 * render what its params mean and how the current URL maps onto them. All
 * pure except {@link useParamReflection}, the React convenience wrapper.
 */

import { useMemo, useSyncExternalStore } from 'react'
import { getDefaultStrategy, queryStrategy, hashStrategy } from './core.js'
import { classifyParam } from './diagnostics.js'
import {
  catalogueRegistrations,
  liveRegistrations,
  onRegistryChange,
  strategyName,
  type ParamRegistration,
  type StrategyName,
} from './registry.js'

export type { StrategyName, ParamRegistration } from './registry.js'

/** A registered param plus its live classification against the current URL. */
export interface ParamReflection extends ParamRegistration {
  /** For an alias entry, which of `keys` the URL currently carries. */
  liveKey?: string
  /** Classification of the URL value (as `classifyParam` / `UrlDiagnostics`). */
  state: 'absent' | 'canonical' | 'stale' | 'malformed'
  /** What the URL has (joined, for multi-value). */
  raw?: string
  /** What it would normalize to, when `stale`/`malformed`. */
  canonical?: string
  /** The decoded value. */
  value: unknown
}

/** A URL key nothing registered, with its raw value. */
export interface UnknownParam {
  key: string
  raw: string
}

export interface ReflectOptions {
  /** Which strategy's params to reflect. Defaults to the active default. */
  strategy?: StrategyName
}

function resolveStrategy(opts: ReflectOptions): StrategyName {
  return opts.strategy ?? strategyName(getDefaultStrategy())
}

function parseFor(strategy: StrategyName): Record<string, string[]> {
  return (strategy === 'hash' ? hashStrategy : queryStrategy).parse()
}

/**
 * Every registered param for a strategy, each with its live classification.
 * A live hook and a `describeParams` catalogue entry for the same key merge
 * (the live entry wins; the catalogue fills in metadata it lacks).
 */
export function reflectParams(opts: ReflectOptions = {}): ParamReflection[] {
  const strategy = resolveStrategy(opts)
  const urlParams = parseFor(strategy)

  const merged = new Map<string, { live?: ParamRegistration; cat?: ParamRegistration }>()
  for (const e of liveRegistrations(strategy)) {
    (merged.get(e.key) ?? merged.set(e.key, {}).get(e.key)!).live = e
  }
  for (const e of catalogueRegistrations(strategy)) {
    (merged.get(e.key) ?? merged.set(e.key, {}).get(e.key)!).cat = e
  }

  const out: ParamReflection[] = []
  for (const [key, { live: L, cat: C }] of merged) {
    const base = (L ?? C)!
    const keys = base.keys
    const isAlias = keys.length > 1
    const liveKey = isAlias
      ? (keys.find(k => urlParams[k] !== undefined) ?? keys[0])
      : key
    const decodeParam = base.aliasParams?.[liveKey] ?? base.param

    let state: ParamReflection['state']
    let raw: string | undefined
    let canonical: string | undefined
    let value: unknown

    if (base.multi) {
      const arr = urlParams[liveKey] ?? []
      raw = arr.length ? arr.join(',') : undefined
      value = (decodeParam.decode as unknown as (e: string[]) => unknown)(arr)
      state = arr.length ? 'canonical' : 'absent'
    } else {
      const enc = urlParams[liveKey]?.[0]
      const c = classifyParam(decodeParam, enc)
      state = c.state
      value = decodeParam.decode(enc)
      if (c.state !== 'absent') raw = c.raw
      if (c.state === 'stale' || c.state === 'malformed') canonical = c.canonical
    }

    out.push({
      key,
      keys,
      strategy,
      param: base.param,
      aliasParams: base.aliasParams,
      multi: base.multi,
      label: L?.label ?? C?.label,
      description: L?.description ?? C?.description,
      examples: L?.examples ?? C?.examples,
      defaultEncoded: base.defaultEncoded,
      refs: L?.refs ?? 0,
      ...(isAlias && { liveKey }),
      state,
      ...(raw !== undefined && { raw }),
      ...(canonical !== undefined && { canonical }),
      value,
    })
  }
  return out
}

/** The URL's keys nothing registered (query or catalogue), with raw values. */
export function reflectUnknown(opts: ReflectOptions = {}): UnknownParam[] {
  const strategy = resolveStrategy(opts)
  const urlParams = parseFor(strategy)
  const known = new Set<string>()
  for (const e of liveRegistrations(strategy)) for (const k of e.keys) known.add(k)
  for (const e of catalogueRegistrations(strategy)) for (const k of e.keys) known.add(k)
  return Object.keys(urlParams)
    .filter(k => !known.has(k))
    .map(k => ({ key: k, raw: (urlParams[k] ?? []).join(',') }))
}

/** Subscribe to registry mutations and URL navigations. */
export function onReflectionChange(cb: () => void): () => void {
  const unRegistry = onRegistryChange(cb)
  const unQuery = queryStrategy.subscribe(cb)
  const unHash = hashStrategy.subscribe(cb)
  return () => { unRegistry(); unQuery(); unHash() }
}

// A monotonic version bumped on every reflection change, so
// `useSyncExternalStore` gets a stable snapshot between changes. The
// listener is a module-level singleton (SSR-safe: strategy.subscribe no-ops
// without a window).
let reflectionVersion = 0
onReflectionChange(() => { reflectionVersion += 1 })

/**
 * React hook: the reflection of registered params + unknown keys,
 * re-rendering on hook mount/unmount and on URL navigation. Reads the
 * registry only — it never registers a param itself.
 */
export function useParamReflection(opts: ReflectOptions = {}): {
  params: ParamReflection[]
  unknown: UnknownParam[]
} {
  const version = useSyncExternalStore(onReflectionChange, () => reflectionVersion, () => 0)
  const strategy = opts.strategy
  return useMemo(
    () => ({ params: reflectParams({ strategy }), unknown: reflectUnknown({ strategy }) }),
    [version, strategy],
  )
}
