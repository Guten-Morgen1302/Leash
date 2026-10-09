# Devpost submission text (DRAFT: written for the target build; every claim below must be true at submission)

## Technical Implementation (3 paragraphs)

**One transaction is the gate.** Every refund request enters a single SQLite `BEGIN IMMEDIATE` transaction, which takes SQLite's one write lock up front. Inside it, in order: read the rolling 24-hour total, read what is still refundable on the capture (captured minus refunded minus reserved), run the policy, reserve the amount and append a hash-chained ledger row. A second request cannot begin its check until the first has committed, so two refunds racing for the last dollar of a cap cannot both pass; the loser sees the winner's reservation. PayPal is called outside the transaction (reserve, then execute). The Claude Code `PostToolUse` report releases a reservation only on a clear failure; anything ambiguous keeps it held, and a sweep turns silent calls into `unknown_outcome`, which still counts toward every cap. Leash may over-count briefly; it never under-counts spend.

**Approval without a time-of-check bug.** Minutes pass between "blocked, needs approval" and a human's click, and that gap is where approval gates leak. Leash does not hold a reservation for a pending action and approval executes nothing. Approving re-evaluates against current state (hard rules such as the capture balance and a hard daily limit still apply; only the soft caps are waived) and mints a single-use, 10-minute grant bound to the exact tool, capture and amount. The agent's retry is a fresh `check()` that consumes the grant inside the same `BEGIN IMMEDIATE` transaction and re-runs the hard rules once more. The decision that matters is made when the money would move, not when the button was clicked, and there is no dead reservation to leak, expire or replay.

**Tested under real contention.** Node is single-threaded, so awaiting two calls proves nothing about races. Our Vitest suite spawns worker threads that each open their own SQLite connection, releases them together with an `Atomics` barrier, and asserts the database invariants afterward: eight simultaneous $40 refunds against a $200 daily cap produce exactly five allowed; six simultaneous $30 refunds on a $100 capture never reserve more than the capture. A negative control shows the test can fail: with `busy_timeout=0` a contender gets `SQLITE_BUSY`, and with the real timeout it waits and succeeds. The suite runs against both `better-sqlite3` and Node's built-in `node:sqlite`. The gate runs as an MCP proxy that holds the PayPal credential, in front of the real PayPal sandbox refund API, so the demo uses the real integration, not a mock. [Edit before submitting: only if the Claude Code hook on PayPal's own plugin is verified live, add: "It also ships as a Claude Code hook for PayPal's AI Toolkit."]

## Evidence required before this text may be submitted (delete anything that is not true)

| Claim in the text | Must exist and pass |
|---|---|
| "single `BEGIN IMMEDIATE` transaction ... ledger row" | `tx()` in `server/db.ts`; ledger append inside `check()` |
| "5 allowed of 8", "never reserve more than the capture" | worker-thread tests green in CI |
| "`busy_timeout=0` gets SQLITE_BUSY" | the negative-control test green |
| "both better-sqlite3 and node:sqlite" | the suite green with `LEASH_DB_DRIVER` set both ways; otherwise delete that sentence |
| "grant ... re-runs the hard rules" | approval and grant tests green |
| "`unknown_outcome` counts toward every cap" | sweep test green |
| "runs as an MCP proxy in front of the real PayPal sandbox refund API" | VERIFIED 2026-10-07: live $18 refund executed and confirmed at PayPal (docs/reviews/verification-log.md section F) |
| "works with Claude Code and PayPal's MCP tools via a hook" | VERIFIED with real Claude Code and PayPal's plugin and local MCP (verification-log sections G and H); mention that the hosted server's create_refund errored in our run only if asked |
| "mathematically", "proves", "perfect", "tamper-proof" | never use these words |

## Architecture: policy as data (Impact/Architecture section; objection handler)

**Separation of concerns.** Leash's policy engine is a pure function: it takes the action, the current state and a mandate, and returns allow, escalate or block. Every limit (per-refund cap, daily cap, hard limits, allowlists, expiry) is injected data read from `mandate.json`, never hardcoded logic, so changing a limit never means changing code.

**Production vision.** For the hackathon the mandate is a static, version-stamped JSON file: a deliberate scoping choice that put our time into the hard part, a correct, race-free and auditable gate, instead of a settings screen. The schema is the contract a merchant dashboard would edit, so an operations team could raise refund caps for a holiday sale and lower them afterward without engineering involvement. In production those edits would themselves be permissioned and recorded in the audit trail with the mandate version, because a cap anyone can raise silently is not a cap.

**If a judge says "mandate.json is rigid":** "The limits are data, not code: the engine is a pure function over a mandate, so a seasonal change is an edit to that data. We shipped the file and left the dashboard out on purpose, because the gate's correctness under concurrency was the part worth proving in six weeks."

Honest status: no dashboard, hot reload or role-based editing exists in the hackathon build; the section above is a design direction, and the judges' copy should say "would" for anything not shipped.

## Innovation and Impact (from earlier; edit to match the shipped build)

**Innovation:** Give your AI agent a refund budget, not your PayPal keys. PayPal's AI Toolkit gives an agent refunds, invoices and disputes through a per-action on/off switch and nothing finer: no amount caps, no per-ticket budgets, no human approval (verified in the toolkit source). Leash is an MCP proxy in front of PayPal's real sandbox that enforces a mandate (per-refund and daily caps, refund never exceeds what was captured, duplicate detection) with one rule: the gate is deterministic code, never a model. Borderline refunds pause for a human on a phone-first approval page with an advisory AI summary, and every decision lands in a hash-chained audit trail we call tamper-evident against partial edits, not tamper-proof.

**Impact:** Merchants are starting to let AI agents handle refund tickets, and OWASP lists this as a top LLM risk, Excessive Agency: an agent with too much power and no human in the loop. We measured it. In our small benchmark, LeashBench, a real agent handled tickets that legitimately asked for an $18 refund but carried a manipulation: a strong current model over-refunded the full $200 once in 34 runs, while a cheaper model, the kind a merchant picks for support volume, did it 6 times in 20 and would have refunded $1,236 instead of the correct $36. Model behavior changes with the model and the prompt and a merchant cannot audit it; a cap can be audited. Replaying those same calls through Leash, every over-refund was blocked, routine refunds went through, and a compromised agent can move at most $400 a day under the demo mandate. Samples are small and the Leash column is a replay, so we publish the benchmark and runner for anyone to reproduce with their own model.

## Impact evidence rules
See docs/IMPACT.md section 2: only claims marked USE may be published; verify the Air Canada and Ravelin citations against primary sources first; never claim a verified large loss from an injected refund agent (none is documented). Frame as bounded liability before the first incident.

| "6 of 20", "1 of 34", "$1,236 vs $36" | VERIFIED 2026-10-09 by docs/reviews/leashbench (results-*.json, replay-bench.mjs); re-run before submission and update numbers if they change; keep the limits sentence |
