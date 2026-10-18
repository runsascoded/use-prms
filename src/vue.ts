/**
 * `use-prms/vue` — Vue 3 bindings for URL-parameter state.
 *
 * Thin adapters over the same framework-free `UrlBinding` the React hooks use
 * (see `store.ts`), so a React app and a Vue app produce byte-identical query
 * strings for identical state. Each composable owns a binding for the calling
 * component's lifetime, subscribes to URL changes, and tears both down via
 * `onScopeDispose`.
 *
 * - `useUrlState` / `useMultiUrlState` return a writable `Ref` (v-model-able).
 * - `useUrlStates` / `useMultiUrlStates` return `{ values, setValues }`, where
 *   `values` is a `reactive` object (so `v-model="values.zoom"` works) and
 *   `setValues` writes several keys in one history entry.
 */

import { customRef, onScopeDispose, reactive, type Ref } from 'vue'
import type { Param } from './types.js'
import { getDefaultStrategy } from './strategies.js'
import type { MultiParam } from './multiParams.js'
import {
  UrlBinding,
  getUrlSnapshot,
  toMultiCodec,
  type MultiCodec,
} from './store.js'

// Re-export the framework-free surface so a Vue app can import the codecs and
// strategies from the same place as the composables
// (`import { useUrlState, boolParam } from 'use-prms/vue'`).
export * from './core.js'

/** Options shared by all Vue URL-state composables. */
export interface UseUrlStateOptions {
  /** Debounce URL writes in milliseconds (state updates immediately). */
  debounce?: number
  /** Use `pushState` (true) or `replaceState` (false, default). */
  push?: boolean
}

function normalizeOptions(options: UseUrlStateOptions | boolean): UseUrlStateOptions {
  return typeof options === 'boolean' ? { push: options } : options
}

/**
 * Create a binding over `codecs` and wire it to Vue reactivity for the
 * current component scope. Returns a factory that produces a writable `Ref`
 * for one key, plus the shared `binding` (for batched writes).
 */
function setupBinding(codecs: Record<string, MultiCodec<unknown>>, options: UseUrlStateOptions) {
  const strategy = getDefaultStrategy()
  const triggers = new Set<() => void>()
  const fire = () => { for (const trigger of triggers) trigger() }

  const binding = new UrlBinding(strategy, fire)
  binding.setCodecs(codecs)
  binding.setPush(options.push ?? false)
  binding.setDebounce(options.debounce ?? 0)

  // Hold the URL subscription for the component's lifetime.
  const unsubscribe = strategy.subscribe(fire)
  onScopeDispose(() => {
    unsubscribe()
    binding.dispose()
  })

  const refFor = <T>(key: string): Ref<T> => customRef<T>((track, trigger) => {
    triggers.add(trigger)
    return {
      get() {
        track()
        return binding.read(getUrlSnapshot(strategy))[key] as T
      },
      set(value: T) {
        binding.write({ [key]: value })
      },
    }
  })

  return { binding, refFor }
}

/**
 * Manage a single URL query parameter as a writable `Ref`.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useUrlState, boolParam } from 'use-prms/vue'
 * const zoom = useUrlState('z', boolParam)
 * </script>
 * <template><input type="checkbox" v-model="zoom" /></template>
 * ```
 */
export function useUrlState<T>(
  key: string,
  param: Param<T>,
  options: UseUrlStateOptions | boolean = {},
): Ref<T> {
  const { refFor } = setupBinding({ [key]: toMultiCodec(param) as MultiCodec<unknown> }, normalizeOptions(options))
  return refFor<T>(key)
}

/**
 * Manage a single multi-value URL parameter (repeated `?tag=a&tag=b`) as a
 * writable `Ref`.
 */
export function useMultiUrlState<T>(
  key: string,
  param: MultiParam<T>,
  options: UseUrlStateOptions | boolean = {},
): Ref<T> {
  const { refFor } = setupBinding({ [key]: param as MultiCodec<unknown> }, normalizeOptions(options))
  return refFor<T>(key)
}

/**
 * Manage several single-value URL parameters together. Returns `values` (a
 * `reactive` object, two-way per key) and `setValues` (batched into one
 * history entry).
 */
export function useUrlStates<P extends Record<string, Param<any>>>(
  params: P,
  options: UseUrlStateOptions | boolean = {},
): {
  values: { [K in keyof P]: P[K] extends Param<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>) => void
} {
  const codecs = Object.fromEntries(
    Object.entries(params).map(([key, param]) => [key, toMultiCodec(param)]),
  ) as Record<string, MultiCodec<unknown>>
  const { binding, refFor } = setupBinding(codecs, normalizeOptions(options))

  const values = reactive(
    Object.fromEntries(Object.keys(params).map(key => [key, refFor(key)])),
  ) as { [K in keyof P]: P[K] extends Param<infer T> ? T : never }

  const setValues = (
    updates: Partial<{ [K in keyof P]: P[K] extends Param<infer T> ? T : never }>,
  ) => binding.write(updates as Record<string, unknown>)

  return { values, setValues }
}

/**
 * Manage several multi-value URL parameters together. Returns `values` (a
 * `reactive` object, two-way per key) and `setValues` (batched).
 */
export function useMultiUrlStates<P extends Record<string, MultiParam<any>>>(
  params: P,
  options: UseUrlStateOptions | boolean = {},
): {
  values: { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }
  setValues: (updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>) => void
} {
  const codecs = { ...params } as unknown as Record<string, MultiCodec<unknown>>
  const { binding, refFor } = setupBinding(codecs, normalizeOptions(options))

  const values = reactive(
    Object.fromEntries(Object.keys(params).map(key => [key, refFor(key)])),
  ) as { [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }

  const setValues = (
    updates: Partial<{ [K in keyof P]: P[K] extends MultiParam<infer T> ? T : never }>,
  ) => binding.write(updates as Record<string, unknown>)

  return { values, setValues }
}
