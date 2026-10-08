# Verification log (2026-10-07): what was checked from our side, how, and the result

Rule: nothing below is marked verified unless a document was read or a test actually ran. "Docs-level" means read from official documentation, not exercised live.

## A. Ran locally (Node v24.10.0, Windows; throwaway folder, prototype saved in docs/reviews/prototype-verified/)

| Check | Result |
|---|---|
| `db.ts` interface and `tx()` on **better-sqlite3 (installed, built OK)** and **node:sqlite (built into Node 24)** | 13 tests pass on each driver, 26 of 26 total |
| Rollback on exception, async-callback guard, nested-tx guard, usable afterward | pass, both drivers |
| Demo outcomes: $18/$60 allow, $75/$120 escalate (R-ACTION-CAP), $900/$60 block (R-OVER-CAPTURE) | pass |
| Omitted amount = remaining balance; currency mismatch blocks (R-CURRENCY) | pass |
| Approval: wrong token 403, replay 409, single-use grant consumed by the retry, expiry 410, rejected when other tickets ate the **hard** daily cap | pass |
| Window and duplicate queries exclude the action's own id | pass |
| PostToolUse: executed / failed (releases) / silent -> `unknown_outcome` that still counts toward the cap | pass |
| Ledger: edit-middle detected, delete-middle detected, **tail truncation NOT detected** (documented limit) | pass (the limit is asserted, not hidden) |
| **Real contention** (worker threads, separate connections, Atomics barrier): 8 simultaneous $40 refunds vs $200 cap = exactly 5 allowed; 6 simultaneous $30 on one $100 capture = 3 allowed, reserved+refunded <= captured; zero BUSY errors | pass, both drivers |
| busy_timeout negative control (lock held 400 ms): timeout 3000 waits and succeeds, timeout 0 fails with BUSY | pass, both drivers |
| Hook exit codes: allow -> exit 0 + JSON; block/escalate -> exit 2 + stderr; service down, hung service (watchdog), garbage stdin, malformed amount, crash -> all exit 2; read-only tools pass; unmapped money tool -> exit 2 | pass |
| AG Grid `themeQuartz.withParams` with our parameter names, `ag-grid-community` 36.2.0 (MIT) | param names exist in the type definitions and `withParams` ran without error |

### Defects the run found (all fixed in the design, none were visible on paper)
1. **My chat `check()` never created the `approvals` row** for escalated actions, so `approve()` could never find one. Fixed (token generated, hashed, stored; URL carries it in the fragment).
2. **My earlier T-CONC test was wrong**: identical $40 refunds on one capture hit `R-DUP` before the cap, so the expected "5 allowed" would have failed. The fixed test uses distinct captures. (Product note: a legitimate second refund of the same amount on the same capture within 24 hours is blocked as a duplicate. Intentional, but say so in docs/policy.md.)
3. **`node:sqlite` returns null-prototype rows**: `db.ts` must normalize rows to plain objects.
4. **Hooks fail OPEN on exit 1, timeouts and crashes** (see B). The hardened hook, tested above, exits 2 on every failure path and runs a watchdog shorter than the hook timeout. A missing or uninstalled hook script still fails open: `npm run doctor` must verify installation.

## B. Read from official docs (docs-level; not exercised live)

Claude Code hooks (code.claude.com/docs/en/hooks):
- PreToolUse stdin has `tool_name`, `tool_input`, `tool_use_id`, `session_id`.
- Output: `hookSpecificOutput.permissionDecision` is `allow`, `deny`, `ask` or `defer`, plus `permissionDecisionReason`. **Exit 2 blocks and cannot be overridden even by an allow. Exit 1, any other code, and a timed-out command hook do NOT block: the call proceeds.**
- `PostToolUse` fires only after success; **`PostToolUseFailure` exists** (stdin has `error` string) and must feed `outcome: failed`.
- Matcher: letters/digits/`_`/`-`/`|` = exact list; any other character = unanchored JS regex. `mcp__<server>__.*` form.
- **Plugin MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>`**, so for the PayPal plugin and server `paypal-sandbox` the tool is expected to be `mcp__plugin_paypal_paypal-sandbox__create_refund`; matcher `mcp__plugin_paypal_paypal-sandbox__.*`.
- `tool_response` shape for MCP tools is not documented in the part read: **capture it live**.

PayPal MCP (developer.paypal.com/ai-tools/mcp-server.md, official):
- "The complete catalog of tools is available in both local and remote MCP server." Sandbox endpoints: `https://mcp.sandbox.paypal.com` (`/sse`, `/http`). Local: `npx -y @paypal/mcp --tools=all` with `PAYPAL_ACCESS_TOKEN`, `PAYPAL_ENVIRONMENT=SANDBOX`. The remote server also supports OAuth login (no token in env).
- Source (agent-toolkit @a3aa963960) defines `create_refund`. Together: the hosted server very likely exposes `create_refund`; the AI-Toolkit's own shorter inventory is an abridgement. Live confirmation still needed.

