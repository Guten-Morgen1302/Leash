# Architecture

```
agent ──MCP──> proxy (holds PayPal token) ─┐
agent ──hook──> /v1/check, /v1/result ─────┤
UI/demo ─────> /v1/demo/*, /v1/approve ────┤
                                           v
                    runRefund (server/gate.ts)
   1. readState   live PayPal state (capture time, open dispute), OUTSIDE any transaction
   2. check       ONE BEGIN IMMEDIATE tx: window sum, refundable balance, decide(), reserve, ledger
   3. execute     PayPal refund, OUTSIDE the tx, idempotent (PayPal-Request-Id = action id)
   4. result      record executed / failed (release) / unknown (keep reserved)
```

## Modules (server/)
- `policy.ts`: pure `decide(action, mandate, state)`; no I/O. Rule order: expiry, invalid, unknown txn, currency, over-capture, duplicate, open dispute, return window, hard max, hard daily, approval grant, stale state (escalate), daily cap, action cap, allow. Item rules: unknown items, non-refundable, already refunded, cumulative full-order escalation.
- `dispatch.ts`: `check`, `result`, `approve`, `sweep`, `preventedLoss`. Reservations count toward the window as `reserved`, `executed`, `approved_executed`, `unknown_outcome`. A reservation with no result after 120 s becomes `unknown_outcome` and keeps counting.
- `db.ts`: one `Db` interface over better-sqlite3 and node:sqlite; `tx()` is explicit BEGIN IMMEDIATE and rejects async callbacks and nesting.
- `ledger.ts`, `seal.ts`: SHA-256 hash chain; optional HMAC seal held outside the DB (`LEASH_LEDGER_KEY`). Someone holding both the DB and the key can re-seal.
- `config.ts`: whitelist parser for `mandate.json`; `describeMandate` renders the plain-language page.
- `paypal.ts`: sandbox-only client; single-flight token refresh; secrets scrubbed from errors.
- `proxy.ts`, `proxy-main.ts`: MCP tools. Unmapped PayPal tools do not exist (fail closed by omission).
- `app.ts`, `index.ts`: Express API (bearer token on hook endpoints, 503 if unset in production, per-IP rate limit, 16 kB body limit) and static UI.
- `demo.ts`: always-simulated demo lanes; every run gets a fresh session, order and capture.
- `llm.ts`: optional Gemini summary; model comes from `GEMINI_MODEL` or Google's live model list; 5 s timeout; failure returns null.

## Approval
Approval executes nothing. It re-checks the hard rules against current state and mints a single-use 10-minute grant bound to the args hash (and item list). The approval token travels in the URL fragment, is stored hashed, expires in 15 minutes, and is accepted by POST only. The agent then retries the same call and the grant lets it through once.

## Hooks (hooks/)
`leash-hook.mjs` (PreToolUse, PostToolUse, PostToolUseFailure), `guard.mjs`, `result-parse.mjs`. Claude Code only blocks on exit 2; exit 1, crashes and timeouts fail open, so every error path exits 2. Real recorded events are in `tests/fixtures/`.

## Known limits
See [THREAT-MODEL.md](THREAT-MODEL.md). Single instance only (SQLite). The demo uses fake captures; live runs use `scripts/gate2-live.mjs`.
