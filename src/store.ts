/**
 * Framework-free URL-state store.
 *
 * This is the engine the React (`useUrlState` & friends) and Vue bindings are
 * both built on — it owns the parts that have nothing to do with a UI
 * framework:
 *
 * - a cached snapshot of the current strategy's params (`getUrlSnapshot`),
 * - the actual URL write (`writeParams`: build URL → `history` → `popstate`),
 * - a per-instance `UrlBinding` that holds the causality + debounce + pending
 *   bookkeeping for a set of keys, and selects the right value each render.
 *
 * No React/Vue import lives here; an adapter supplies an `onChange` callback
 * (React's force-update, Vue's `triggerRef`) and drives re-reads however its
 * framework prefers (`useSyncExternalStore`, `shallowRef` + `watch`, …).
 *
 * Everything works in the multi-value (`MultiEncoded`) domain so a single
 * implementation covers single- and multi-value params alike; single-value
 * params are adapted with `toMultiCodec`.
 */

import type { LocationStrategy, MultiEncoded } from './strategies.js'
import type { Param } from './types.js'
import type { MultiParam } from './multiParams.js'

/**
 * A value ↔ `MultiEncoded` converter. `MultiParam<T>` already is one; a
 * single-value `Param<T>` becomes one via {@link toMultiCodec}.
 */
export type MultiCodec<T> = {
  encode: (value: T) => MultiEncoded
  decode: (encoded: MultiEncoded) => T
}

/** Convert single-value `Encoded` to `MultiEncoded`. */
export function singleToMulti(encoded: string | undefined): MultiEncoded {
  if (encoded === undefined) return []
  return [encoded]
}

/** Convert `MultiEncoded` to single-value `Encoded` (first value, if any). */
export function multiToSingle(multi: MultiEncoded): string | undefined {
  if (multi.length === 0) return undefined
  return multi[0]
}

/** Adapt a single-value `Param<T>` to a `MultiCodec<T>`. */
export function toMultiCodec<T>(param: Param<T>): MultiCodec<T> {
  return {
    encode: (value) => singleToMulti(param.encode(value)),
    decode: (encoded) => param.decode(multiToSingle(encoded)),
  }
}

/** A `MultiParam<T>` is already a `MultiCodec<T>`; returned as-is. */
export function multiCodec<T>(param: MultiParam<T>): MultiCodec<T> {
  return param
}

/** Compare two arrays element-wise for equality. */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/**
 * A simple debounce with cancel support.
 */
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timeoutId = null
      fn(...args)
    }, ms)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}

/**
 * Cached snapshot per strategy (so query and hash don't share a cache).
 * Returning a stable object reference while the raw URL is unchanged is what
 * keeps React's `useSyncExternalStore` from looping.
 */
const snapshotCache = new WeakMap<LocationStrategy, {
  raw: string
  snapshot: Record<string, MultiEncoded>
}>()

/**
 * Current params for `strategy`, reusing the cached object if the raw URL
 * hasn't changed since the last call.
 */
export function getUrlSnapshot(strategy: LocationStrategy): Record<string, MultiEncoded> {
  const raw = strategy.getRaw()
  const cached = snapshotCache.get(strategy)
  if (cached && cached.raw === raw) return cached.snapshot
  const snapshot = strategy.parse()
  snapshotCache.set(strategy, { raw, snapshot })
  return snapshot
}

/** Server-side snapshot (always empty). */
export function getServerSnapshot(): Record<string, MultiEncoded> {
  return {}
}

/** Options controlling how `UrlBinding` writes to the URL. */
export interface WriteOptions {
  /** Use `pushState` (true) or `replaceState` (false, default). */
  push?: boolean
}

/**
 * Apply `updates` (per key: a `MultiEncoded`; an empty array deletes the key)
 * to `strategy`'s params in a single history entry, then notify listeners
 * (React Router etc.) via a synthetic `popstate`.
 */
