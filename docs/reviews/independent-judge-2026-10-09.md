# Independent hostile-judge scoring (Claude runner, 2026-10-09)
Input: IMPACT.md, DEVPOST.md excerpt, design doc, verified-facts list. Output verbatim:

completed
## INNOVATION/IDEA — 4/10

**Deductions (ranked):**

1. **−3: Core mechanism is explicitly admitted to be non-novel.** The doc itself states: "spending limits, approval flows and audit logs are known ideas in payments." Caps + approval + audit log is a 40-year-old pattern from card networks, corporate expense systems, and AWS IAM. Applying a known pattern to a new API surface is engineering, not invention.
   *Cheapest fix:* Rewrite the Devpost "Innovation" section to lead with the one piece that isn't a repackaging — see #3 below — instead of leading with "give your agent a budget, not your keys," which reads as a known idea restated.

2. **−2: The category itself is crowded, and judges will know it.** "Deterministic policy sidecar in front of risky LLM tool calls" is already a populated space in 2025–2026 (OPA-style policy engines for agents, Guardrails AI, Portkey, Credal, MCP's own permission model, plus at least one rival in this same hackathon per the Competitor Snapshot doing "spend bounds"). PayPal developer advocates judging this hackathon are exactly the audience most likely to have seen this pitch shape before.
   *Cheapest fix:* Add one explicit paragraph naming 2-3 of these and stating precisely what's different (race-free reservations, PayPal MCP specifically, hard-cap-survives-approval). A few hours of competitive writing, fully within the builder's control — but it caps the achievable score, it doesn't make the idea newly novel.

3. **−1: The most genuinely novel artifact (LeashBench) is positioned as supporting evidence for Impact, not foregrounded as the idea.** A reproducible benchmark quantifying model-specific refund-injection susceptibility is more original than the gate itself.
   *Cheapest fix:* Reframe the headline pitch as "we built the first reproducible benchmark for refund-injection susceptibility, and a gate that neutralizes the gap it measures" — free, just a rewrite.

**Rival idea types that would score higher on Innovation:** (a) semantic/contextual anomaly detection across a ticket thread as the control mechanism itself, with caps as backstop, rather than caps alone; (b) capability-based security — cryptographically attenuated, per-ticket tokens (macaroon-style) that physically restrict what the agent can ask for, shifting from "catch at the gate" to "cannot ask"; (c) a live, continuously-regenerating adversarial benchmark that auto-tunes the mandate, rather than a one-time static measurement.

---

## POTENTIAL IMPACT — 5/10

**Deductions (ranked):**

1. **−2: Zero market validation.** Self-admitted: "Merchant demand is unvalidated," no merchant has been interviewed. The named primary audience's actual appetite for this is asserted, not shown.
   *Cheapest fix:* IMPACT.md already names this fix — 2-3 conversations with real merchant/support leads before submission, one verbatim quote with permission. Fully doable solo, days of effort, biggest ROI on this score of anything listed here.

2. **−1: No verified real-world incident of the exact claimed threat** (large-scale AI-agent-executed refund fraud). Air Canada is a static chatbot promise, not an agent with refund-tool access; the UK discount case is contested/anecdotal. The "real problem" is anticipatory, not demonstrated-as-currently-bleeding.
   *This one is largely impossible for the builder to fix alone* — it requires an incident existing in the world. The honest "bounded liability before the first incident" framing is the correct mitigation already in use; there's no cheap way to manufacture a real incident, only to keep disclaiming its absence (which the team is already doing well).

3. **−1: Structural mismatch between stated audience and shipped control surface.** The primary audience is explicitly "a merchant... with no engineering team to write approval logic," yet the only control surface is a hand-edited `mandate.json`. The people named as needing this can't use it as shipped.
   *Cheapest fix:* Either ship a minimal read-only plain-language view of the mandate (not a full dashboard — a few hours), or quietly reposition the primary audience in the copy to "the developer who configures this for the merchant" (the doc's own secondary audience), which costs nothing but a rewrite and makes the claim match the artifact.

4. **−1: The benchmark is small, self-authored, and the Leash column is a replay, not a live guarded run.** 34 and 50 runs, one prompt family, tickets written by the same team that built the gate, stand-in (non-live) tool. Judges will reasonably read this as directional, not proof.
   *Cheapest fix:* One live (not replayed) enforcement run against the real sandbox, plus a handful of tickets authored by someone other than the builder, within the existing time budget.

**What a 10/10 Impact entry would have that this lacks:** a real pilot merchant or a documented letter of intent/verbatim validation from the stated target audience; a live (not replayed) adversarial demo with some third-party-authored attacks; a control surface usable by a non-engineer that matches the claimed audience; and at least one real, attributable financial-loss incident involving an AI agent (not an adjacent precedent like a static airline chatbot).

---

Recommendation: Submit, but spend remaining time on validation (merchant quote) and the audience/UI mismatch rather than more engineering, because the project's ceiling on both judged criteria is currently capped by unvalidated demand and a self-admitted non-novel core mechanism — polish to the concurrency/approval machinery (already strong) won't move either score, but even one real merchant quote and a plain-language mandate view would meaningfully move Impact, and reframing around LeashBench would meaningfully move Innovation.