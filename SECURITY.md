# Security

Leash is a hackathon project that talks to the PayPal **sandbox** only; the client refuses any non-sandbox URL.

- Report problems by opening a GitHub issue (no secrets in it). Credential leaks: rotate first, then report.
- Never commit `.env`, `.seed/`, sandbox passwords or card numbers. `.gitignore` covers them; run a secret scan before pushing.
- Scope and honest limits: [docs/Architecture/THREAT_MODEL.md](docs/Architecture/THREAT_MODEL.md). Leash is not a boundary against someone who controls the host, and the ledger is tamper-evident against partial edits only.

## Audit notes (2026-10-11, manual code-scope review run under gstack /cso, static only)

Three issues found and fixed, each with a regression test (`tests/security.test.ts`):

1. `POST /v1/refund` was unauthenticated. With PayPal sandbox credentials present it can move sandbox money (bounded by the mandate), so it now needs the `LEASH_TOKEN` bearer and is disabled (503) if no token is set. Simulated mode (no credentials) is unchanged.
2. `trust proxy` was hardcoded, so a client could spoof `X-Forwarded-For` and evade the per-IP rate limits (including the Gemini-backed `/v1/author/compile`). It is now off unless `LEASH_TRUST_PROXY` is set.
3. `GET /v1/ledger` served `payload_json` (capture ids, item names) unauthenticated; it no longer does.

Limits of this audit: code scope only, no runtime reproduction (the helper does not support native Windows Docker), no dependency or CI scope, and the helper's own run record is marked "not assessed" because its submission schema rejected the findings after one correction. Treat this as a developer review, not a third-party audit.