export function writeParams(
  strategy: LocationStrategy,
  updates: Record<string, MultiEncoded>,
  options: WriteOptions = {},
): void {
  if (typeof window === 'undefined') return

  const currentParams = strategy.parse()
  for (const [key, encoded] of Object.entries(updates)) {
    if (encoded.length === 0) {
      delete currentParams[key]
    } else {
      currentParams[key] = encoded
    }
  }

  const url = new URL(window.location.href)
  const newUrl = strategy.buildUrl(url, currentParams)

  const method = options.push ? 'pushState' : 'replaceState'
  window.history[method]({ ...window.history.state }, '', newUrl)

  // Notify React Router and other libraries that listen to popstate.
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/** Per-key causality record: the last value this binding wrote. */
interface LastWritten {
  encoded: MultiEncoded
  decoded: unknown
}

/**
 * Holds the stateful bookkeeping for one consumer (one React hook call / one
 * Vue setup) across a set of keys:
 *
 * - **causality** (`lastWritten`): after a write, keep returning the value we
 *   wrote until the URL catches up — avoids a lossy re-decode / snap-back with
 *   imprecise encodings.
 * - **debounce + pending**: while a debounced write is in flight, return the
 *   value we intend to write. The discard check is **per key**: an external
 *   write to a *different* key (e.g. the section spy's silent `?s=…`) must not
 *   drop this binding's pending value — only a change to one of *our* keys
 *   does.
 * - **decode memoization**: a stable decoded reference while a key's encoded
 *   value and codec are unchanged, so params whose `decode` returns fresh
 *   objects don't churn referential identity each render.
 *
 * The adapter sets the live codec map each render (`setCodecs`) and the write
 * options (`push`), creates/tears down the debounce timer when the debounce ms
 * changes (`setDebounce`), reads values with `read(snapshot)`, writes with
 * `write(values)`, and calls `dispose()` on unmount. `onChange` is invoked
 * only when the binding needs the adapter to re-render without a URL change
 * (i.e. to reflect a freshly-set pending value).
 */
export class UrlBinding {
  private codecs: Record<string, MultiCodec<unknown>> = {}
  private push = false
  private debounceMs = 0
  private debounced: (ReturnType<typeof debounce<(u: Record<string, MultiEncoded>) => void>>) | null = null

  private lastWritten: Record<string, LastWritten> = {}
  private pending: {
    values: Record<string, unknown>
    /** Each owned key's encoded value when the debounce started. */
    prevEncoded: Record<string, MultiEncoded>
  } | null = null
  private decodeCache: Record<string, { encoded: MultiEncoded; codec: MultiCodec<unknown>; decoded: unknown }> = {}

  constructor(
    private readonly strategy: LocationStrategy,
    private readonly onChange: () => void,
  ) {}

  /** Replace the live key → codec map (called each render; cheap). */
  setCodecs(codecs: Record<string, MultiCodec<unknown>>): void {
    this.codecs = codecs
  }

  /** Set the write method used by subsequent writes. */
  setPush(push: boolean): void {
    this.push = push
  }

  /**
   * Create/replace or tear down the debounce timer for `ms`. A no-op when `ms`
   * is unchanged. Call from an effect; returns nothing.
   */
  setDebounce(ms: number): void {
    if (ms === this.debounceMs && (ms === 0) === (this.debounced === null)) return
    this.debounceMs = ms
    this.debounced?.cancel()
    this.debounced = ms > 0
      ? debounce((updates: Record<string, MultiEncoded>) => {
          writeParams(this.strategy, updates, { push: this.push })
          this.pending = null
        }, ms)
      : null
  }

  private decode(key: string, encoded: MultiEncoded): unknown {
    const codec = this.codecs[key]
    const cached = this.decodeCache[key]
    if (cached && cached.codec === codec && arraysEqual(cached.encoded, encoded)) {
      return cached.decoded
    }
    const decoded = codec.decode(encoded)
    this.decodeCache[key] = { encoded, codec, decoded }
    return decoded
  }

  /**
   * The decoded value for every owned key, given the live `snapshot`. May
   * discard a stale pending value (if one of our keys changed externally) as a
   * side-effect — matching the original hooks' render-time bookkeeping.
   */
  read(snapshot: Record<string, MultiEncoded>): Record<string, unknown> {
    const keys = Object.keys(this.codecs)
    const encOf = (k: string): MultiEncoded => snapshot[k] ?? []

    if (this.pending) {
      const ownKeyChanged = keys.some(k => !arraysEqual(encOf(k), this.pending!.prevEncoded[k] ?? []))
      if (ownKeyChanged) {
        // One of our keys changed externally during debounce — discard pending.
        this.pending = null
        this.debounced?.cancel()
        this.lastWritten = {}
        return Object.fromEntries(keys.map(k => [k, this.decode(k, encOf(k))]))
      }
      // Still in the debounce window — intended value for pending keys, else
      // the authoritative/decoded value.
      return Object.fromEntries(keys.map(k => {
        if (k in this.pending!.values) return [k, this.pending!.values[k]]
        const encoded = encOf(k)
        const lw = this.lastWritten[k]
        if (lw && arraysEqual(lw.encoded, encoded)) return [k, lw.decoded]
        return [k, this.decode(k, encoded)]
      }))
    }

    return Object.fromEntries(keys.map(k => {
      const encoded = encOf(k)
      const lw = this.lastWritten[k]
      if (lw && arraysEqual(lw.encoded, encoded)) {
        return [k, lw.decoded]
      }
      delete this.lastWritten[k]
      return [k, this.decode(k, encoded)]
    }))
  }

  /**
   * Write `values` (a partial map of owned keys). Batched into one history
   * entry; debounced if a debounce timer is active.
   */
  write(values: Record<string, unknown>): void {
    const encodedUpdates: Record<string, MultiEncoded> = {}
    for (const [key, value] of Object.entries(values)) {
      const codec = this.codecs[key]
      if (!codec) continue
      const encoded = codec.encode(value)
      encodedUpdates[key] = encoded
      this.lastWritten[key] = { encoded, decoded: value }
    }

    if (this.debounced) {
      const pendingValues = { ...(this.pending?.values ?? {}) }
      for (const [key, value] of Object.entries(values)) pendingValues[key] = value
      const parsed = this.strategy.parse()
      const prevEncoded: Record<string, MultiEncoded> = {}
      for (const k of Object.keys(this.codecs)) prevEncoded[k] = parsed[k] ?? []
      this.pending = { values: pendingValues, prevEncoded }
      this.debounced(encodedUpdates)
      // Re-render now so the pending value is reflected before the timer fires.
      this.onChange()
    } else {
      writeParams(this.strategy, encodedUpdates, { push: this.push })
    }
  }

  /** Cancel any in-flight debounced write. Call on unmount. */
  dispose(): void {
    this.debounced?.cancel()
  }
}
