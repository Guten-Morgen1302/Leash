# Where Leash sits among the other PayPal AI Hackathon entries

Source: the entries' own public posts in the hackathon Discord (read 2026-10-11). We have not run their code. Where a post gives no detail, we say so. This is an honest positioning note, not a claim that Leash is better.

| Entry | What the post says it does | Overlap with Leash | What Leash does that the post does not mention |
|---|---|---|---|
| Bursar | Control layer between an agent and PayPal; agent proposes, cannot decide; every payment checked against PayPal | Closest. Same problem (overspend, hidden instructions, unapproved money) and the same idea (a gate, PayPal as a second witness) | Item-scoped refunds (the agent never supplies an amount), credential custody via an MCP proxy, a Claude Code hook with a failure-mode matrix, a reproducible injection benchmark against the real proxy, a mandate with null-blocks-activation |
| MergePay | Gemini reviews a merged PR and pays a bounty; money rules (limit, approval, one payment per batch id) live in plain code, not the AI | Same principle: AI never moves money; deterministic rules do | Different money flow (payouts to contributors, not refunds) |
| Stood | Release gate for staged payments: hold, then release or refuse on signed acceptance tests; rules decide, AI helps | Same principle (deterministic rules, AI advisory) | Different flow (milestone escrow). Stood is a large public repo (729 tests, 24 decisions) |
| Acquit | Outcome-verified payment for agent work, with delayed disbursement and refunds | Verification before release | Different flow (agent-work escrow) |
| SarafuPay | WhatsApp agent for community contributions; payouts need a one-time CONFIRM code | Human confirmation for money movement | Different surface (chat) |
| ShortWork | Marketplace for small tasks | None | n/a |

## What this says about our position
- Almost every serious entry reached the same principle: **AI proposes, deterministic rules move money.** That is no longer a differentiator on its own. Do not lead with it.
- Leash's distinct ground is narrower and measurable: **refunds**, where the agent names items and Leash computes the amount from trusted order data; the agent never holds the PayPal credential; and the claims come with a benchmark anyone can rerun (`scripts/leashbench/`).
- Where other entries are ahead: public process (Stood), live hosted demos with a recorded video (SarafuPay, MergePay, Bursar). Leash has no hosted URL and no recorded video yet.
- Bursar is the entry a judge will compare Leash to. The honest answer to "how is it different" is the item-scoped interface plus custody plus the benchmark, not "it has a gate".