PayPal Orders / seeding:
- In the sandbox, a business account has Advanced Credit and Debit Card Payments enabled automatically; a card in `payment_source` removes the need for buyer approval; direct card data requires PCI SAQ D in production (irrelevant in sandbox). So `seed.ts` is plausible; not run (needs your credentials).
- Refund API: `POST /v2/payments/captures/{id}/refund`, `PayPal-Request-Id` optional (omitting it can duplicate partial refunds); multiple partial refunds allowed up to the captured amount.

## C. Still needs YOU (live session). None blocks the core; they gate the adapter layer only

| # | Check | Affects |
|---|---|---|
| 1 | List the real tool names in Claude Code with the PayPal plugin; confirm `create_refund` and the exact `mcp__...` prefix | hook matcher |
| 2 | Capture one real `PostToolUse` `tool_response` and one `PostToolUseFailure` payload for a refund | result parsing |
| 3 | Run one real sandbox refund end to end | demo, seeding |
| 4 | Check whether the token env var is readable from a Bash tool call in that session | THREAT-MODEL T2 wording |
| 5 | Run `seed.ts` (card path) or seed by hand | live-fire pool |
| 6 | Ask in the PayPal Discord about native confirmation/limits on the hosted server | the "no gate" wording (source says none) |

## D. Not verifiable by anyone before the build exists
Design and DX scores at plan level; AG Grid look in pixels; the clone-to-demo time; the video; Devpost text truth (it must match what ships).

## E. Discord item (user relayed an answer, 2026-10-07): treated as UNCONFIRMED

The pasted text was garbled, had no attribution to a PayPal staff member, and cited two third-party sites. I checked both pages:
- skill-road.com: "human confirmation should be enabled for such actions ... where the client supports it" is **the site's own guidance**, not PayPal's. It does not say refunds are on the hosted server.
- aurpay.net: "rely on the client to provide this" is **the author's commentary**, no PayPal document cited. It lists `create_refund` among payment tools and says PayPal runs hosted sandbox and production endpoints, citing PayPal's developer page.
- Not found in either page: any PayPal statement that the hosted server has no confirmation or amount limits. The pasted claim "PayPal documentation specifically notes ..." is not supported by the pages it cites.

Status: consistent with, but NOT stronger than, what the source audit already established (open-source code has no gate; official doc says the full catalog is on both local and remote servers). Wording rule: say "no confirmation or amount limits in PayPal's open-source toolkit code, and PayPal's documentation leaves human approval to the client" only where the doc says so; do not claim a PayPal staff confirmation. A real staff answer in Discord (quote + name/role) would upgrade this; ask for a link to the message if one exists.

## F. LIVE-FIRE RESULTS against the real PayPal sandbox (2026-10-07, US business account, app leash-us)

| Check | Result |
|---|---|
| OAuth with the new app credentials | HTTP 200, 9-hour token (32400 s), payments/refund, payments/payment, invoicing, disputes scopes present |
| Card seeding (documented test Visa) | 20 of 20 captured payments created (USD 35 to 200). The previous India business account could not do this (`PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`) |
| Leash proxy (real MCP over stdio) -> real sandbox, $18 refund on a $60 capture | **executed**, PayPal refund COMPLETED, confirmed by an independent GET of the refund straight from PayPal (18.00 USD); ledger and balances updated (reserved 0, refunded 1800) |
| Leash proxy, $900 on a $60 capture | blocked R-OVER-CAPTURE, PayPal never called (capture untouched) |
| Leash proxy, $75 on a $120 capture | pending_approval R-ACTION-CAP, PayPal never called |
| Token leak check | The agent-visible output never contained the token (the script throws if it does) |
| **Finding: PayPal rejects a refund above the capture itself** (`REFUND_AMOUNT_EXCEEDED`, HTTP 422, tested directly) | The demo attack must be one PayPal would accept: injected "refund the full $200 order" vs a legit $18. Guarded: blocked by R-HARD-MAX ($100). A $900-on-$60 refund proves nothing to a PayPal engineer. Demo script, Devpost text and seed labels corrected |

Still NOT verified live: the Claude Code hook path (needs your Claude Code session with the PayPal plugin), the real tool names, real PostToolUse payloads, token visibility from Bash.

