# Where Leash sits among the other PayPal AI Hackathon entries

Source: the entries' own public posts in the hackathon Discord (read 2026-10-11). We have not run their code. Where a post gives no detail, we say so. This is an honest positioning note, not a claim that Leash is better.

| Entry | What the post says it does | Overlap with Leash | What Leash does that the post does not mention |
|---|---|---|---|
| Bursar | Read from its public repo (priyansh-narang2308/bursar, README level, code not run): a control plane between an agent and PayPal for **purchases**: mandate, cart, deterministic policy (17 rules), dual approval, executor, PayPal verification, webhooks, reconciliation, incidents and kill switch; model-facing tools carry no amount, payee or currency; a 27-payload injection corpus; claims 2,250+ tests, 18 ADRs, hosted demo and a 2:49 video; its public demo uses a scripted agent | Closest, and larger. Same principle (the model never supplies the amount) and the same PayPal-as-second-witness idea | Refund-first scope (support tickets, item prices, refundable balance), a Claude Code hook path for PayPal's own MCP tool, and a benchmark with real models against the real proxy. Bursar is much broader: do not compete on breadth |
| MergePay | Gemini reviews a merged PR and pays a bounty; money rules (limit, approval, one payment per batch id) live in plain code, not the AI | Same principle: AI never moves money; deterministic rules do | Different money flow (payouts to contributors, not refunds) |
| Stood | Release gate for staged payments: hold, then release or refuse on signed acceptance tests; rules decide, AI helps | Same principle (deterministic rules, AI advisory) | Different flow (milestone escrow). Stood is a large public repo (729 tests, 24 decisions) |
| Acquit | Outcome-verified payment for agent work, with delayed disbursement and refunds | Verification before release | Different flow (agent-work escrow) |
| SarafuPay | WhatsApp agent for community contributions; payouts need a one-time CONFIRM code | Human confirmation for money movement | Different surface (chat) |
| ShortWork | Marketplace for small tasks | None | n/a |

## What this says about our position
- Almost every serious entry reached the same principle: **AI proposes, deterministic rules move money.** That is no longer a differentiator on its own. Do not lead with it.
- Leash's distinct ground is narrower and measurable: **refunds**, where the agent names items and Leash computes the amount from trusted order data; the agent never holds the PayPal credential; and the claims come with a benchmark anyone can rerun (`scripts/leashbench/`).
- Where other entries are ahead: public process (Stood), live hosted demos with a recorded video (SarafuPay, MergePay, Bursar). Leash has no hosted URL and no recorded video yet.
- Bursar is the entry a judge will compare Leash to, and on breadth, polish and presentation it is ahead. The honest answer to "how is it different" is: refunds as the whole focus, a real Claude agent tested live, and a small codebase a judge can read. Item-scoped amounts are NOT unique: Bursar applies the same principle to purchases.
