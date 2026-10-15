# Leash policy reference (refund tool: `create_refund`)

The policy engine is a pure function: `decide(action, mandate, state)`. Limits are data from `mandate.json` (see README, "policy is data"). Rules run in this order; the first match wins. Each rule id below is an anchor referenced by the `doc_url` in blocked results.

| # | Rule id | Decision | Triggers when |
|---|---|---|---|
| 1 | <a id="r-mandate-expired"></a>R-MANDATE-EXPIRED | block | now is past the mandate's `expiresAt` |
| 2 | <a id="r-invalid"></a>R-INVALID | block | amount is not a positive integer number of cents |
| 3 | <a id="r-unknown-txn"></a>R-UNKNOWN-TXN | block | the capture id is not known to Leash |
| 4 | <a id="r-currency"></a>R-CURRENCY | block | the refund's currency differs from the capture's |
| 5 | <a id="r-over-capture"></a>R-OVER-CAPTURE | block | amount > captured minus refunded minus reserved |
| 6 | <a id="r-dup"></a>R-DUP | block | same session, capture and amount already counted within `dupWindowMs` (default 24 h; 0 disables) |
| 7 | <a id="r-hard-max"></a>R-HARD-MAX | block | amount > `hardMaxCents` |
| 8 | <a id="r-daily-hard"></a>R-DAILY-HARD | block | rolling 24 h total + amount > `hardDailyCapCents` (applies even after human approval) |
| 9 | <a id="r-approved"></a>R-APPROVED | allow | a single-use, unexpired grant for this exact tool, capture and amount exists (soft caps waived) |
| 10 | <a id="r-daily-cap"></a>R-DAILY-CAP | escalate | rolling 24 h total + amount > `dailyCapCents` |
| 11 | <a id="r-action-cap"></a>R-ACTION-CAP | escalate | amount > `perActionCapCents` |
| 12 | <a id="r-allow"></a>R-ALLOW | allow | none of the above |

Demo mandate: per-action cap $50, hard max $100, daily cap $200, hard daily cap $400, duplicate window 24 h, mandate expiry 7 days.

Notes
- **Omitted amount** means a full refund; Leash resolves it to the remaining refundable balance before evaluating.
- **Duplicate rule is intentional:** a legitimate second refund of the same amount on the same capture inside the window is blocked; change `dupWindowMs` if your business needs it.
- **Counted statuses** (what spends the cap): reserved, executed, approved-executed, unknown-outcome. Blocked, denied, expired and failed actions do not count.
- **Unknown or unmapped money tools** are blocked (fail closed). Read-only tools (`get_*`, `list_*`, `show_*`, `search_*`) pass.
- **Approval** waives only rows 10 and 11. Rows 1 to 8 are re-checked against current state at approval time and again when the agent's retry consumes the grant.
