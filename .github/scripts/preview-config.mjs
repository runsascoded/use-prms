// Generate an isolated `preview.json` for a per-PR preview deploy, derived
// from the committed `wrangler.jsonc`. Explicit allowlist: a differently-named
// Worker on `*.workers.dev`, the same static assets, and nothing else (no
// custom domain / routes, no bindings — there are none to leak anyway).
//
// Ported from jc-taxes' edge/scripts/preview-config.mjs, simplified for a
// static-assets Worker (no R2/D1/dev-env).
import { readFileSync, writeFileSync } from 'node:fs'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

export function previewConfig(base, number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid PR number')
  return {
    name: `use-prms-pr-${number}`,
    compatibility_date: base.compatibility_date,
    account_id: base.account_id,
    workers_dev: true,
    assets: base.assets,
    observability: base.observability,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', readFileSync('wrangler.jsonc', 'utf8'))
  if (parsed.error) throw new Error('Invalid Wrangler configuration')
  writeFileSync('preview.json', JSON.stringify(previewConfig(parsed.config, Number(process.env.PR_NUMBER)), null, 2) + '\n')
}
