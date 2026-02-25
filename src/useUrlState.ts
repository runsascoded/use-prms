/**
 * React hooks for managing URL parameters
 */

import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from 'react'
import type { Param } from './index.js'
import type { LocationStrategy, MultiEncoded } from './core.js'
import { getDefaultStrategy } from './core.js'
import type { MultiParam } from './multiParams.js'

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
}

/**
 * Simple debounce implementation with cancel support
 */
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  ms: number
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
 * Cached snapshot to prevent infinite loops in useSyncExternalStore
 * Keyed by strategy (so query and hash don't share cache)
 */
const snapshotCache = new WeakMap<LocationStrategy, {
  raw: string
  snapshot: Record<string, MultiEncoded>
}>()

/**
 * Get URL snapshot for a given strategy
 * Returns cached snapshot if URL hasn't changed
 */
function getSnapshot(strategy: LocationStrategy): Record<string, MultiEncoded> {
  const raw = strategy.getRaw()
  const cached = snapshotCache.get(strategy)

  if (cached && cached.raw === raw) {
    return cached.snapshot
  }

  const snapshot = strategy.parse()
  snapshotCache.set(strategy, { raw, snapshot })
  return snapshot
}

/**
 * Server-side snapshot (always empty)
 */
function getServerSnapshot(): Record<string, MultiEncoded> {
  return {}
}

/**
 * Convert single-value Encoded to multi-value MultiEncoded
 */
function singleToMulti(encoded: string | undefined): MultiEncoded {
  if (encoded === undefined) return []
  return [encoded]
}

/**
 * Convert multi-value MultiEncoded to single-value Encoded
 */
function multiToSingle(multi: MultiEncoded): string | undefined {
  if (multi.length === 0) return undefined
  return multi[0]
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
 * @returns Tuple of [value, setValue]
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
  options: UseUrlStateOptions | boolean = {}
): [T, (value: T) => void] {
  // Handle legacy boolean `push` argument for backwards compatibility
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  // Use ref to avoid recreating setValue when param changes
  const paramRef = useRef(param)
  paramRef.current = param

  // Force re-render trigger for debounce (setValue sets pendingRef but needs a re-render)
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0)

  // Causality tracking: track what we last wrote to avoid re-decoding our own writes
  // This prevents feedback loops and lossy snap-back with imprecise encodings
  const lastWrittenRef = useRef<{
    encoded: string | undefined
    decoded: T
  } | null>(null)

  // Pending value during debounce window (set by setValue, cleared when URL is written)
  const pendingRef = useRef<{
    decoded: T
    prevRaw: string
  } | null>(null)

  // Create debounced write ref (declared early so render code can reference it)
  const debouncedWriteRef = useRef<ReturnType<typeof debounce<typeof writeToUrl>> | null>(null)

  // Subscribe to URL changes
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  )

  // Get encoded value from URL
  const encoded = multiToSingle(urlParams[key] ?? [])

  // Decode value with causality tracking
  const cacheRef = useRef<{ encoded: typeof encoded; param: Param<T>; decoded: T } | null>(null)

  const raw = strategy.getRaw()

  let value: T
  if (pendingRef.current) {
    // Debounce in flight — check if URL changed externally
    if (raw !== pendingRef.current.prevRaw) {
      // URL changed externally during debounce — discard pending
      pendingRef.current = null
      debouncedWriteRef.current?.cancel()
      // Fall through to URL decode
      if (cacheRef.current === null || cacheRef.current.encoded !== encoded || cacheRef.current.param !== param) {
        cacheRef.current = { encoded, param, decoded: param.decode(encoded) }
      }
      value = cacheRef.current.decoded
      lastWrittenRef.current = null
    } else {
      // Still in debounce window — return the value we intend to write
      value = pendingRef.current.decoded
    }
  } else if (lastWrittenRef.current && lastWrittenRef.current.encoded === encoded) {
    // URL caught up to our write — use authoritative value
    value = lastWrittenRef.current.decoded
  } else {
    // External change or initial load — decode from URL
    if (cacheRef.current === null || cacheRef.current.encoded !== encoded || cacheRef.current.param !== param) {
      cacheRef.current = { encoded, param, decoded: param.decode(encoded) }
    }
    value = cacheRef.current.decoded
    lastWrittenRef.current = null
  }

  // Create the URL write function
  const writeToUrl = useCallback(
    (newValue: T, newEncoded: string | undefined) => {
      if (typeof window === 'undefined') return

      const currentParams = strategy.parse()

      // Update this parameter (single → multi)
      if (newEncoded === undefined) {
        delete currentParams[key]
      } else {
        currentParams[key] = [newEncoded]
      }

      // Build and update URL
      const url = new URL(window.location.href)
      const newUrl = strategy.buildUrl(url, currentParams)

      const method = push ? 'pushState' : 'replaceState'
      window.history[method]({ ...window.history.state }, '', newUrl)

      // Notify React Router and other libraries that listen to popstate
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [key, push, strategy]
  )

  // Setup/teardown debounced function when debounceMs changes
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(
        (...args: Parameters<typeof writeToUrl>) => {
          writeToUrl(...args)
          pendingRef.current = null
        },
        debounceMs
      )
    } else {
      debouncedWriteRef.current = null
    }
    return () => {
      debouncedWriteRef.current?.cancel()
    }
  }, [debounceMs, writeToUrl])

  // Exposed setter: update causality tracking + write to URL (possibly debounced)
  const setValue = useCallback(
    (newValue: T) => {
      const newEncoded = paramRef.current.encode(newValue)

      // Track what we're writing for causality
      lastWrittenRef.current = { encoded: newEncoded, decoded: newValue }

      // Write to URL (debounced if configured)
      if (debouncedWriteRef.current) {
        pendingRef.current = { decoded: newValue, prevRaw: strategy.getRaw() }
        debouncedWriteRef.current(newValue, newEncoded)
        forceUpdate()
      } else {
        writeToUrl(newValue, newEncoded)
      }
    },
    [writeToUrl, strategy, forceUpdate]
  )

  return [value, setValue]
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
  options: UseUrlStateOptions | boolean = {}
): {
  values: { [K in keyof P]: P[K] extends Param<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>) => void
} {
  // Handle legacy boolean `push` argument for backwards compatibility
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  // Force re-render trigger for debounce
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0)

  // Causality tracking: track what we last wrote per key
  const lastWrittenRef = useRef<Record<string, { encoded: string | undefined; decoded: any }>>({})

  // Pending values during debounce window
  const pendingRef = useRef<{
    values: Record<string, any>
    prevRaw: string
  } | null>(null)

  // Debounced write ref (declared early so render code can reference it)
  const debouncedWriteRef = useRef<ReturnType<typeof debounce<(updates: Record<string, { encoded: string | undefined; decoded: any }>) => void>> | null>(null)

  // Subscribe to URL changes
  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  )

  const raw = strategy.getRaw()

  // Decode all values from URL with causality tracking
  let values: { [K in keyof P]: P[K] extends Param<infer T> ? T : never }
  if (pendingRef.current) {
    if (raw !== pendingRef.current.prevRaw) {
      // URL changed externally during debounce — discard pending
      pendingRef.current = null
      debouncedWriteRef.current?.cancel()
      lastWrittenRef.current = {}
      // Fall through to URL decode
      values = Object.fromEntries(
        Object.entries(params).map(([key, param]) => {
          const encoded = multiToSingle(urlParams[key] ?? [])
          return [key, param.decode(encoded)]
        })
      ) as any
    } else {
      // Still in debounce window — merge pending values with URL-decoded values
      values = Object.fromEntries(
        Object.entries(params).map(([key, param]) => {
          if (key in pendingRef.current!.values) {
            return [key, pendingRef.current!.values[key]]
          }
          const encoded = multiToSingle(urlParams[key] ?? [])
          const lastWritten = lastWrittenRef.current[key]
          if (lastWritten && lastWritten.encoded === encoded) {
            return [key, lastWritten.decoded]
          }
          return [key, param.decode(encoded)]
        })
      ) as any
    }
  } else {
    values = Object.fromEntries(
      Object.entries(params).map(([key, param]) => {
        const encoded = multiToSingle(urlParams[key] ?? [])
        const lastWritten = lastWrittenRef.current[key]

        if (lastWritten && lastWritten.encoded === encoded) {
          return [key, lastWritten.decoded]
        } else {
          const decoded = param.decode(encoded)
          delete lastWrittenRef.current[key]
          return [key, decoded]
        }
      })
    ) as any
  }

  // Create the URL write function
  const writeToUrl = useCallback(
    (updates: Record<string, { encoded: string | undefined; decoded: any }>) => {
      if (typeof window === 'undefined') return

      const currentParams = strategy.parse()

      // Apply all updates
      for (const [key, { encoded }] of Object.entries(updates)) {
        if (encoded === undefined) {
          delete currentParams[key]
        } else {
          currentParams[key] = [encoded]
        }
      }

      // Build and update URL once
      const url = new URL(window.location.href)
      const newUrl = strategy.buildUrl(url, currentParams)

      const method = push ? 'pushState' : 'replaceState'
      window.history[method]({ ...window.history.state }, '', newUrl)

      // Notify React Router and other libraries that listen to popstate
      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [push, strategy]
  )

  // Setup/teardown debounced function when debounceMs changes
  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(
        (...args: Parameters<typeof writeToUrl>) => {
          writeToUrl(...args)
          pendingRef.current = null
        },
        debounceMs
      ) as any
    } else {
      debouncedWriteRef.current = null
    }
    return () => {
      debouncedWriteRef.current?.cancel()
    }
  }, [debounceMs, writeToUrl])

  // Update multiple parameters at once
  const setValues = useCallback(
    (updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>) => {
      const encodedUpdates: Record<string, { encoded: string | undefined; decoded: any }> = {}

      for (const [key, value] of Object.entries(updates)) {
        const param = params[key]
        if (!param) continue

        const encoded = param.encode(value)
        encodedUpdates[key] = { encoded, decoded: value }
        lastWrittenRef.current[key] = { encoded, decoded: value }
      }

      if (debouncedWriteRef.current) {
        const pendingValues = pendingRef.current?.values ?? {}
        for (const [key, value] of Object.entries(updates)) {
          pendingValues[key] = value
        }
        pendingRef.current = { values: pendingValues, prevRaw: strategy.getRaw() }
        debouncedWriteRef.current(encodedUpdates)
        forceUpdate()
      } else {
        writeToUrl(encodedUpdates)
      }
    },
    [params, writeToUrl, strategy, forceUpdate]
  )

  return { values, setValues }
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
  options: UseUrlStateOptions | boolean = {}
): [T, (value: T) => void] {
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  const paramRef = useRef(param)
  paramRef.current = param

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0)

  const lastWrittenRef = useRef<{
    encoded: MultiEncoded
    decoded: T
  } | null>(null)

  const pendingRef = useRef<{
    decoded: T
    prevRaw: string
  } | null>(null)

  const debouncedWriteRef = useRef<ReturnType<typeof debounce<(encoded: MultiEncoded) => void>> | null>(null)

  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  )

  const encoded = urlParams[key] ?? []
  const raw = strategy.getRaw()

  let value: T
  if (pendingRef.current) {
    if (raw !== pendingRef.current.prevRaw) {
      pendingRef.current = null
      debouncedWriteRef.current?.cancel()
      value = param.decode(encoded)
      lastWrittenRef.current = null
    } else {
      value = pendingRef.current.decoded
    }
  } else if (lastWrittenRef.current && arraysEqual(lastWrittenRef.current.encoded, encoded)) {
    value = lastWrittenRef.current.decoded
  } else {
    value = param.decode(encoded)
    lastWrittenRef.current = null
  }

  const writeToUrl = useCallback(
    (newEncoded: MultiEncoded) => {
      if (typeof window === 'undefined') return

      const currentParams = strategy.parse()

      if (newEncoded.length === 0) {
        delete currentParams[key]
      } else {
        currentParams[key] = newEncoded
      }

      const url = new URL(window.location.href)
      const newUrl = strategy.buildUrl(url, currentParams)

      const method = push ? 'pushState' : 'replaceState'
      window.history[method]({ ...window.history.state }, '', newUrl)

      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [key, push, strategy]
  )

  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(
        (...args: Parameters<typeof writeToUrl>) => {
          writeToUrl(...args)
          pendingRef.current = null
        },
        debounceMs
      ) as any
    } else {
      debouncedWriteRef.current = null
    }
    return () => {
      debouncedWriteRef.current?.cancel()
    }
  }, [debounceMs, writeToUrl])

  const setValue = useCallback(
    (newValue: T) => {
      const newEncoded = paramRef.current.encode(newValue)

      lastWrittenRef.current = { encoded: newEncoded, decoded: newValue }

      if (debouncedWriteRef.current) {
        pendingRef.current = { decoded: newValue, prevRaw: strategy.getRaw() }
        debouncedWriteRef.current(newEncoded)
        forceUpdate()
      } else {
        writeToUrl(newEncoded)
      }
    },
    [writeToUrl, strategy, forceUpdate]
  )

  return [value, setValue]
}

