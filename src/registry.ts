/**
 * A module-level registry of the params a running app has mounted, so a
 * host can reflect on its own URL — what each key means, which keys it
 * would honour, why a stale link decodes differently — without the
 * library dictating any UI. See `reflection.ts` for the read side.
 *
 * The registry is deliberately framework-agnostic (a `Map` plus a
 * listener set): the React hooks call `registerParam` on mount and the
 * returned disposer on unmount, but nothing here imports React.
 */

import type { Encoded, Param } from './index.js'
import type { LocationStrategy } from './core.js'
import { hashStrategy } from './core.js'

export type StrategyName = 'query' | 'hash'

/** Map a live `LocationStrategy` to its reflection name. */
export function strategyName(strategy: LocationStrategy): StrategyName {
  return strategy === hashStrategy ? 'hash' : 'query'
}

/** Human copy a caller attaches to a param via the `describe` hook option. */
export interface ParamDescribe {
  /** Short label, e.g. "Diff window". Falls back to the key when absent. */
  label?: string
  /** Longer copy. `string` in the pure layer; a host may pass a ReactNode. */
  description?: unknown
  /** Example encodings a host can show, e.g. `['260916-2001-1d']`. */
  examples?: string[]
}

/** What a mounted hook (or a `describeParams` catalogue entry) registers. */
export interface ParamRegistration extends ParamDescribe {
  /** Primary URL key (the canonical key, for an alias). */
  key: string
  /** Every URL key this entry claims — one, except aliases claim all. */
  keys: string[]
  strategy: StrategyName
  /** Encoder/decoder for canonical forms and classification. */
  param: Param<unknown>
  /** Per-key decoders for an alias entry (canonical + alias keys). */
  aliasParams?: Record<string, Param<unknown>>
  /** True for `useMultiUrlState` (repeated-key) params. */
  multi: boolean
  /** `param.encode(param.decode(undefined))` — the "currently default" form. */
  defaultEncoded: Encoded
  /** Mount count — the same key may be read by several components. */
  refs: number
}

/** Arguments to {@link registerParam}. */
export interface RegisterInput extends ParamDescribe {
  key: string
  keys?: string[]
  strategy: StrategyName
  param: Param<unknown>
  aliasParams?: Record<string, Param<unknown>>
  multi?: boolean
}

const live = new Map<string, ParamRegistration>()
const catalogue = new Map<string, ParamRegistration>()
const listeners = new Set<() => void>()

const idOf = (strategy: StrategyName, key: string): string => `${strategy}::${key}`

function notify(): void {
  for (const cb of listeners) cb()
}

/** Subscribe to registry mutations (register / unregister / describeParams). */
export function onRegistryChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function defaultEncodedOf(input: RegisterInput): Encoded {
  // Multi params encode/decode arrays; there's no single-string default, so
  // leave it undefined and let reflection report multi presence + value.
  if (input.multi) return undefined
  try {
    return input.param.encode(input.param.decode(undefined))
  } catch {
    return undefined
  }
}

/**
 * Register a mounted param. Returns a disposer to call on unmount.
 *
 * The same `(strategy, key)` registered by several components ref-counts:
 * the first registration's `param` and metadata are kept (a stable
 * identity for the key), and later registrations only bump `refs`. The
 * disposer is idempotent and drops the entry when `refs` hits zero.
 */
export function registerParam(input: RegisterInput): () => void {
  const id = idOf(input.strategy, input.key)
  const existing = live.get(id)
  if (existing) {
    existing.refs += 1
  } else {
    live.set(id, {
      key: input.key,
      keys: input.keys ?? [input.key],
      strategy: input.strategy,
      param: input.param,
      aliasParams: input.aliasParams,
      multi: input.multi ?? false,
      label: input.label,
      description: input.description,
      examples: input.examples,
      defaultEncoded: defaultEncodedOf(input),
      refs: 1,
    })
  }
  notify()

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    const entry = live.get(id)
    if (!entry) return
    entry.refs -= 1
    if (entry.refs <= 0) live.delete(id)
    notify()
  }
}

/**
 * Register descriptive metadata for keys with no mounted hook — a
 * whole-app catalogue. Entries reflect with `refs: 0` and are merged
 * under any live registration of the same key (the live entry wins;
 * catalogue fills in metadata the hook didn't supply). Pass a `param`
 * for a dormant entry to still classify against the URL.
 *
 * Returns a disposer that removes the entries it added.
 */
export function describeParams(
  entries: Record<string, ParamDescribe & { param?: Param<unknown>; multi?: boolean }>,
  opts: { strategy?: StrategyName } = {},
): () => void {
  const strategy = opts.strategy ?? 'query'
  const ids: string[] = []
  for (const [key, meta] of Object.entries(entries)) {
    const id = idOf(strategy, key)
    const param = meta.param ?? passthroughParam
    catalogue.set(id, {
      key,
      keys: [key],
      strategy,
      param,
      multi: meta.multi ?? false,
      label: meta.label,
      description: meta.description,
      examples: meta.examples,
      defaultEncoded: meta.param ? defaultEncodedOf({ key, strategy, param, multi: meta.multi }) : undefined,
      refs: 0,
    })
    ids.push(id)
  }
  notify()
  return () => {
    for (const id of ids) catalogue.delete(id)
    notify()
  }
}

/** Identity param for catalogue entries declared without their own decoder. */
const passthroughParam: Param<unknown> = {
  encode: v => (v === undefined || v === null ? undefined : String(v)),
  decode: e => e,
}

/** Snapshot of all live registrations for a strategy (or all strategies). */
export function liveRegistrations(strategy?: StrategyName): ParamRegistration[] {
  const all = [...live.values()]
  return strategy ? all.filter(e => e.strategy === strategy) : all
}

/** Snapshot of all catalogue entries for a strategy (or all strategies). */
export function catalogueRegistrations(strategy?: StrategyName): ParamRegistration[] {
  const all = [...catalogue.values()]
  return strategy ? all.filter(e => e.strategy === strategy) : all
}

/** Test-only: drop every live and catalogue registration. */
export function __resetRegistry(): void {
  live.clear()
  catalogue.clear()
  notify()
}
