# Impact and idea: the sourced case (written 2026-10-09)

Purpose: answer the two judging criteria "Potential Impact" (a credible, specific case for a real problem and a real audience) and "Innovation/Idea". Every external claim below has a source and a confidence label. **Rule: use only claims marked USE in the Devpost text and video. Nothing marked DO NOT USE may appear anywhere.**

## 1. The real audience (specific, not "merchants")
**Primary:** a small or mid-size online merchant, or its support lead, that already uses (or is about to use) an AI agent to handle refund and billing tickets against PayPal. They have a PayPal account, a support inbox, and no engineering team to write approval logic.
**Secondary:** the developer who builds that agent (the person PayPal's own AI Toolkit and MCP server are for) and has to answer "what stops it refunding the wrong thing?" before the merchant lets it run.
**Why now:** PayPal itself ships a toolkit and MCP server that give an agent refunds, invoices and disputes, and the kickoff presenters called it "a working example of an agent that moves money". The toolkit's only native control is a per-action on/off switch (verified in source: `docs/reviews/mcp-tool-payloads.md`). Nothing sits between "refund tool enabled" and "any valid refund executes".

## 2. The problem, with evidence (and its limits)

| Claim | Source | Confidence | Use? |
|---|---|---|---|
| OWASP's Top 10 for LLM applications lists **Excessive Agency** (too much functionality, permissions or autonomy, with no human in the loop for high-impact actions); its worked example is a support assistant on a billing platform tricked into unauthorized refunds. The 2025 list expanded the entry for agents; one source places it at LLM03 in 2026 | outpost24.com/blog/owasp-top-10-llm-risks-explained; csoonline.com/article/575497; aws prescriptive guidance "Mapping to OWASP top 10 for LLM applications" | High that the category and example exist; the 2026 rank is single-sourced | USE the category and example; do NOT quote a rank number |
| **Merchants are liable for what their chatbot says and does**: Air Canada's bot invented a refund policy and a tribunal rejected the "separate legal entity" defense and ordered damages (2024) | vibegraveyard.ai and cmswire.com coverage; the ruling is widely reported | Medium-high (secondary reporting; verify the case name and date before quoting) | USE as "courts have held companies responsible for their chatbot's commitments"; add the exact citation after verifying |
| A UK small business's after-hours chatbot was talked from a 25% to an **80% discount on an £8,000 order** (Feb 2026); the owner cancelled and refunded after a small-claims threat | aardwolfsecurity.com and vibegraveyard.ai (they disagree whether it is "prompt injection"; the long conversation was the attack) | Medium (small outlets, one incident) | USE carefully as "a documented small-merchant incident where a bot was persuaded into an unauthorized commitment"; do not call it prompt injection |
| Refund and return **fraud and abuse is large**: Appriss Retail estimates **$100B of preventable loss in 2025** (about $14B outright fraud, about $86B policy abuse) on $706B of returns | retailcustomerexperience.com ("Retailers loss from returns, shrink in 2025 hit $796B"), chargeflow.io, claimlane.com summarizing Appriss | Medium-high for the figure; it is mostly abuse, not crime, and **it is about human returns, not AI agents** | USE only as "refund abuse is an expensive, well-known problem for merchants"; never imply agents cause it |
| One in four shoppers admitted abusing refund policies; 98% succeeded | Ravelin "State of Refund Abuse 2026" via riskified/chargeflow summaries | Medium (secondary) | OPTIONAL; verify against the Ravelin report before quoting |
| "$150K+ direct losses and 2,400 fraudulent orders from a prompt-injected e-commerce bot" | an unnamed listicle | **Unsourced** | **DO NOT USE** |
| McDonald's AI bot exploit | Fast Company reports it did not happen | Fabricated | **DO NOT USE** |
| "$32,000 emergency refunds" (Medium anecdote) | first-person post about an insulting bot, not an injection | Unverifiable | **DO NOT USE** |

**The honest framing this forces:** there is no verified public case of a large loss from an injected refund agent, because merchants are only starting to give agents money tools. The argument is therefore **bounded liability before the first incident**, not "an epidemic is here". That is a stronger, more defensible pitch: it survives a judge who knows the incident record is thin.

## 3. What Leash changes, in numbers we can defend
These are properties of the design with the demo mandate (`docs/policy.md`), each backed by a test:
- **Worst-case daily exposure is a known number, not unbounded.** Hard daily cap $400, hard max per refund $100, per-capture refunds never exceed what was captured. An agent that has been fully compromised still cannot move more than the mandate allows in 24 hours.
- **Routine work is not slowed:** refunds at or under $50 and under the daily soft cap go through with no human. Only borderline refunds wait.
- **The merchant keeps a record:** every decision (allow, block, escalate, approve, deny) is in a hash-chained audit trail with the rule id and reason, which is the artifact a merchant needs after a dispute ("what did the agent do and why was it allowed").
- **Nothing is claimed about detecting attacks.** Leash does not detect injection; it bounds what a successful one can cost.

## 4. The quantified demo moment (new, cheap, high impact)
Add an **Exposure meter** to `/demo` and `/ledger`: "Exposure today: $X of $400 hard cap" (derived from the same window-sum query the policy uses; no new logic). It turns the abstract claim into a number a merchant understands on sight, and it gives the video a concrete beat: the unguarded lane shows "Exposure: unlimited" and the guarded lane shows "Exposure: capped at $400". Also a one-line merchant framing under the outcome: "Without Leash, this one ticket cost $200. With Leash it cost $0 and the $18 refund went through."

## 5. Innovation: what is actually different (and what is not)
Four public entries in this hackathon were checked at README level (see `docs/PLAN.md`, Competitor Snapshot). Honest comparison:

| Dimension | Typical entry | Leash |
|---|---|---|
| What it does | an AI agent that does a payments task, or an advisory fraud score | a **deterministic gate between any agent and PayPal's money tools**, agent-agnostic |
| Where the control lives | in the model's judgment or prompt | outside the model, in code, fail-closed |
| Concurrency | not addressed | single-writer transaction, reservations, tested with real worker-thread contention |
| Approval | none or "human in the loop" as a slogan | state machine: single-use token in the URL fragment, re-checks hard rules at approval, single-use grant consumed on retry |
| Credential custody | agent holds the key | proxy mode: the agent never holds the PayPal token (verified: the token IS readable by an agent's shell in the normal setup) |
| Evidence | screenshots | a runnable prototype, 54 passing tests, a real sandbox refund confirmed at PayPal, and a threat model that states its own limits |
**What is not novel, said plainly:** spending limits, approval flows and audit logs are known ideas in payments. The contribution is applying them at the right seam for AI agents on PayPal's real MCP surface, with concurrency and approval races handled and verified, and with an honest account of what a hook cannot stop.
**Platform angle (kept honest):** the policy engine is a pure function over a mandate, so other money tools (invoices, disputes, subscriptions) are rule rows plus an adapter, not a redesign. The hackathon build ships refunds only.

## 6. Devpost wording (replace the Impact paragraph with this; keep it true)
"Merchants are starting to let AI agents handle refund tickets, and OWASP now lists this as a top risk: Excessive Agency, an agent with too much power and no human in the loop. Courts have already held companies responsible for what their chatbots promise, so the question every merchant asks is: what is the worst this agent can do? With PayPal's toolkit the answer today is 'anything the refund tool allows'. Leash answers it with a number: with the demo mandate, a fully compromised agent cannot move more than $400 in a day, routine refunds still go through untouched, borderline ones wait for a human, and every decision is recorded with its reason. In our demo the same agent and the same ticket send a full $200 refund without Leash and only the legitimate $18 with it, against PayPal's real sandbox."

## 7. Remaining gaps we cannot close by writing
- **No verified incident of a large injected-refund loss exists**; we say "bounded liability before the first incident".
- **Merchant demand is unvalidated.** Cheap fix before submission: show the video and README to 2 to 3 real merchants or e-commerce support leads and record one verbatim quote ("would you let an agent refund without this?"). Use a quote only with permission. This is a task for you, not for code.
- **Air Canada and Ravelin citations** should be verified against their primary sources before the exact figures appear in the final text.
