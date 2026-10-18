/**
 * `use-prms/core` — the framework-free surface.
 *
 * Everything here is pure (no React, no Vue): the value ↔ URL codecs, the
 * location strategies, multi-value parsing, the reflection registry, URL
 * diagnostics, and the `UrlStateStore` that the React and Vue bindings are
 * both built on. A Cloudflare Worker (or any non-DOM consumer) can import
 * from here to parse / canonicalize a URL's params without pulling in a UI
 * framework.
 *
 * The React entry (`use-prms`) and `use-prms/vue` both re-export this.
 */

// Fundamental value ↔ URL types.
export type { Encoded, Param } from './types.js'

// Multi-value operations + location strategies.
export type { MultiEncoded, LocationStrategy } from './strategies.js'
export {
  parseMultiParams,
  serializeMultiParams,
  queryStrategy,
  hashStrategy,
  getDefaultStrategy,
  setDefaultStrategy,
  notifyLocationChange,
  clearParams,
} from './strategies.js'

// Codecs and param helpers.
export * from './params.js'
export * from './multiParams.js'
export * from './flagPack.js'
export * from './alphabet.js'
export * from './binary.js'
export * from './dates.js'
export * from './float.js'
export * from './numberTuple.js'
export * from './tagFilter.js'

// Diagnostics + reflection registry (pure).
export * from './diagnostics.js'
export * from './registry.js'

/**
 * Serialize single-value query parameters to a URL query string.
 * Uses URLSearchParams for proper form-urlencoded format (space → +).
 * Handles valueless params (empty string → ?key without =) manually.
 *
 * @deprecated For multi-value support, use serializeMultiParams instead
 */
export function serializeParams(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      // Skip undefined values
      continue
    } else if (value === '') {
      // Valueless param: ?key without =
      // URLSearchParams doesn't support this, so we'll handle manually
      continue
    } else {
      searchParams.set(key, value)
    }
  }

  let result = searchParams.toString()

  // Handle valueless params manually
  const valuelessKeys = Object.entries(params)
    .filter(([_, value]) => value === '')
    .map(([key, _]) => encodeURIComponent(key))

  if (valuelessKeys.length > 0) {
    const valuelessPart = valuelessKeys.join('&')
    result = result ? `${result}&${valuelessPart}` : valuelessPart
  }

  return result
}

/**
 * Parse query parameters from a URL string or URLSearchParams.
 * Note: URLSearchParams treats ?z and ?z= identically (both as empty string).
 * Note: For repeated params, only the first value is returned.
 *
 * @deprecated For multi-value support, use parseMultiParams instead
 */
export function parseParams(source: string | URLSearchParams): Record<string, string | undefined> {
  const searchParams = typeof source === 'string'
    ? new URLSearchParams(source)
    : source

  const result: Record<string, string | undefined> = {}

  for (const [key, value] of searchParams.entries()) {
    // Only take first value for each key (backward compat)
    if (!(key in result)) {
      result[key] = value
    }
  }

  return result
}

/**
 * Get current URL query parameters (browser only).
 */
export function getCurrentParams(): Record<string, string | undefined> {
  if (typeof window === 'undefined') return {}
  return parseParams(window.location.search)
}

/**
 * Update the URL without reloading (browser only).
 * @param params - New query parameters
 * @param push - Use pushState (true) or replaceState (false)
 */
export function updateUrl(params: Record<string, string | undefined>, push = false): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const search = serializeParams(params)
  url.search = search

  const method = push ? 'pushState' : 'replaceState'
  window.history[method]({ ...window.history.state }, '', url.toString())

  // Notify React Router and other libraries that listen to popstate
  window.dispatchEvent(new PopStateEvent('popstate'))
}
