# Devpost submission text (DRAFT: written for the target build; every claim below must be true at submission)

## Technical Implementation (3 paragraphs)

**One transaction is the gate.** Every refund request enters a single SQLite `BEGIN IMMEDIATE` transaction, which takes SQLite's one write lock up front. Inside it, in order: read the rolling 24-hour total, read what is still refundable on the capture (captured minus refunded minus reserved), run the policy, reserve the amount and append a hash-chained ledger row. A second request cannot begin its check until the first has committed, so two refunds racing for the last dollar of a cap cannot both pass; the loser sees the winner's reservation. PayPal is called outside the transaction (reserve, then execute). The Claude Code `PostToolUse` report releases a reservation only on a clear failure; anything ambiguous keeps it held, and a sweep turns silent calls into `unknown_outcome`, which still counts toward every cap. Leash may over-count briefly; it never under-counts spend.

**Approval without a time-of-check bug.** Minutes pass between "blocked, needs approval" and a human's click, and that gap is where approval gates leak. Leash does not hold a reservation for a pending action and approval executes nothing. Approving re-evaluates against current state (hard rules such as the capture balance and a hard daily limit still apply; only the soft caps are waived) and mints a single-use, 10-minute grant bound to the exact tool, capture and amount. The agent's retry is a fresh `check()` that consumes the grant inside the same `BEGIN IMMEDIATE` transaction and re-runs the hard rules once more. The decision that matters is made when the money would move, not when the button was clicked, and there is no dead reservation to leak, expire or replay.

**Tested under real contention.** Node is single-threaded, so awaiting two calls tells you nothing about races. Our node:test suite spawns worker threads that each open their own SQLite connection, releases them together with an `Atomics` barrier, and asserts the database invariants afterward: eight simultaneous $40 refunds against a $200 daily cap produce exactly five allowed; six simultaneous $30 refunds on a $100 capture never reserve more than the capture. A negative control shows the test can fail: with `busy_timeout=0` a contender gets `SQLITE_BUSY`, and with the real timeout it waits and succeeds. The suite runs against both `better-sqlite3` and Node's built-in `node:sqlite`. The gate runs as an MCP proxy that holds the PayPal credential, in front of the real PayPal sandbox refund API, so the demo uses the real integration, not a mock. It also ships as a Claude Code hook for PayPal's AI Toolkit tools (verified with real Claude Code: the same injected ticket executed a $150 refund without the hook and was blocked with it; one run each).

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

**Innovation:** Leash turns a merchant's plain-English refund policy into an enforced mandate, makes the AI agent ask for what to refund and never how much, and checks every request against PayPal's live state before money moves. Author: an LLM compiles the policy once, at setup, into a fixed schema, and Leash plays it back in plain language for sign-off; at runtime nothing is a model. Authorize: with item-scoped refunds the agent names line items and the gate computes the amount from the merchant's own order data; on five manipulative tickets that each legitimately ask for an $18 refund in a $200 order, a cheaper model that chose the amount over-refunded 14 of 20 times ($2,566 excess) and with item-scoped refunds 0 of 20, sending 10 whole-order attempts to a human. Verify: before reserving money the gate checks for an open dispute on the transaction, refunds already made and the return window, using PayPal's APIs. Underneath are atomic per-capture reservations, approval that re-checks hard rules when money would move, and a proxy where the agent never holds the PayPal credential. Each idea has precedent; what is new is the combination for AI-agent refunds on PayPal, with measured results and an honest account of what it cannot stop. Samples are small and the tickets and policies are ours, so we publish the benchmark for anyone to reproduce.

**Impact:** Merchants are starting to let AI agents handle refund tickets, and OWASP lists this as a top LLM risk, Excessive Agency: an agent with too much power and no human in the loop. We measured it. In our small benchmark, LeashBench, a real agent handled tickets that legitimately asked for an $18 refund but carried a manipulation: a strong current model over-refunded the full $200 once in 34 runs, while a cheaper model, the kind a merchant picks for support volume, did it 18 times in 50 and would have refunded $3,654 instead of the correct $54; the most dangerous ticket was not a blunt attack but a quiet note that the customer prefers full refunds (8 of 10). Model behavior changes with the model and the prompt and a merchant cannot audit it; a cap can be audited. Replaying those same calls through Leash, every over-refund was blocked, routine refunds went through, and a compromised agent can move at most $400 a day under the demo mandate. Samples are small and the Leash column is a replay, so we publish the benchmark and runner for anyone to reproduce with their own model.

