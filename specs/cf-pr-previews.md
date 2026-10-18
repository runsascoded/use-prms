# Cloudflare per-PR previews; move the demo off GitHub Pages

**Status**: proposed (2026-10-18). Adopts the per-PR preview pattern [`jc-taxes`][jct] set up (`.github/workflows/preview.yml` + `preview-gate.cjs` + `preview-config.mjs`), adapted from a Worker app to use-prms' static Vite demo.

## Why

The demo deploys only from `main` (GitHub Pages), so there's nothing to test a branch against — the gap that surfaced wanting to ship `use-prms/core` + `use-prms/vue` for downstream (disky) to try before it lands. A per-PR preview gives every PR a throwaway URL; prod moves to a Cloudflare Worker (static assets) so prod and previews share one hosting story.

## Decisions (2026-10-18)

- **Prod moves to CF.** `prms.rbw.sh` is served by a CF Worker (Static Assets), not GitHub Pages. The GH Pages deploy is retired.
- **wrangler + a secret, no Pulumi.** use-prms has no R2/D1/queues — just a static-assets Worker — so `wrangler.jsonc` committed + `CLOUDFLARE_API_TOKEN` is enough.
- **Mirror jc-taxes' hardened gate.** `pull_request_target` + a `/preview` comment (or `workflow_dispatch`), write-collaborator-only, SHA-pinned; build runs without CF creds, deploy runs from trusted `main`.
- npm release stays tag-gated (`v*`), unaffected.

## Hosting

A static-assets Worker (no `main` script):

```jsonc
// wrangler.jsonc
{
  "name": "use-prms",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./docs",
    "not_found_handling": "single-page-application"
  },
  "observability": { "enabled": true }
}
```

- `single-page-application` returns `index.html` for unmatched paths — so react-router routes (`/`, `/hash`, `/parity`) work — while real files (`/vue.html`, `/assets/*`) are served directly.
- `account_id` is **not** committed; CI supplies `CLOUDFLARE_ACCOUNT_ID`. Prod binds `prms.rbw.sh` as a custom domain (set once in the CF dashboard, or add a `routes` entry once the zone is on CF).
- The old GH-Pages shims (`CNAME`, `404.html`) are dropped; CF handles the domain + SPA fallback.

## Workflows

- **`ci.yml`** — drop the `deploy` (Pages) job + the Setup-Pages / Upload-Pages-artifact / CNAME / 404.html steps. Add a prod **Worker deploy** job (main only): `pnpm build` (lib) → `pnpm -C site build` (→ `docs/`) → `wrangler deploy`. Keep `build-dist` and `release`.
- **`preview.yml`** (new, ported from jc-taxes):
  - **gate** — checkout trusted `main`, run `.github/scripts/preview-gate.cjs` (repo-agnostic: write-collaborator check, open non-draft PR → `main`, optional SHA pin, `/preview` comment or dispatch). Unit-tested via `node --test`.
  - **build** — checkout the approved SHA, `pnpm build` + `pnpm test` (lib) + `pnpm -C site build`, upload `docs/` as an artifact. **No CF creds in this job.**
  - **deploy** — checkout trusted `main`, download the artifact into `./docs`, generate `preview.json` via `scripts/preview-config.mjs` (`name: use-prms-pr-<n>`, `workers_dev: true`, same `assets`/`compatibility_date`/`observability`, nothing else), `wrangler deploy --config preview.json`, capture the printed `*.workers.dev` URL, and comment it on the PR.

## Manual prerequisites (owner)

1. A Cloudflare account; create an API token (Workers Scripts: Edit) → add repo secret `CLOUDFLARE_API_TOKEN`.
2. Add repo variable/secret `CLOUDFLARE_ACCOUNT_ID`.
3. Point `prms.rbw.sh` at the `use-prms` Worker (CF custom domain) once, replacing the GH Pages CNAME. Disable the GH Pages site.

Until (1)–(2) exist, CI config is in place but the deploy/preview jobs can't run; everything else (lib, tests, e2e, `build-dist`, release) is unaffected.

## Done when

- Pushing `main` deploys the Worker to `prms.rbw.sh`; GH Pages is retired.
- A `/preview` comment on a PR (by a write collaborator) deploys `use-prms-pr-<n>.<subdomain>.workers.dev` and comments the URL; prod is untouched.
- The gate script's `node --test` suite passes in CI.
- `specs/cf-pr-previews.md` updated to final state and moved to `specs/done/`.

[jct]: ../../../jc-taxes/.github/workflows/preview.yml
