# `use-prms/core` + `use-prms/vue`: framework-agnostic URL state, thin Vue bindings

**Status**: done (2026-10-18). Implemented across 5 commits; see [Implementation notes](#implementation-notes). Proposed 2026-10-17, from the disky deep-dive deck, a Slidev (Vue) deck. It mirrors use-kbd's [framework-agnostic-core spec][use-kbd spec]; same pattern, same reasons.

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

## Implementation notes <a id="implementation-notes"></a>

Shipped in 5 commits: core subpath split, the `UrlBinding` engine, `use-prms/vue`, the site parity demo + e2e, and README. Where the final shape differs from the proposal:

- **Layout is flat, not a `src/core/**` directory.** `core.ts` (location strategies + history patch) was renamed `strategies.ts`, and a new `core.ts` became the `use-prms/core` barrel; `Encoded`/`Param` moved to a `types.ts` leaf to break cycles. The ESLint guard (`eslint.config.js`, `no-restricted-imports`) **default-bans** `react` and `vue` across all of `src/**` and all-lists only the adapter files (`useUrlState.ts`, `useUrlAlias.ts`, `reflection.ts`, `sections/spy.tsx`, `vue.ts`) + tests — so a *new* core file is guarded automatically, without a physical dir. `eslint-plugin-react-hooks` is registered so the existing intentional disable directives resolve.
- **The store is `UrlBinding`, a per-*instance* engine** (not a store keyed globally per URL-key). It holds the causality (`lastWritten`), debounce `pending` with the **per-key** discard check (the section-spy fix), and decode memoization (stable references). It works entirely in the `MultiEncoded` domain, so one implementation covers single-/multi-value and single-/multi-key; single-value `Param`s are adapted with `toMultiCodec`. An adapter supplies an `onChange` callback and drives re-reads its own way (React `useSyncExternalStore` + force-update; Vue `customRef` trigger). Per-instance state preserves the React hooks' exact prior semantics. `read`/`write` are the methods; snapshot + URL write are the free functions `getUrlSnapshot` / `writeParams`.
- **React hooks are thin `useUrlBinding` adapters;** reflection registration + diagnostics (`classifyParam`/`inspectUrl`/`cleanUrl`) stay in the React layer. Public API unchanged (all prior tests green).
- **Vue API:** `useUrlState`/`useMultiUrlState` → a writable `Ref`; `useUrlStates`/`useMultiUrlStates` → `{ values, setValues }` where `values` is a `reactive` object (two-way per key, v-model-able) and `setValues` batches into one history entry. This is the closest idiomatic Vue shape to the React API; "returns a reactive object" (the proposal's wording) is satisfied by `values`. `use-prms/vue` re-exports the `use-prms/core` surface so codecs + composables import from one place. `vue` is an optional peer dep.
- **Tests:** the "shared suite against core" is `src/store.test.ts` (11 tests, no framework) pinning the engine; `src/vue.test.ts` (6, driven by `effectScope` — no `@vue/test-utils` or SFC compiler needed) covers the Vue adapter; `site/e2e/parity.spec.ts` (5) asserts React and Vue produce byte-equal URLs, a debounced write isn't dropped, and batched writes land. Real Vue component mounting is exercised by that e2e, not unit tests.
- **Demo:** a standalone Vue page (`site/vue.html` → `src/vue-demo/ParityDemo.vue`, a second Vite entry) rather than a React-mounted island, next to a React parity route (`/parity`). Cleaner isolation, no interop.

**Deferred (not blocking):**

- `use-prms/vue` **sections** (`useSectionSpy` for Vue) — waits on a `sections/` core/adapter split; `nav.ts` is already pure.
- Reflection-registry registration from the Vue composables (React-only for now; `registry.ts` itself is framework-free, so it's additive later).
- The **Slidev example slide** with a `?m=` toggle — it lives in the fork's demo deck repo (`~/c/slidev` / the deep-dive deck), not here; handed off there.

[use-kbd spec]: ../../../use-kbd/specs/framework-agnostic-core.md
[dynamic-og]: ../../../../slidev/specs/dynamic-og.md