## G. REAL Claude Code run (2.1.278, headless `claude -p`, 2026-10-07): hook mechanics verified with a stand-in MCP server

Setup: a stand-in MCP server named `paypal-sandbox` exposing `create_refund` (no PayPal calls), plus spy hooks, driven by the real Claude Code binary. Fixtures saved (paths and ids sanitized): `reviews/prototype-verified/fixtures/real-claude-code-hook-events.jsonl`.

| Fact | Result |
|---|---|
| PreToolUse payload | Has `tool_name` (`mcp__paypal-sandbox__create_refund`), `tool_input` (`{capture_id, amount:{currency_code,value}}`), `tool_use_id` (`toolu_...`), `session_id`, `mcp_server:{name,source}` |
| Exit 2 from the hook | **Blocked the call: the tool was NOT executed** (execution log shows only the $18 call), and Claude Code showed the agent the stderr reason |
| Allowed call | Executed once; PostToolUse fired with the same `tool_use_id` |
| Blocked call | **No PostToolUse event** (so nothing to report for it) |
| **`tool_response` for an MCP tool is an ARRAY of content blocks** `[{type:"text", text:"<escaped JSON>"}]` | **Bug found and fixed:** the earlier regex on the stringified response could never match; every refund would have been recorded as `unknown_outcome`. New `result-parse.mjs` parses the blocks; 6 tests use the real captured events |
| PostToolUse `tool_use_id` equals the PreToolUse one | Yes, so `/v1/result` can find the reservation |

NOT verified by this run (still needs the real PayPal plugin installed in your Claude Code):
- The plugin-namespaced tool name. This stand-in came from `--mcp-config` (`source: dynamic`), so it was `mcp__paypal-sandbox__...`. A plugin-provided server is documented as `mcp__plugin_<plugin>_<server>__...`; the doctor and README matcher must accept both: use `mcp__.*paypal.*`.
- Whether the real PayPal tool returns the same content-block shape (expected, since it is an MCP tool).
- Whether the token is readable from a Bash tool call in a session with the plugin.
Result: Path A (hook on PayPal's plugin) is now verified except for naming and token visibility.

## H. REAL PayPal plugin and local MCP run (2026-10-07/08): the last unverified items, closed

Method: PayPal's actual plugin repo (paypal/AI-Toolkit) loaded into headless Claude Code 2.1.278 with `--plugin-dir` (no install, your config untouched); the sandbox token was supplied only in that process's environment. Separately, PayPal's local `@paypal/mcp` 1.8.1 was driven with the MCP SDK.

| Question | Verified answer |
|---|---|
| Real plugin tool name | `mcp__plugin_paypal_paypal-sandbox__create_refund`; `mcp_server = {name: "plugin:paypal:paypal-sandbox", source: "plugin"}`. Matcher `mcp__.*paypal.*` covers it (fixture + test) |
| Does the hosted server expose `create_refund`? | **Yes, the tool exists and is callable.** |
| Does the hosted `create_refund` WORK today? | **No, not in our run:** it returned `{"ok":false,"code":"PAYPAL_API_SETUP_ERROR","message":"Unsupported cache mode: default"}` (a server-side error; no money moved). Re-test before relying on it; it may be a transient PayPal bug. Do not build the live demo on the hosted server |
| Does PayPal's LOCAL `@paypal/mcp` `create_refund` work? | **Yes:** 28 tools, `create_refund` and `get_refund` present; a real $5 sandbox refund returned `{"id":"32E0503386691101M","status":"COMPLETED"}` in the content-block shape |
| Is the token visible to the agent's Bash tool? | **YES.** With the token in the Claude process environment (as the plugin README instructs via settings.json env), a Bash call saw `TOKEN_VISIBLE`. The bypass in THREAT-MODEL T2 is REAL, not theoretical |
| Hook sees the real plugin events | Yes: PreToolUse and PostToolUse fired for the plugin tool; PostToolUse `tool_response` was the content-block array containing the error JSON |

Bug fixed from this run: the plugin's error shape is `{ok:false, code, message}`; before the fix the parser classified it as `unknown` and would have kept the reservation forever. Now `failed` (network-timeout codes stay `unknown`). Test fixtures: `reviews/prototype-verified/fixtures/real-paypal-plugin-hook-events.jsonl`, `real-local-mcp-refund-response.jsonl`.

Caveat on the token test: I put the token in the process environment; the README puts it in `settings.json` `env`, which Claude Code also exports to tools. Equivalent in effect, but I did not test the settings.json route itself.
