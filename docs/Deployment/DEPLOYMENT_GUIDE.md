# Deployment

Leash can run locally without credentials in fully simulated mode, or with PayPal sandbox credentials in live-fire mode. Production PayPal endpoints are intentionally unsupported.

## Prerequisites

- Node.js 22.18 or newer; `.nvmrc` pins Node 24.
- npm and a platform supported by `better-sqlite3` or Node’s built-in SQLite.
- Optional PayPal sandbox application credentials.
- Optional Gemini API key for live policy drafts and approval summaries.

## Local simulated deployment

```bash
npm ci
npm run web:build
npm run start
```

The server defaults to `http://127.0.0.1:4317` and tries the next ten ports if that port is busy. `npm run demo` combines the build and start steps. With no PayPal credentials, the gate and UI are real but the final refund operation is simulated.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | Initial HTTP port |
| `LEASH_PUBLIC_URL` | bound loopback URL | Base URL embedded in approval links |
| `LEASH_DB` | `leash.db` | SQLite path |
| `LEASH_DB_DRIVER` | auto | `better-sqlite3` or `node:sqlite` |
| `LEASH_MANDATE` | `mandate.json` | Active mandate path |
| `LEASH_TOKEN` | unset | Bearer token for hooks and live refund API |
| `LEASH_TRUST_PROXY` | unset | Numeric trusted proxy-hop count |
| `LEASH_LOCK_OPERATOR_ENDPOINTS` | unset | Set to `1` to protect ledger and exposure endpoints |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | unset | Enables PayPal sandbox access |
| `PAYPAL_BASE_URL` | sandbox API host | Must contain `sandbox` |
| `GEMINI_API_KEY` | unset | Enables live compiler and summaries |
| `GEMINI_MODEL` | discovered | Optional explicit Gemini model |
| `LEASH_EXPOSE_AMOUNT_TOOL` | unset | Set to `1` to expose weaker MCP amount refunds |
| `LEASH_LEDGER_KEY` | unset | Key material for an external ledger seal workflow |

Use a secret manager or process launcher for credentials. Do not put PayPal secrets in agent-readable MCP settings, commit `.env`, or expose a live sandbox refund endpoint without `LEASH_TOKEN`.

## PayPal sandbox preparation

`node scripts/seed.mjs` attempts to create captured sandbox orders with a test card. If that flow is unavailable, `node scripts/seed-wallet.mjs` creates approval links for a sandbox personal account. Both write capture metadata to the ignored `.seed/captures.json`; `node scripts/seed-db.mjs` imports those captures and known demo items into SQLite without making PayPal calls.

Use `scripts/gate2-live.mjs <capture-id> <order-id>` for a deliberately scoped end-to-end sandbox check. It creates a temporary database, performs an $18 item refund, independently reads the refund from PayPal, checks full-order escalation, and removes the temporary database.

## Render blueprint

The included `render.yaml` defines one Node web service:

- `npm ci --include=dev && npm run web:build`
- `node --disable-warning=ExperimentalWarning server/index.ts`
- health check at `/health`
- Node 24, trusted proxy hop count 1, and SQLite at `/tmp/leash.db`

Set `LEASH_PUBLIC_URL`, `LEASH_TOKEN`, and optional Gemini and PayPal sandbox secrets in Render. For a public non-demo deployment, also set `LEASH_LOCK_OPERATOR_ENDPOINTS=1`.

Important: the blueprint uses the free plan and ephemeral `/tmp` storage. Ledger history resets on redeploy, and SQLite restricts the service to one instance. The repository includes this deployment definition but the project README does not claim that an instance is currently deployed.

## Release verification

```bash
npm run typecheck
npm test
npm run test:node-sqlite
npm run web:build
```

Then verify `/health`, run all three demo tickets, complete an approval and retry, inspect `/ledger` for a verified chain, and run `npm run doctor` if hooks are part of the deployment.

## Shutdown

`SIGINT` and `SIGTERM` stop the periodic sweep, close the HTTP listener, close SQLite, and force exit after a three-second fallback. Deploy behind a supervisor that sends one of those signals and allows the grace period.
