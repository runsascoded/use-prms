/**
 * `use-prms` — the React entry.
 *
 * Re-exports the entire framework-free `use-prms/core` surface (codecs,
 * strategies, diagnostics, reflection registry, the `UrlStateStore`), then
 * adds the React bindings (`useUrlState` & friends, `useUrlAlias`, the
 * `useParamReflection` hooks). Vue consumers import `use-prms/vue` instead;
 * both bindings produce byte-identical URLs for identical state.
 */

// The framework-free core (types, strategies, codecs, diagnostics, registry,
// store, and the deprecated single-value helpers).
export * from './core.js'

// React bindings.
export * from './useUrlState.js'
export * from './useUrlAlias.js'
export * from './reflection.js'
