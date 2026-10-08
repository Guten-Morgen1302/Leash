# Leash threat model (draft, 2026-10-07)

Status: design-time. Nothing here is implemented or tested yet; each "Mitigation" is a requirement with a named test. State limits first, then claims.

## 1. What Leash is, and is not

Leash is a **guardrail for an AI agent you run**, not a security boundary against a hostile operator. A policy engine decides allow, escalate or block for money-moving tool calls (v1: `create_refund`) before they reach PayPal's sandbox, and records every decision in a hash-chained audit trail. It trusts: the machine it runs on, the person who configures it, SQLite, and the process clock. It does not trust: ticket text, tool arguments, the agent's reasoning, or any LLM output.

**Sandbox only.** No real money; synthetic data.

### Claims we make (each tied to a test)
| Claim | Test |
|---|---|
| A refund above its mandate limits is blocked or escalated deterministically, by code, not by a model | policy table tests |
| Two simultaneous refunds cannot both pass the last unit of a cap, on one capture or across the rolling 24 hours | worker-thread contention tests (T-CONC, T-CONC-2) |
| A human approval cannot be replayed, and cannot execute anything by itself | approval lifecycle tests; grant single-use test |
| The ledger shows if a past row was edited, or a middle row was deleted, reordered or inserted | ledger chain tests |
| Unknown or unmapped money tools fail closed | unknown-tool test |

### Claims we do NOT make
- "Tamper-proof", "non-repudiation", "cryptographic proof". Banned in all copy.
- That Leash stops a user who disables the hook, edits settings, or holds PayPal credentials directly.
- That Leash detects prompt injection. It does not try; it bounds the damage of a successful one.
- That the audit trail survives an attacker with write access to the database file.
- Safety on multiple instances: the concurrency design is single-instance by construction.

## 2. Trust boundaries
```
 [ticket text, untrusted] -> [Claude agent] --tool call--> [Claude Code PreToolUse hook] --POST /v1/check--> [Leash service + SQLite] 
                                                  |                                             |
                                                  +--(allowed only)--> [PayPal MCP / sandbox]   +--> approval page (human) --> grant
 Trusted: the operator's machine, mandate.json, the Leash process. Untrusted: everything left of the hook, and the model.
```

## 3. Threats and status

| # | Threat | Likelihood / impact | Mitigation (requirement) | Residual |
|---|---|---|---|---|
| T1 | Injected ticket makes the agent call `create_refund` for too much | High / High (the demo) | Deterministic caps, refund <= remaining capture, duplicate rule, hard limits | Stolen-but-in-budget refunds still go through: Leash bounds, not prevents |
| T2 | **Agent bypasses the hook by calling PayPal directly** (shell `curl` with `PAYPAL_SANDBOX_ACCESS_TOKEN`, or another tool). **Confirmed in a real run: the token IS visible to the agent's Bash tool when set as the plugin README instructs.** | Med / High | **Implemented and tested in the prototype (`guard.mjs`):** a second PreToolUse hook on Bash/PowerShell/Write/Edit/Read blocks PayPal API hosts, the token variables, and access to hook settings, mandate, `.env`, `.seed/`; fails closed. Tested limit: an obfuscated call (base64-encoded host) is NOT caught. **Proxy mode (implemented and tested in the prototype, `proxy.mjs`) is the real fix:** the agent talks only to Leash's MCP proxy, which holds the token; there is no token for the agent to use from a shell. Remaining limits: the proxy is only as isolated as how you launch it (a token in a settings file the agent can read is not custody), a user who also installs PayPal's own plugin reopens the path, and the proxy gates only the tools it implements. README states the fix: **credential custody** (agent never holds the token; Leash proxy is the only holder, stretch D-WIN-6) | **A hook is bypassable by a determined agent with shell access. Documented, not hidden** |
| T3 | Agent edits `.claude/settings.json` to remove the hook | Med / High | The guard hook denies edits to hook settings (tested); `npm run doctor` (implemented, tested) detects a missing or relative hook and proves an over-cap sample is blocked; managed/enterprise settings where available (verify) | A user-controlled setting is user-removable |
| T4 | Leash service down or slow | Med / Med | Hook fails **closed** (deny with problem + cause + fix); 3 s timeout; busy returns 503 | Availability loss is the cost of fail-closed |
| T5 | Hook endpoints exposed on the hosted demo | Med / High | `LEASH_TOKEN` required in production, else 503; endpoints on loopback by default; timing-safe compare | Token theft = bypass of the service, not of PayPal |
| T6 | Approval link leakage / replay / double click | Med / Med | Approve and deny are **POST only**; random 128-bit token carried in the URL fragment (not sent to servers or logs), stored hashed, single use, 15-minute expiry; GET renders only | Shoulder surfing; demo uses one approver identity |
| T7 | Approval TOCTOU (cap changes between block and click) | Med / High | Approval waives only soft caps, re-runs hard rules, mints a single-use 10-minute grant bound to tool + capture + amount; `check()` consumes the grant atomically and re-runs the hard rules again; hard daily cap | Grant window of 10 minutes by design |
| T8 | Concurrent over-cap spend | Med / High | One `BEGIN IMMEDIATE` transaction around read-window, reserve and ledger append; `reserved_cents` on the capture; single instance | Multi-instance deployment breaks the guarantee: forbidden |
| T9 | Silent execution (PostToolUse never arrives) | Med / Med | `unknown_outcome` after 120 s still counts toward every cap and holds the reservation | Cap may stay conservative until reconciled |
| T10 | **Currency mismatch** (`amount.currency_code` differs from the capture) makes cents comparison meaningless | Low-Med / High | **New required rule `R-CURRENCY`**: block if the refund currency differs from the capture currency (not yet in the policy table: add before build) | None known |
| T11 | Omitted `amount` (full refund) bypasses an amount check | Med / High | Resolve to the remaining refundable balance before policy; tested | None known |
| T12 | A different money tool is used (`record_refund_for_invoice`, `send_invoice`, `cancel_subscription`, `accept_dispute_claim`) | Med / Med | Exact-name map; anything unmapped and not read-only is denied; the last three always escalate | Coverage is only as good as the tool list (re-enumerate per toolkit version) |
| T13 | LLM risk brief is poisoned by ticket text | Med / Low | Advisory only; ticket cleaned (control, zero-width, bidi characters removed, 1000-char cap) and fenced as untrusted in the prompt; output HTML-escaped, links removed, 600-char cap (`brief.mjs`, tested); never read by the gate; labeled "AI summary, advisory only" | A misleading brief can sway the human approver: the approval page shows the rule and amount first |
| T14 | Mislabeling simulated as real | Low / High (credibility) | `mode` (SIMULATED or LIVE-FIRE) on every ledger row and in the UI | None |
| T16 | **The hook fails OPEN**: per the Claude Code hooks docs, exit 1, any non-2 code, a crash, a missing script or a timed-out command hook does not block the call | High if unhandled / High | Hook wraps every path so failures exit 2 (tested: service down, hung service via watchdog, garbage input, crash); watchdog shorter than the hook timeout; absolute path in the hook command; `npm run doctor` verifies the hook is installed and that a sample over-cap refund is actually blocked | A missing or uninstalled hook script still protects nothing: the doctor check and the README's install-verify step are the control |
| T15 | Secrets committed | Med / High | `.gitignore` for `.env*`; pre-submission secret scan over full history | None known |

