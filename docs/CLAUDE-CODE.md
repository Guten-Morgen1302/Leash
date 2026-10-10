# Using Leash with Claude Code and the PayPal AI Toolkit (verify items marked CONFIRM against your live session)

Sandbox only. Pin the toolkit versions you tested (agent-toolkit commit a3aa963, plugin 1.2.0 as of 2026-10-07): behavior can change between versions.

## 1. Install
1. Install the PayPal AI Toolkit plugin in Claude Code and set the sandbox token as the toolkit README describes. Fully quit and reopen Claude Code.
2. Start Leash: `npm run demo` (service on a loopback port; prints the URL).
3. Generate the hooks with absolute paths for your checkout: `npm run hooks:print` (redirect into `.claude/settings.json`, or merge by hand; the block is shown in section 2). **Use absolute paths.** A relative path breaks when the working directory changes, and a hook that does not run fails OPEN (the call proceeds unchecked).
4. Run `npm run doctor`. It checks that the hooks are configured, the matcher covers the PayPal tools, the paths are absolute, the scripts exist, and that a deliberately over-cap sample refund is actually blocked. **Do not trust the setup until doctor passes.**

## 2. Hook configuration (CONFIRM the tool-name prefix with your live tool list)
```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "mcp__plugin_paypal_paypal-sandbox__.*",
        "hooks": [{ "type": "command", "command": "node \"C:/abs/path/leash/hooks/leash-hook.mjs\" pre", "timeout": 5 }] },
      { "matcher": "Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|Read",
        "hooks": [{ "type": "command", "command": "node \"C:/abs/path/leash/hooks/guard.mjs\"", "timeout": 5 }] }
    ],
    "PostToolUse": [
      { "matcher": "mcp__plugin_paypal_paypal-sandbox__.*",
        "hooks": [{ "type": "command", "command": "node \"C:/abs/path/leash/hooks/leash-hook.mjs\" post", "timeout": 5 }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "mcp__plugin_paypal_paypal-sandbox__.*",
        "hooks": [{ "type": "command", "command": "node \"C:/abs/path/leash/hooks/leash-hook.mjs\" failure", "timeout": 5 }] }
    ]
  }
}
```
Verified against real Claude Code 2.1.278 (stand-in MCP server): exit 2 blocks the tool call, PostToolUse carries the same `tool_use_id`, and an MCP `tool_response` is an array of content blocks (the PayPal JSON is inside escaped text), which the hook parses. A blocked call produces no PostToolUse event. Plugin-provided PayPal tools may be named `mcp__plugin_<plugin>_<server>__<tool>`; use the matcher `mcp__.*paypal.*` to cover both forms.

Why three events: `PostToolUse` fires only when the tool succeeded; `PostToolUseFailure` reports failures. Both feed Leash so a failed refund releases its reservation and a silent one becomes `unknown_outcome` (still counted against every cap).

## 3. What each hook does
- **leash-hook (pre):** reads the PayPal tool call, asks the Leash service, and returns allow (exit 0 with a JSON decision) or block (exit 2 with the reason on stderr). **Every failure path exits 2** (service down, hung service via a watchdog, bad input, crash).
- **guard:** best-effort block of the easy bypasses: shell commands that use PayPal API hosts or the token variables, and edits or reads of hook settings, the mandate, `.env` and seed files.

## 3b. Proxy mode (credential custody: the strong setup)
Instead of giving the agent PayPal's MCP server and token, give it **Leash's proxy** (`server/proxy-main.ts`). It is an MCP server that holds the PayPal credentials itself; the agent has no token to misuse, leak or use from a shell. It offers `get_order`, `refund_items` (the agent names items, Leash computes the amount from trusted order data) and `get_refund`; `create_refund(amount)` exists only when `LEASH_EXPOSE_AMOUNT_TOOL=1`. Tested over MCP with a fake PayPal: allowed refunds reach PayPal with the proxy-held token and a `PayPal-Request-Id`; blocked and escalated refunds never reach PayPal; the token never appears in agent-visible output. Benchmarked with real models: `scripts/leashbench/bench-real-proxy.mjs`.
```json
{ "mcpServers": { "leash-paypal": { "command": "node", "args": ["--disable-warning=ExperimentalWarning", "C:/abs/path/leash/server/proxy-main.ts"],
    "env": { "LEASH_DB": "C:/abs/path/leash/leash.db", "LEASH_MANDATE": "C:/abs/path/leash/mandate.json" } } } }
```
**Credentials do not belong in that block.** `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` must be in the proxy process's own environment, set by a launcher or secret store the agent cannot read; a token in an agent-readable settings file is not custody. With no credentials the proxy runs SIMULATED (no PayPal calls). Do NOT also install PayPal's own MCP plugin with the token: that reopens the bypass. The guard hook still blocks reads of `.env` and settings.
Other PayPal tools (`send_invoice`, `accept_dispute_claim`, ...) do not exist for the agent (fail closed by omission). Adding them means adding mapped, gated tools.

## 3c. Verified facts about PayPal's tools (real runs, 2026-10-07/08)
- The plugin's tool is `mcp__plugin_paypal_paypal-sandbox__create_refund`; the matcher `mcp__.*paypal.*` covers it and any server you name with "paypal".
- **PayPal's hosted `create_refund`:** it returned a server-side error on 2026-10-08 (`PAYPAL_API_SETUP_ERROR: Unsupported cache mode: default`) but **worked on 2026-10-10** (SSE endpoint `https://mcp.sandbox.paypal.com/sse`, 46 tools, a $1.00 sandbox refund returned `COMPLETED`). It has failed before, so keep the hook's fail-closed behavior and re-test before filming. PayPal's local `@paypal/mcp --tools=all` also works.
- **The token is readable by the agent's shell** when set in the Claude environment: use proxy mode (3b) for custody, and the guard hook as a best-effort layer.

## 4. Known limits (also in THREAT-MODEL.md)
- A hook is a guardrail for **your own** agent, not a security boundary. A determined agent with shell access can obfuscate a PayPal call (tests show a base64-encoded host is not caught). The strong fix is credential custody: see section 3b (proxy mode).
- A user can edit or remove hooks. Run `npm run doctor` after any settings change.
- If the Leash service is down, PayPal tool calls are blocked, by design.

## 5. Uninstall
Remove the hook blocks from `.claude/settings.json` and restart Claude Code.
