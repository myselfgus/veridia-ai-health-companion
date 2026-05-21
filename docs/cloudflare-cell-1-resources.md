# Veridia Cell 1 Cloudflare Resources

The default `wrangler.jsonc` is intentionally deployable on the current account before R2 is enabled. The Cell 1 runtime detects Cloudflare bindings when they exist and falls back gracefully when they do not.

The complete binding map, including R2 and Analytics Engine, lives in `wrangler.cell-full.jsonc`. Use it after the Cloudflare account has R2 and Analytics Engine enabled.

## Created resources

These resources were created in the `VOITHER` account (`1a481f7cdb7027c30174a692c89cbda1`) on 2026-05-21:

| Resource | Name | ID / status |
| --- | --- | --- |
| D1 | `veridia-cell-1` | `1b35898d-e97c-470f-b820-808656c0397e` |
| Queue | `veridia-document-jobs` | `5c4bc625ef564e68948667588b4e7e32` |
| Queue DLQ | `veridia-document-dlq` | `4d3a4c2770114afb823b019d06128eb3` |
| Vectorize | `veridia-cell-1` | 768 dimensions, cosine |

The D1 migration `0001_veridia_cell_1.sql` has been applied remotely.

## Current deployment

The deploy without R2/Analytics Engine succeeded:

```text
Worker: https://veridia-ai.voither.workers.dev
Version ID: 28d28f72-7401-4d5f-85c8-ec7d3f6009fd
Queue producer/consumer: veridia-document-jobs
Workflow: veridia-document-processing
```

Remote smoke confirmed `VERIDIA_DB`, `DOCUMENT_QUEUE`, `DOCUMENT_WORKFLOW`, `VECTORIZE`, `BROWSER`, `IMAGES`, `AI` and `PATIENT_RATE_LIMIT` bindings are available. `HEALTH_VAULT` and `ANALYTICS` remain unavailable until the account gates are enabled.

## Why the first full deploy failed

Cloudflare returned:

```text
Please enable R2 through the Cloudflare Dashboard. [code: 10042]
```

That is an account/product gate, not a TypeScript or Worker code error. Wrangler cannot deploy an R2 bucket binding until R2 is enabled for the account.

## Required resources for the full Cell with R2

R2 is still blocked by the Cloudflare account gate:

```text
Please enable R2 through the Cloudflare Dashboard. [code: 10042]
```

Analytics Engine is also blocked by the account gate:

```text
You need to enable Analytics Engine. [code: 10089]
```

After R2 is enabled in the Dashboard, create the bucket:

```bash
npx wrangler r2 bucket create veridia-health-vault
```

Then configure secrets:

```bash
npx wrangler secret put CF_AI_API_KEY
```

R2 must be enabled in the Cloudflare Dashboard before `r2 bucket create` or any deploy with `HEALTH_VAULT` can succeed.

## Full binding activation

After R2 and Analytics Engine are enabled, copy the full config into the active config:

```bash
cp wrangler.cell-full.jsonc wrangler.jsonc
npm run build
npx wrangler deploy
```

If Cloudflare Workers Builds is connected to `main`, commit that config switch only after the Cloudflare account resources are ready.

## Current deploy mode

The current `wrangler.jsonc` deploys the app shell, Durable Objects, D1, Queues, Workflow, Workers AI, Browser, Images, Vectorize and Rate Limit. R2 and Analytics Engine are intentionally omitted until the account enables them. Vault upload routes remain functional, but file payload storage is degraded to metadata/fallback mode without `HEALTH_VAULT`.
