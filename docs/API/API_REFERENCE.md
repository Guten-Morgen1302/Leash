# API documentation

Leash exposes an Express JSON API under `/v1`, a health endpoint at `/health`, and a separate stdio MCP server. Unless noted otherwise, request and response bodies are JSON. The server limits JSON bodies to 16 KiB and rate-limits API traffic per client IP.

## Conventions

- Money inside the HTTP gate is represented as integer cents. The direct refund endpoint accepts a decimal string such as `"18.00"`.
- Times are Unix epoch milliseconds unless an ISO date is explicitly documented.
- A policy result is `allowed`, `blocked`, or `pending_approval`. The full gate can additionally return `executed`, `execution_failed`, `unknown_outcome`, `shadow`, or `unavailable`.
- `SIMULATED` means the complete gate ran but the final PayPal call was replaced with a stub. `LIVE-FIRE` always means PayPal sandbox; the client rejects non-sandbox hosts.
- Unknown `/v1/*` routes return `404 {"error":"not_found"}` and never fall through to the single-page application.

## Authentication and exposure

| Endpoint group | Default access | Production behavior |
|---|---|---|
| `/v1/check`, `/v1/result` | Bearer token when `LEASH_TOKEN` is set | Disabled with 503 when `LEASH_TOKEN` is absent |
| `/v1/refund` | Open only when PayPal is simulated | Live sandbox refunds require `LEASH_TOKEN`; absent token returns 503 |
| `/v1/ledger`, `/v1/exposure` | Public for demo transparency | Set `LEASH_LOCK_OPERATOR_ENDPOINTS=1` to require the bearer token |
| Approval, mandate, author, proof, demo, health | Public | Same |

Send authenticated requests with `Authorization: Bearer <LEASH_TOKEN>`. Token comparison is timing-safe.

## Gate and execution endpoints

### `POST /v1/check`

Used by the Claude Code pre-tool hook. It evaluates and, on allow, atomically reserves a refund. It does not call PayPal.

```json
{
  "actionId": "tool-use-123",
  "sessionId": "agent-session-7",
  "tool": "refund_items",
  "captureId": "PAYPAL_CAPTURE_ID",
  "amountCents": null,
  "currency": "USD",
  "items": [{ "itemId": "mug", "qty": 1 }]
}
```

For `refund_items`, `items` is required and the amount is calculated from trusted `order_items` data. For `refund`, `amountCents` may be `null`, meaning the remaining refundable capture balance. Repeating the same `actionId` returns the persisted decision.

### `POST /v1/result`

Used by post-tool hooks to settle a prior reservation.

```json
{ "actionId": "tool-use-123", "outcome": "executed", "refundId": "PAYPAL_REFUND_ID" }
```

`outcome` is one of `executed`, `failed`, or `unknown`. Failed calls release the dollar and item reservations. Unknown outcomes keep them reserved so an ambiguous network result cannot reopen the budget.

### `POST /v1/refund`

Runs the full check-reserve-execute-result pipeline. This is the HTTP counterpart to the MCP proxy.

```json
{
  "sessionId": "support-agent",
  "captureId": "PAYPAL_CAPTURE_ID",
  "items": [{ "itemId": "mug", "qty": 1 }]
}
```

The weaker amount-scoped form omits `items` and supplies `"amount":"18.00"`. In live mode, the PayPal request uses the Leash action ID as `PayPal-Request-Id` for idempotency.

### `POST /v1/approve`

```json
{ "actionId": "uuid", "token": "fragment-token", "decision": "approve" }
```

The decision is `approve` or `deny`. Approval re-checks hard rules and creates a single-use grant for the exact tool, capture, computed amount, item set, and session. It does not execute the refund. The agent must retry identical arguments within the grant window.

## Read endpoints

| Method and path | Purpose | Notable response fields |
|---|---|---|
| `GET /health` | Liveness and runtime mode | `ok`, `mode` (`live` or `sim`) |
| `GET /v1/ledger?limit=100&offset=0` | Paginated audit events | `rows`, `total`, `chain`, `mode`; limit is clamped to 1–500 |
| `GET /v1/mandate` | Machine and plain-language mandate | `mandate`, `lines` |
| `GET /v1/exposure?sessionId=...` | Rolling spend and prevented-loss totals | `spentCents`, hard cap, blocked/escalated totals |
| `GET /v1/approval/:id` | Approval-page data | amount, items, rule, expiry, status, advisory summary |
| `GET /v1/proof` | Recorded sandbox proof, optionally re-read live | `mode`, `refunds`, `note` |
| `GET /v1/author/samples` | Bundled policy examples | `samples`, `live` |

The public ledger response deliberately excludes `payload_json`, which can contain capture IDs and item details.

## Policy authoring

`POST /v1/author/compile` accepts either `{ "policy": "..." }` for a live Gemini compilation or `{ "sample": "coffee" }` for a recorded result. It returns three-run agreement data, a plain-language playback, unsupported requirements, follow-up questions, and `activatable`. Compilation only creates a draft; activation remains a deliberate CLI step.

## Demo endpoints

- `GET /v1/demo/tickets` lists the three synthetic scenarios.
- `POST /v1/demo/run` with `{ "ticketId": 1|2|3 }` creates a fresh session, order, and capture, then returns unguarded and guarded lanes.
- `POST /v1/demo/retry` with an approval `actionId` repeats the exact item request after human approval.

These routes always use simulated PayPal, even if the service has sandbox credentials.

## MCP interface

Run `server/proxy-main.ts` over stdio. The proxy owns PayPal credentials and exposes only:

| Tool | Behavior |
|---|---|
| `get_order(capture_id)` | Returns trusted refundable line items and quantities |
| `refund_items(capture_id, items, note_to_payer?)` | Agent chooses items; Leash computes and gates the amount |
| `get_refund(refund_id)` | Read-only PayPal refund lookup |
| `create_refund(...)` | Optional weaker amount tool; exposed only with `LEASH_EXPOSE_AMOUNT_TOOL=1` |

Unmapped PayPal operations do not exist, which makes the proxy fail closed by omission. See the [backend guide](../Backend/BACKEND_GUIDE.md) for execution semantics and the [operations guide](../Operations/OPERATIONS_GUIDE.md) for hook and proxy setup.
