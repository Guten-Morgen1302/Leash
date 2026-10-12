# Leash threat model (draft, 2026-10-07; updated 2026-10-12)

Status: design-time. Nothing here is implemented or tested yet; each "Mitigation" is a requirement with a named test. State limits first, then claims.

**2026-10-12 security audit:** a full test run (87 tests, both SQLite drivers), a live LeashBench run against the real proxy (10/10 adversarial tickets blocked, $0 over-refund), and a manual line-by-line review of `policy.ts`, `dispatch.ts`, `gate.ts`, `paypal.ts`, `ledger.ts`, `seal.ts`, `brief.ts`, `app.ts`, and both hooks found five issues, now fixed (see commit this line ships with): an item-level race during `pending_approval` that let two concurrent requests both escalate for the same unit (closed in `dispatch.ts`: pending holds now count against availability, and a stale escalation self-expires via `sweep()`); two unauthenticated operator-facing read endpoints (`/v1/ledger`, `/v1/exposure`, now lockable via `LEASH_LOCK_OPERATOR_ENDPOINTS=1`, off by default to keep the public demo's transparency feature working); the MCP proxy's session identity collapsing onto a shared literal when the stdio transport doesn't supply one (now a per-process random ID, closing a cross-session grant-confusion edge case); and `leash-hook.mjs`'s "read-only, skip the gate" check, which trusted any tool name starting with `get/list/show/search` rather than a verified allowlist (now an explicit whitelist against the tools confirmed in `docs/reviews/mcp-tool-payloads.md`; an unrecognized tool now fails closed instead of auto-passing by name shape). None of these were exploitable for an actual overspend in the current PayPal toolkit as enumerated — they were correctness/defense-in-depth gaps, not confirmed live-money bypasses. T2 below (guard.mjs obfuscation) also got stronger but is NOT resolved; see its updated residual note.

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
| T2 | **Agent bypasses the hook by calling PayPal directly** (shell `curl` with `PAYPAL_SANDBOX_ACCESS_TOKEN`, or another tool). **Confirmed in a real run: the token IS visible to the agent's Bash tool when set as the plugin README instructs.** | Med / High | **Implemented and tested in the prototype (`guard.mjs`):** a second PreToolUse hook on Bash/PowerShell/Write/Edit/Read blocks PayPal API hosts, the token variables, and access to hook settings, mandate, `.env`, `.seed/`; fails closed. **2026-10-12: widened to also check base64-decoded and quote/concatenation-stripped forms of the command** (was fully blind to `base64 -d`, string-splitting `"pay"+"pal.com"`, and `${VAR}`-wrapped references; all three are now caught, verified by direct test). **Still not closed**: this is cat-and-mouse by nature — e.g. a second layer of encoding, a helper script, or a non-literal construction (string reversal, char-code building, a downloaded obfuscator) still evades the regex-based check. **Proxy mode (implemented and tested in the prototype, `proxy.mjs`) is the real fix:** the agent talks only to Leash's MCP proxy, which holds the token; there is no token for the agent to use from a shell. Remaining limits: the proxy is only as isolated as how you launch it (a token in a settings file the agent can read is not custody), a user who also installs PayPal's own plugin reopens the path, and the proxy gates only the tools it implements. README states the fix: **credential custody** (agent never holds the token; Leash proxy is the only holder, stretch D-WIN-6) | **A hook is bypassable by a determined agent with shell access. Documented, not hidden; the fix narrowed the gap, did not close it** |
| T3 | Agent edits `.claude/settings.json` to remove the hook | Med / High | The guard hook denies edits to hook settings (tested); `npm run doctor` (implemented, tested) detects a missing or relative hook and proves an over-cap sample is blocked; managed/enterprise settings where available (verify) | A user-controlled setting is user-removable |
| T4 | Leash service down or slow | Med / Med | Hook fails **closed** (deny with problem + cause + fix); 3 s timeout; busy returns 503 | Availability loss is the cost of fail-closed |
| T5 | Hook endpoints exposed on the hosted demo | Med / High | `LEASH_TOKEN` required in production, else 503; endpoints on loopback by default; timing-safe compare | Token theft = bypass of the service, not of PayPal |
| T6 | Approval link leakage / replay / double click | Med / Med | Approve and deny are **POST only**; random 128-bit token carried in the URL fragment (not sent to servers or logs), stored hashed, single use, 15-minute expiry; GET renders only | Shoulder surfing; demo uses one approver identity |
| T7 | Approval TOCTOU (cap changes between block and click) | Med / High | Approval waives only soft caps, re-runs hard rules, mints a single-use 10-minute grant bound to tool + capture + amount; `check()` consumes the grant atomically and re-runs the hard rules again; hard daily cap | Grant window of 10 minutes by design |
| T8 | Concurrent over-cap spend | Med / High | One `BEGIN IMMEDIATE` transaction around read-window, reserve and ledger append; `reserved_cents` on the capture; single instance. **2026-10-12: a related item-level gap closed** — `pending_approval` did not hold item quantity, so two concurrent requests for the last unit of an item could both escalate (no dollar loss: the final retry re-resolves items live and self-heals, but it wasted human approvals and could confuse an approver). Pending holds now count against item availability, and `sweep()` auto-expires a stale escalation nobody acted on so the item frees up (test: "F1" in `tests/state-items-shadow.test.ts`) | Multi-instance deployment breaks the guarantee: forbidden |
| T21 | **Operator-facing endpoints exposed with no auth** (`/v1/ledger`, `/v1/exposure` had no bearer-token gate, unlike `/check`/`/result`) | Low / Med (info disclosure if deployed beyond loopback) | Intentional for the demo (public transparency is the point: anyone can watch the hash chain). **2026-10-12: made lockable** via `LEASH_LOCK_OPERATOR_ENDPOINTS=1`, off by default so the demo is unaffected; an operator deploying beyond the demo can require the same `LEASH_TOKEN` here | `/approval/:id` and `POST /approve` stay public by design (the human-click flow has no login; its secret is the per-action token, not a service-wide bearer) |
| T22 | **MCP proxy session identity collapses to a shared literal** when the transport doesn't supply one | Low (stdio is 1:1 per process; real exposure only if an operator shares one `leash.db` across multiple proxy processes) | `@modelcontextprotocol/sdk`'s `StdioServerTransport` never sets `extra.sessionId` (confirmed against SDK source), so every call fell back to the literal `'proxy'`. If two proxy processes ever shared one DB and coincidentally requested the same `(tool, captureId, amount, items)`, a grant minted for one could be consumed by the other, since grants key on `args_hash + session_id`. **2026-10-12: fallback is now a random ID generated once per process start**, closing the collision | None known; standard deployment (one proxy process per agent conversation) was never exposed to this |
| T9 | Silent execution (PostToolUse never arrives) | Med / Med | `unknown_outcome` after 120 s still counts toward every cap and holds the reservation | Cap may stay conservative until reconciled |
| T10 | **Currency mismatch** (`amount.currency_code` differs from the capture) makes cents comparison meaningless | Low-Med / High | **New required rule `R-CURRENCY`**: block if the refund currency differs from the capture currency (not yet in the policy table: add before build) | None known |
| T11 | Omitted `amount` (full refund) bypasses an amount check | Med / High | Resolve to the remaining refundable balance before policy; tested | None known |
| T12 | A different money tool is used (`record_refund_for_invoice`, `send_invoice`, `cancel_subscription`, `accept_dispute_claim`) | Med / Med | Exact-name map; anything unmapped and not read-only is denied; the last three always escalate. **2026-10-12: `leash-hook.mjs`'s read-only passthrough was a name-pattern heuristic (`/^(get\|list\|show\|search)_/`), not a verified list — a future PayPal tool that mutates state but happens to match that prefix would have auto-passed. Replaced with an explicit whitelist of the four tools verified read-only in `docs/reviews/mcp-tool-payloads.md`; anything else now fails closed, matching the proxy's own fail-closed-by-omission posture.** | Coverage is only as good as the tool list (re-enumerate per toolkit version); the hook whitelist must be updated when PayPal's toolkit adds a new read tool, or that new tool is blocked (fails closed, not open) until added |
| T13 | LLM risk brief is poisoned by ticket text | Med / Low | Advisory only; ticket cleaned (control, zero-width, bidi characters removed, 1000-char cap) and fenced as untrusted in the prompt; output HTML-escaped, links removed, 600-char cap (`brief.mjs`, tested); never read by the gate; labeled "AI summary, advisory only" | A misleading brief can sway the human approver: the approval page shows the rule and amount first |
| T14 | Mislabeling simulated as real | Low / High (credibility) | `mode` (SIMULATED or LIVE-FIRE) on every ledger row and in the UI | None |
| T16 | **The hook fails OPEN**: per the Claude Code hooks docs, exit 1, any non-2 code, a crash, a missing script or a timed-out command hook does not block the call | High if unhandled / High | Hook wraps every path so failures exit 2 (tested: service down, hung service via watchdog, garbage input, crash); watchdog shorter than the hook timeout; absolute path in the hook command; `npm run doctor` verifies the hook is installed and that a sample over-cap refund is actually blocked | A missing or uninstalled hook script still protects nothing: the doctor check and the README's install-verify step are the control |
| T17 | Policy compiler: injection through policy text (merchant-supplied or tampered text smuggles unsafe fields) | Low-Med / High | Output constrained to a whitelisted fixed schema; anything else rejected; no generated code ever; compile happens at config time only | A merchant who writes a bad policy gets a bad mandate: the hard caps and playback are the check |
| T18 | Policy compiler misreads the policy | Med / High | Plain-language playback; boundary tickets the merchant must review; our hand-authored adversarial tickets in every sign-off set | Humans skim; correlated errors possible |
| T19 | Recompile drifts or is non-deterministic | Med / Med | Temperature 0; pinned model and prompt version; diff of old vs new mandate; explicit re-sign before activation | Pinned model may be retired |
| T20 | PayPal state lookup (disputes, refunds) fails or lags | Med / Med | Lookup outside the DB transaction; error => ESCALATE (R-STATE-UNAVAILABLE), never allow; recorded in the ledger | State can change between check and refund: reservations and the retry re-check bound it |
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
