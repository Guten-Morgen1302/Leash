# Operations

This runbook covers routine startup, verification, agent integration, audit checks, and recovery. Leash is sandbox-only and single-instance.

## Daily startup

1. Confirm the active `mandate.json` and its expiry.
2. Start with `npm run demo` for a fresh UI build, or `npm run start` when `web/dist` is already current.
3. Check `GET /health` and confirm the displayed mode.
4. If using Claude Code hooks, run `npm run doctor`; do not rely on the hook until every check passes.
5. Open `/ledger` and confirm the chain verifies.

## Integration choices

Prefer the MCP proxy when credential custody matters. Launch `server/proxy-main.ts` as a stdio MCP server from an environment the agent cannot inspect. Do not install a second PayPal MCP server carrying the same credentials.

Use hooks when an existing PayPal MCP tool must be gated. Generate the configuration with `npm run hooks:print`, merge it into Claude Code settings using absolute paths, restart Claude Code, and run the doctor. The pre-hook permits only verified read operations plus refund tools; unknown PayPal tools block. Post hooks report success or failure so reservations can settle. See the [complete hook guide](../Backend/CLAUDE_CODE_INTEGRATION.md).

## Monitoring signals

| Signal | Meaning | Operator action |
|---|---|---|
| HTTP 503 with `busy` | SQLite write lock exceeded timeout | Retry after one second; investigate long or external writers if persistent |
| `unknown_outcome` | No trustworthy execution result arrived | Reconcile against PayPal before changing balances; it intentionally remains counted |
| `R-STATE-UNAVAILABLE` | Required capture or dispute state could not be read | Review manually; check PayPal availability and credentials |
| Chain verification failure | Ledger row content or linkage changed | Stop relying on the log, preserve files, compare against a published head or seal |
| 401 on gate endpoints | Missing or incorrect bearer token | Align service and hook `LEASH_TOKEN` values |
| 503 “hook endpoints disabled” | Production has no `LEASH_TOKEN` | Configure the token before enabling agents |
| Repeated 429 | Per-IP rate limit reached | Slow the client; validate trusted proxy configuration |

## Reservation reconciliation

The server sweeps once per minute. A reservation with no result for 120 seconds becomes `unknown_outcome` and keeps its dollars and items unavailable. A stale pending approval expires and releases its item hold. There is no automatic PayPal-to-database reconciliation job; ambiguous outcomes require an operator to inspect PayPal and deliberately repair state if needed.

## Audit checkpoints

`npm run ledger-head` verifies the chain and prints its row count and head hash. Publish that pair somewhere outside the database. Later, run:

```bash
npm run ledger-head -- --verify <rows> <head>
```

Later appends remain valid; changing history at or before the published position fails verification. The lower-level `seal.ts` supports an HMAC-protected file checkpoint for workflows that keep `LEASH_LEDGER_KEY` outside the database host.

## Policy changes

Edit and review `mandate.json`, then restart the service. For natural-language input, compile a draft with `npm run compile-policy -- <policy.txt> [draft.json]`. Review its disagreements, questions, unsupported rules, and playback. Activate only with:

```bash
npm run compile-policy -- --activate <draft.json> <expiresAt>
```

Activation refuses drafts with missing required limits. The web authoring screen never activates a mandate.

## Testing and diagnostics

| Command | Coverage |
|---|---|
| `npm run typecheck` | Server, tests, and web TypeScript |
| `npm test` | Main suite on the default SQLite driver |
| `npm run test:node-sqlite` | Same suite forced onto built-in SQLite |
| `npm run web:build` | Production frontend bundle |
| `npm run replay` | Three recorded requests through a running gate |
| `npm run doctor` | Hook installation and an end-to-end blocked sample |

The suite covers pure policy ordering, item resolution, concurrent caps, approvals and replay, restarts, hooks and stdio MCP, HTTP security, PayPal error behavior, ledger/seal limits, policy compilation, demo flows, and browser E2E when Chromium is available.

## Reset and recovery

`npm run reset` deletes `LEASH_DB` plus its WAL and SHM files. Stop the server first. This is destructive and intended only for disposable local demo data.

For an operational database, take a SQLite-consistent backup before changes. Preserve the database, WAL/SHM files, active mandate, externally published heads, and seal file during incident analysis. Never restore a database under a running Leash process.

## Video and benchmark tooling

The `video/` project is a separate Remotion build with recording, cutting, voice-over, audio-mixing, and rendering scripts; follow [its README](../../video/README.md). `scripts/leashbench/` contains research harnesses and synthetic adversarial tickets. These are evidence and media tooling, not production runtime dependencies.
