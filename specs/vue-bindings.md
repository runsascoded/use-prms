# `use-prms/core` + `use-prms/vue`: framework-agnostic URL state, thin Vue bindings

**Status**: proposed (2026-10-17), from the disky deep-dive deck, a Slidev (Vue) deck. It mirrors use-kbd's [framework-agnostic-core spec][use-kbd spec]; same pattern, same reasons.

## Why

- **Slidev decks want URL state per slide.** The deck's harmony slide has mode toggles (bubbles / heatmap / ±) that should live in `?m=…`, so a shared link reopens in that state. The fork's planned dynamic OG cards ([slidev `specs/dynamic-og.md`][dynamic-og]) render a card per URL, which needs the same param codecs on the Worker side to canonicalize URLs.
- **Today use-prms is React-only at its surface.** That's no longer a fit for Vue apps, or for Workers that only need the codecs.

## Current state

- **Already pure** (no React import): `core.ts` (location strategies, the `replaceState`/`pushState` patch, `use-prms:locationchange`, silent writers), `params.ts` and every codec module (`binary`, `float`, `dates`, `flagPack`, `numberTuple`, `tagFilter`, `alphabet`, `multiParams`), `registry.ts`, `diagnostics.ts`, `hash.ts`, and the pure half of `sections/` (`nav.ts`).
- **React-bound**: `useUrlState.ts` (`useUrlState` / `useUrlStates` / `useMultiUrlState`, via `useSyncExternalStore` + per-hook debounce), `useUrlAlias.ts`, `reflection.ts`, and `sections/spy.tsx`.

## Proposal

Single package, subpath exports:

- **`use-prms/core`**: everything already pure, plus a framework-free `UrlStateStore`:
  - `subscribe(cb)` / `getSnapshot()` over the current strategy;
  - `read(key, param)` / `write(key, param, value, { debounce, mode: 'replace' | 'push' })`;
  - the per-key debounce with the per-key pending check (the fix from `section-spy.md`);
  - the reflection classifier (canonical / stale / malformed) as a function.
  
  Enforce "no React import" with an ESLint `no-restricted-imports` rule on the core files.
- **`use-prms`** (React): unchanged API, reimplemented on `UrlStateStore` via `useSyncExternalStore`.
- **`use-prms/vue`**:
  - `useUrlState(key, param, opts)` returns a writable `Ref` (a `customRef`, or `shallowRef` + `watch` writing back);
  - `useUrlStates({…})` returns a reactive object;
  - the store subscription is held for the component's lifetime (`onScopeDispose`).
  
  Same codecs, same URLs; a React app and a Vue app produce identical query strings for identical state.
- **`use-prms/vue` sections** (later): `useSectionSpy` / `useSectionInView` once `sections/` has its own core/adapter split. `nav.ts` is already pure.
- **Workers**: `use-prms/core` alone canonicalizes a URL's params (parse → drop defaults → re-encode → sort). That's what a dOGI Worker needs for stable card cache keys.

## Tests

- **Shared suite**: one codec/round-trip suite runs against core; the React and Vue adapter suites assert the same URL ↔ state tables (port `useUrlState.test.tsx` cases to `@vue/test-utils`).
- **Playwright e2e** on two demo pages, React and Vue: equal inputs produce byte-equal URLs; back/forward restores state; debounce doesn't drop values under concurrent writes.
- **Public demo**: a Vue page on use-prms' site next to the React one, plus a small Slidev example slide (in the fork's demo deck) with a toggle in `?m=`.

[use-kbd spec]: ../../use-kbd/specs/framework-agnostic-core.md
[dynamic-og]: ../../../slidev/specs/dynamic-og.md
