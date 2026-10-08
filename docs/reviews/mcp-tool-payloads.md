# WIN-T1 source audit: PayPal agent-toolkit and AI-Toolkit (2026-10-07)

Method: files read directly from GitHub raw (not summaries) at the commits below. No application code written. A live MCP call and live tool enumeration are NOT done yet (see "Still unverified").

| Repo | Commit read | Commit date |
|---|---|---|
| paypal/agent-toolkit (`main`) | a3aa963960 | 2026-09-01 |
| paypal/AI-Toolkit (`main`) | 638cc9e603 | 2026-10-06 |

## 1. Verdict

**No native merchant confirmation gate and no per-call amount limit exists in the open-source toolkit code.** Every money-moving tool is a straight pass-through to the PayPal API once the tool is enabled. The only native control is a per-action on/off switch. The AI-Toolkit's only hook never touches MCP tools and says so in its own text.

This is proven for the code in the two repos above. It is **not proven for the hosted `mcp.sandbox.paypal.com` server's internal behavior**, whose source is not in these repos (see section 6).

## 2. Evidence

| # | Claim | Evidence (file, content) |
|---|---|---|
| E1 | Tool execution is a direct pass-through | `typescript/src/modelcontextprotocol/toolkit.ts`: `async (arg, _extra) => { const result = await this._paypal.run(tool.method, arg); return { content: [{ type: 'text', text: String(result) }] }; }`. No prompt, no confirmation, no limit between the model's call and `run()` |
| E2 | The only gate is an on/off switch | `typescript/src/shared/configuration.ts`: `isToolAllowed(tool, configuration)` returns true if `configuration.actions[product][action]` is true; used only at registration time to filter which tools exist (`tools(context).filter(tool => isToolAllowed(tool, configuration))`). Boolean per action, no amounts, no per-call logic |
| E3 | Refund executes immediately | `typescript/src/shared/functions.ts` `createRefund`: `axios.post(`${client.getBaseUrl()}/v2/payments/captures/${capture_id}/refund`, params, { headers })`. No check before the POST |
| E4 | Refund has no idempotency by default | `typescript/src/shared/client.ts` `getHeaders()` sets `PayPal-Request-Id` only `if` `this._context.request_id` is configured; otherwise none is sent. PayPal's docs say omitting it allows duplicate partial refunds |
| E5 | "Enable everything" is one constant | `typescript/src/shared/tools.ts`: `export const ALL_TOOLS_ENABLED = allActions;` built from every tool's `actions` |
| E6 | The dispute-accept switch is misleadingly named | `tools.ts`: `method: 'accept_dispute_claim'` with `actions: { disputes: { create: true } }` |
| E7 | The AI-Toolkit hook never blocks and never sees MCP tools | `AI-Toolkit/hooks/hooks.json`: one `PreToolUse` hook, `matcher: "Write\|Edit"`, type `prompt`; text: "hook informational only must never block deny edit ... Regardless file, you must end response single word 'approve' ... hook always approves only ever adds optional context" |
| E8 | The plugin connects the hosted MCP with a bearer token | `AI-Toolkit/.mcp.json`: server name `paypal-sandbox`, `type: sse`, `url: https://mcp.sandbox.paypal.com/sse`, `Authorization: Bearer ${PAYPAL_SANDBOX_ACCESS_TOKEN}` |
| E9 | The only security policy is a bug bounty pointer | `AI-Toolkit/SECURITY.md`: bug bounty process only; no agent-safety guidance |

## 3. Real tool names and payload shapes (from `tools.ts` and `parameters.ts`)

**Correction to earlier snippets:** the refund tool is `create_refund`, not `refund_payment`.

| MCP tool (`method`) | Native action key | Parameters (zod) | Money effect |
|---|---|---|---|
| `create_refund` | `payments.createRefund` | `capture_id` (string, CAPTURE_ID_REGEX), `amount?` = `{ currency_code: string, value: string }` ("if not specified, the full captured amount is refunded"), `invoice_id?`, `note_to_payer?` | Moves money immediately |
| `get_refund` | `payments.getRefunds` | `refund_id` | Read-only |
| `record_refund_for_invoice` | `invoices.recordRefund` | `invoice_id`, `refund_date?`, (amount fields per `recordRefundForInvoiceParameters`) | Records a refund against an invoice (a different tool from `create_refund`; do NOT treat as a capture refund) |
| `send_invoice` | `invoices.send` | per `sendInvoiceParameters` | Sends an invoice to a recipient |
| `cancel_subscription` | `subscriptions.cancel` | per `cancelSubscriptionParameters` | Cancels a subscription |
| `accept_dispute_claim` | `disputes.create` | per `acceptDisputeClaimParameters` | Concedes a dispute |

