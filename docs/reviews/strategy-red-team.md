completed
## 1. Three rivals that beat this plan

**Rival A — "Hook Guardian": PreToolUse hook directly on PayPal's own AI Toolkit.**
Instead of a custom proxy + custom MCP server + custom demo agent, they write a Claude Code `PreToolUse` hook that intercepts calls to the *official* sandbox MCP tools (refund, invoice.send, dispute.accept, subscription.cancel), runs a policy check, and blocks/escalates inline in the Claude Code transcript. Demo: judge opens Claude Code with the toolkit installed, types "refund $900 on order X" themselves, watches it get blocked live. They open a PR against the toolkit repo (PayPal explicitly invited PRs). This beats Leash because it's 1/5th the build (no proxy, no bespoke agent, no second credential set, no "unguarded baseline" plumbing), runs inside the exact tool judges use daily, and is undeniably "central not bolted on." It ships by day 4, leaving 30 days for polish Leash won't have.

**Rival B — Polished autonomous shopping agent, full-stack, done extremely well.**
Leans into "a working example of an agent that moves money in a sandbox" literally: real catalog, real checkout orchestration, buyer-side step-up confirmation, clean UI, satisfying end-to-end purchase video. Beats Leash on Design and Presentation because "autonomous agent buys things" is viscerally demoable in 60 seconds, whereas Leash's pitch requires the viewer to first understand a threat model before the payoff lands. Also dodges Leash's single-source factual risk entirely — it isn't claiming a gap exists, it's just building the flagship thing PayPal is promoting.

**Rival C — Agentic dispute-resolution/evidence agent with built-in approval, not a bolt-on gate.**
Uses dispute + shipment + transaction APIs to auto-draft evidence responses, with human sign-off as a native step in a genuinely new workflow (not a block/allow wrapper). Beats Leash on Innovation and Potential Impact because it creates value (does useful agent work) rather than only preventing harm — judges comparing "stops a bad thing" vs. "does a new valuable thing with safety built in" often favor the latter for Impact/Innovation, and it directly subsumes Leash's "dispute accept always escalates" line item with something more substantive.

## 2. Top 8 reasons judges score this lower, ranked by impact

1. **Doesn't build on PayPal's own AI Toolkit/Claude Code/hooks at all.** Reinvents a parallel proxy + bespoke agent instead of extending the exact artifact the judges built and asked for PRs on. Dev-advocate judges will ask "why isn't this on our toolkit?" live — hits Innovation and "PayPal central, not bolted on" simultaneously.
2. **Core premise is one unverified third-party blog claim**, not checked against PayPal docs or a live sandbox/source read before most of the plan was written. If wrong or half-wrong, the villain narrative collapses in front of the people most likely to know — catastrophic, audience-specific risk.
3. **Demo relies on synthetic tickets / recorded replay**, not a live judge-driven action against real sandbox state — reads as theater, undercuts Technological Implementation and Presentation ("is this real or canned?").
4. **Day-1 spike is unresolved at plan-approval time** (can a captured payment even be seeded; is MCP reachable) — core technical viability is still a bet, with fallback language ("would have executed") that reads as hedging on camera.
5. **Defensive/governance framing is a harder sell than a constructive agentic-commerce story**, and is already a crowded genre (4 similar entries found) — risks "more polished, same category" rather than novel.
6. **Generic AG Grid table + CRUD-style approval page** — plan itself flags this as the main weakness; Design score risk.
7. **Solo, 36 days, large surface area** (proxy, MCP server, policy engine, DB, hash chain, web UI, agent harness, injection corpus, deploy) — anticipated stretch-cuts (mandate UI, npx/Docker, live LLM) are exactly the bits that separate "demo" from "product."
8. **Ledger "security" overclaims**: hash chain admitted tamper-evident only against partial edits, DB owner can rewrite everything. An engineer-judge who pokes at this will clock it as marketing veneer, damaging credibility on the exact axis (Technological Implementation) where this audience is most qualified to catch it.

## 3. Highest-leverage additions/cuts

**Add — rebuild the gate as a Claude Code `PreToolUse` hook wrapping the official sandbox MCP tools**, reusing the existing policy engine and ledger code, instead of a standalone proxy + bespoke demo agent. This is the single highest-leverage change: it fixes #1 and the riskiest assumption at once, and collapses "unguarded baseline" into "same Claude Code session, hook on vs. off" — no second credential set, no parallel infra.

**Add — open (or offer) a PR against the official AI Toolkit repo** with that hook. Cheap, verifiable, directly answers "central not bolted on" since they explicitly invited PRs.

**Add — make the injection demo judge-driven inside Claude Code** rather than a recorded synthetic-ticket replay. Kills risk #3, and plays better in a 3-minute video (interactive-feeling, visceral).

**Add — spend hours now reading the toolkit source + one real MCP call** to confirm or kill the "no gate exists" claim before building further. If a gate partially exists, reposition per the plan's own decision rule — don't discover this live in front of judges.

**Cut — the standalone HTTP proxy, custom MCP server, and bespoke demo agent.** If the hook-on-toolkit approach lands, this entire layer is unnecessary scope; reallocate the saved weeks to Design polish and rehearsal (Presentation is 20% of score).

**Cut/reframe — stop implying cryptographic non-repudiation for the ledger.** Call it a "structured audit trail," not tamper-proof; the plan's own threat model already admits the limitation — don't let a judge discover the gap, state it first.

**Add — a one-screenshot comparison ("PayPal's account-level limits" vs. "Leash's per-agent mandate")** baked into README/video now, preempting the obvious judge question instead of leaving it as an open question.

## 4. Riskiest assumption

That PayPal's sandbox MCP/AI Toolkit has **no built-in human-confirmation gate for merchant-side money-movement tools**, sourced from a single unverified third-party post — never confirmed against PayPal docs or toolkit source by people who will be judged *by the toolkit's own authors*. If false or partially false, it fails in the worst possible way: live, in front of the one audience qualified to catch it, taking Innovation, Technological Implementation, and Presentation down together.

Recommendation: before writing more code, spend day 1 verifying the "no gate" claim against the actual toolkit source/docs and one live sandbox call, then rebuild Leash as a PreToolUse hook on top of PayPal's own AI Toolkit instead of a parallel proxy+agent — because the judges wrote that toolkit and invited PRs to it, so this single pivot simultaneously fixes the top-ranked scoring risk, kills the riskiest factual assumption, and frees weeks of solo-builder time for the Design/Presentation polish that's worth a full fifth of the score.