/** Helper to compare arrays for equality */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
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
  options: UseUrlStateOptions | boolean = {}
): {
  values: { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>) => void
} {
  const opts: UseUrlStateOptions = typeof options === 'boolean'
    ? { push: options }
    : options
  const { debounce: debounceMs = 0, push = false } = opts

  const strategy = getDefaultStrategy()

  const [, forceUpdate] = useReducer((c: number) => c + 1, 0)

  const lastWrittenRef = useRef<Record<string, { encoded: MultiEncoded; decoded: any }>>({})

  const pendingRef = useRef<{
    values: Record<string, any>
    prevRaw: string
  } | null>(null)

  const debouncedWriteRef = useRef<ReturnType<typeof debounce<(updates: Record<string, MultiEncoded>) => void>> | null>(null)

  const urlParams = useSyncExternalStore(
    (cb) => strategy.subscribe(cb),
    () => getSnapshot(strategy),
    getServerSnapshot
  )

  const raw = strategy.getRaw()

  let values: { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }
  if (pendingRef.current) {
    if (raw !== pendingRef.current.prevRaw) {
      pendingRef.current = null
      debouncedWriteRef.current?.cancel()
      lastWrittenRef.current = {}
      values = Object.fromEntries(
        Object.entries(params).map(([key, param]) => {
          return [key, param.decode(urlParams[key] ?? [])]
        })
      ) as any
    } else {
      values = Object.fromEntries(
        Object.entries(params).map(([key, param]) => {
          if (key in pendingRef.current!.values) {
            return [key, pendingRef.current!.values[key]]
          }
          const encoded = urlParams[key] ?? []
          const lastWritten = lastWrittenRef.current[key]
          if (lastWritten && arraysEqual(lastWritten.encoded, encoded)) {
            return [key, lastWritten.decoded]
          }
          return [key, param.decode(encoded)]
        })
      ) as any
    }
  } else {
    values = Object.fromEntries(
      Object.entries(params).map(([key, param]) => {
        const encoded = urlParams[key] ?? []
        const lastWritten = lastWrittenRef.current[key]

        if (lastWritten && arraysEqual(lastWritten.encoded, encoded)) {
          return [key, lastWritten.decoded]
        } else {
          const decoded = param.decode(encoded)
          delete lastWrittenRef.current[key]
          return [key, decoded]
        }
      })
    ) as any
  }

  const writeToUrl = useCallback(
    (updates: Record<string, MultiEncoded>) => {
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

      const method = push ? 'pushState' : 'replaceState'
      window.history[method]({ ...window.history.state }, '', newUrl)

      window.dispatchEvent(new PopStateEvent('popstate'))
    },
    [push, strategy]
  )

  useEffect(() => {
    if (debounceMs > 0) {
      debouncedWriteRef.current = debounce(
        (...args: Parameters<typeof writeToUrl>) => {
          writeToUrl(...args)
          pendingRef.current = null
        },
        debounceMs
      ) as any
    } else {
      debouncedWriteRef.current = null
    }
    return () => {
      debouncedWriteRef.current?.cancel()
    }
  }, [debounceMs, writeToUrl])

  const setValues = useCallback(
    (updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>) => {
      const encodedUpdates: Record<string, MultiEncoded> = {}

      for (const [key, value] of Object.entries(updates)) {
        const param = params[key]
        if (!param) continue

        const encoded = param.encode(value)
        encodedUpdates[key] = encoded
        lastWrittenRef.current[key] = { encoded, decoded: value }
      }

      if (debouncedWriteRef.current) {
        const pendingValues = pendingRef.current?.values ?? {}
        for (const [key, value] of Object.entries(updates)) {
          pendingValues[key] = value
        }
        pendingRef.current = { values: pendingValues, prevRaw: strategy.getRaw() }
        debouncedWriteRef.current(encodedUpdates)
        forceUpdate()
      } else {
        writeToUrl(encodedUpdates)
      }
    },
    [params, writeToUrl, strategy, forceUpdate]
  )

  return { values, setValues }
}
