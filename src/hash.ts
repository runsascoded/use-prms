/**
 * Hash params entry point
 *
 * This module sets the default location strategy to hash (window.location.hash)
 * and re-exports everything from the main module.
 *
 * Usage:
 * ```typescript
 * // Instead of:
 * import { useUrlParam, stringParam } from 'use-prms'
 *
 * // Use:
 * import { useUrlParam, stringParam } from 'use-prms/hash'
 *
 * // Same API, but reads/writes to URL hash instead of query string
 * // e.g., #name=foo instead of ?name=foo
 * ```
 */

import { setDefaultStrategy, hashStrategy } from './core.js'

// Set hash as the default strategy for this entry point
setDefaultStrategy(hashStrategy)

// Re-export everything from main module
export * from './index.js'