Consequences already applied to the plan:
- Hook payload for a refund: `tool_input = { capture_id, amount?: { currency_code, value }, ... }`. `amount.value` is a **string** (parse to integer cents without floats). **An omitted `amount` means a full refund**: Leash resolves it to the remaining refundable balance.
- **Currency:** `amount.currency_code` is caller-supplied. Policy must reject a refund whose currency differs from the capture's (new rule `R-CURRENCY`, see docs/THREAT-MODEL.md).
- `get_*`, `list_*`, `show_*`, `search_*` tools are read-only. Everything else is gated or fails closed.

## 4. Claude Code tool naming (inference, not source-verified)

The plugin registers the server as `paypal-sandbox`. Claude Code names MCP tools `mcp__<server>__<tool>`; plugin-provided servers may be namespaced with the plugin name. So the matcher must not assume the exact prefix. Use the matcher `mcp__.*paypal.*` and take the tool as the text after the last `__` (`tool_name.split('__').pop()`), not index `[2]` as in the earlier hook snippet. Confirm the real string in the live enumeration step.

**Update (docs-level verification, 2026-10-07, see docs/reviews/verification-log.md):** Claude Code documents plugin MCP tools as `mcp__plugin_<plugin>_<server>__<tool>`, so the expected name is `mcp__plugin_paypal_paypal-sandbox__create_refund` and the matcher is `mcp__plugin_paypal_paypal-sandbox__.*`. Official PayPal doc: "The complete catalog of tools is available in both local and remote MCP server", which resolves most of the section 6 uncertainty about the hosted tool list (still confirm live).

## 5. What the earlier hook snippet got wrong (fixes owed when code is written)

1. Tool name `refund_payment` -> `create_refund`.
2. `split('__')[2]` -> `split('__').pop()`.
3. The loose `/refund/` match would also catch `record_refund_for_invoice` and `get_refund`; match exact tool names instead.
4. Refund args are `capture_id` and `amount.value` (string); the snippet's guess was close but must read `amount.currency_code` too.

## 6. Still unverified (needs one live session, WIN-T1 steps b, c, d)

- **The hosted server's actual tool list.** `skills/paypal-best-practices/references/mcp-tools.md` (AI-Toolkit) inventories the remote server as `create_order`, `pay_order`, 7 invoice tools, 7 subscription tools, `list_disputes`, `get_dispute`, catalog, shipment, `list_transactions` and merchant insights. **It does not list `create_refund`**, although the toolkit code defines it and the kickoff presenter said refunds are exposed. Whether `mcp.sandbox.paypal.com/sse` exposes `create_refund` is unknown until you list the tools in a live session.
- **Fallback if the hosted server does not expose refunds:** run the local `@paypal/mcp` (README: `--tools=all` includes `payments.createRefund`) with `PAYPAL_ENVIRONMENT=SANDBOX`, and gate that server's tools with the same hook. The demo is unchanged; the install step differs.
- **Whether the hosted server adds server-side confirmation or limits.** The repo class `PayPalMCPToolkit` (source tag `'Remote MCP'`) uses the same `isToolAllowed` filter, which suggests the same model, but the hosted configuration is invisible here. The Discord question (WIN-T1d) is the remaining check.
- **Claude Code hook payload field names** (`tool_use_id`, `tool_response` shape, `permissionDecision` values) come from Claude Code documentation, not from this audit; verify against the installed version.
- **Where the token lives.** E8 shows the plugin reads `PAYPAL_SANDBOX_ACCESS_TOKEN` from the environment (README: set in Claude Code's `settings.json` `env` block). If Claude Code exports that env to Bash tool calls, an agent with shell access can read it and call PayPal REST directly, bypassing an MCP-matcher hook. Verify in the live session (see THREAT-MODEL T2).

## 7. Pinning
Docs and the README pin the toolkit versions read here (`agent-toolkit` commit a3aa963, plugin 1.2.0 from `plugin.json`) and say behavior may change between versions (invoice auto-send changed in 1.11.0 per the greenlitbooks review, 2026-09-23).