## 4. The hash chain: exactly what it does and does not give you

Each row stores `hash = SHA-256(prev_hash || canonical_json(row))`; genesis `prev` is 64 zeros; rows are appended in the same transaction as the state they describe.

| Attack | Detected? | Why |
|---|---|---|
| Edit the content of any past row | **Yes** | Its hash no longer matches; every later `prev_hash` link breaks |
| Delete a row from the middle | **Yes** | The next row's `prev_hash` no longer matches |
| Reorder or insert a row in the middle | **Yes** | Links break |
| Delete the last N rows (truncate the tail) | **No by the chain alone; YES with the seal** | The remaining prefix is a valid chain. With a sealed checkpoint (count + head, HMAC with a key held outside the database file) truncation below the checkpoint is detected (tested) |
| Rewrite the whole ledger with recomputed hashes | **No by the chain alone; YES against a database-only attacker with the seal** | An attacker who recomputes hashes changes the head at the sealed row, so verification fails (tested). **An attacker who holds both the database and the seal key can still re-seal a truncated or rewritten ledger (tested limit)** |
| A compromised Leash process writes false rows | **No** | The chain records what the writer says |
| Crash between a decision and its ledger row | n/a | Same transaction: both or neither |

What it is good for: a quick, offline check that the history was not edited by accident or by someone without the means to recompute. **It is a tamper-evident log against partial edits. It is not tamper-proof against whoever owns the database file.**

Seal (implemented in the verified prototype, `seal.mjs`): `leash seal` writes `{count, head, HMAC(key, count|head)}` to a file outside the database using `LEASH_LEDGER_KEY`; `verify` checks the MAC, the chain, that the row count has not fallen below the sealed count, and that the row at the sealed position still has the sealed head. Seal at each approval-page checkpoint and before the video. Still deferred: per-row signatures and publishing the head externally (CEO D-SIGN); they are the answer to "how would you make it stronger".

Tests that pin the honest behavior: edit-middle is detected; delete-middle is detected; tail truncation is **not** detected (the test asserts the documented limitation); full recomputation is **not** detected (documented).

## 5. Questions a judge will ask, and the answers

| Question | Answer |
|---|---|
| Why not just use PayPal's own controls? | The toolkit has a per-action on/off switch and nothing finer (verified in source: docs/reviews/mcp-tool-payloads.md). Leash adds per-agent budgets, per-capture limits, human approval and an audit trail |
| Can the agent just skip the hook? | If it has shell access and the token, yes (T2). That is why the README separates "guardrail for your own agent" from "credential boundary", and why the proxy is the strong version |
| Is the ledger tamper-proof? | No. Tamper-evident against partial edits; the table above says exactly what it misses |
| What if two refunds race? | One IMMEDIATE transaction serializes the check, reservation and ledger append; worker-thread tests with separate connections check the invariants |
| What if the human approves late? | Approval re-runs the hard rules and only mints a single-use grant; execution is decided again when the agent retries |
| Is the gate an LLM? | No. The LLM writes an advisory summary and plays the agent. The gate is code |
| Does this scale out? | No: single instance by design |