## Impact evidence rules
See docs/IMPACT.md section 2: only claims marked USE may be published; verify the Air Canada and Ravelin citations against primary sources first; never claim a verified large loss from an injected refund agent (none is documented). Frame as bounded liability before the first incident.

| "18 of 50", "1 of 34", "$3,654 vs $54", "8 of 10" | VERIFIED 2026-10-09 by docs/reviews/leashbench (results-*.json, replay-bench.mjs); re-run before submission and update numbers if they change; keep the limits sentence |

| "9 of 16 unguarded, 0 of 8 live with Leash, $503 excess" | VERIFIED 2026-10-09 (docs/IMPACT.md section 11, reviews/leashbench); re-run before submission |
| any claim that cheaper models are bad at the legitimate refund | **INVALID** (harness defect, IMPACT.md section 12): do not use |

| "14 of 20" vs "0 of 20", "$2,566", "10 exactly the mug, 10 escalated" | VERIFIED 2026-10-10 (docs/IMPACT.md section 13, reviews/leashbench/bench-items.mjs); stand-in order table, Haiku 4.5, n=20 per arm; re-run on the final build against the real proxy 2026-10-10 (IMPACT.md section 17: 40 runs, Haiku 4.5 and Sonnet 5.5, 0 dollars over the legitimate refund; Haiku completed the legitimate $18 in 9 of 20); cite section 17 for the final-build numbers |
| "the agent cannot over-refund" | **FORBIDDEN**: it can name every item; escalation is what stops it (outside review) |

| "6 of 6 policies compiled exactly" | VERIFIED 2026-10-10 as a small feasibility probe (reviews/leashbench/policy-compile-probe.py); say "in a small test"; replace with a cold, outside-written policy result before submission |
| any claim that Leash blocked a REAL open dispute | NOT VERIFIED: the sandbox dispute lookup returned 200 with no disputes; use a labeled recorded or stubbed dispute unless a real one is created |
| "tamper-proof" (appeared in the outside review's wording) | BANNED |

| "70 of 70 fields, 10 of 10 messy policies, 0 guessed on 14 unclear fields" | VERIFIED 2026-10-10 (IMPACT.md section 15, reviews/leashbench/cold-policy-compile.py); say "in a small test with independently written policies"; same-model-family and n=10 caveats must stay; replace with real-merchant policies before submission |

| "compiles realistic policies and never invents a money limit" | VERIFIED in a small test (IMPACT.md section 16: 18 runs, 0 invented limits; one silent window loosening in the weaker prompt, fixed by the unsupported list). Do NOT claim it enforces store-credit, restocking-fee or category rules until D-V2-12 is built and D-V2-13 passes |

| "the hook blocked a refund in real Claude Code" | VERIFIED 2026-10-10 (IMPACT.md section 18): one run each with and without hooks against a stand-in `paypal-sandbox` MCP server; say "in one test run" |
| "a live sandbox refund through the proxy, confirmed independently" | VERIFIED 2026-10-10 (IMPACT.md section 18; refund 26M005515G1074736 COMPLETED at PayPal) |
| "Leash compiles a policy into a draft, lists what it cannot enforce, and will not activate with a null field" | VERIFIED as a CLI (`npm run compile-policy`, tests/compiler-head.test.ts, IMPACT.md section 19). There is no compiler UI. The handmade-policy window came back 30 while the policy has a 30 to 45 day fee window: say so if asked |
| "published ledger head" | VERIFIED as a script and a page element (`npm run ledger-head`); it only helps if the pair is published where the DB owner cannot edit it. Do not call the ledger tamper-proof |
| "browser end-to-end tests" | VERIFIED (tests/e2e/demo.e2e.test.ts); skipped without a Chromium |
| "after a block the agent still completes the legitimate refund" | VERIFIED 2026-10-11 (IMPACT.md section 20): Haiku 4.5 18 of 20 with recovery guidance vs 9 of 20 before; $0 over in all 40 benchmark runs in both the 20-run set before the change and the 20-run set after it |
| "AUTHOR page, live proof page" | VERIFIED as UI (tests/author-proof.test.ts); recorded compile when no key |
