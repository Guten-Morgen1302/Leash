completed
**1) Rank (novelty × impact credibility) / solo cost, and disposition**

| Idea | Novelty | Impact cred. | Cost | Verdict |
|---|---|---|---|---|
| C: item-scoped interface | Med | High (hard 70%→0% data) | ~0 (done) | **MUST-HAVE** |
| B: PayPal-state eligibility | Med-High | High (prevents double-loss, you already confirmed both endpoints return 200) | Low | **MUST-HAVE** |
| D: shadow mode | Low | Med (manufactures a $ figure for "no verified incident" gap) | Very low | **MUST-HAVE, cheap bonus** |
| A: policy compiler | High (ceiling) | Med-Low *today* (n=6, self-authored) | Med-High if you build the full sign-off/diff/testgen UI | **STRETCH — trim hard** |
| E: second-LLM anomaly score | Low | Low | Med | **CUT** — contradicts your own "deterministic" sales pitch; LLM-judging-LLM reads as unverified noise to a skeptical judge |
| F: multi-tool expansion | Low | Low | High | **CUT** — breadth kills depth in 30 days, mention only as roadmap |

Trim A: keep compile→schema + plain-language playback (cheap, directly answers "merchants can't edit JSON"). Cut the full auto-generated-conformance-UI scope; do a minimal diff-and-resign instead.

**2) Coherent product or feature pile?**

Coherent, if sequenced right: A sets the mandate, C shapes what the agent is allowed to ask for, B checks it against reality before money moves.

> "Leash turns a merchant's plain-English refund policy into a tamper-proof mandate that forces AI agents to ask for *what*, not *how much*, and cross-checks every request against PayPal's live truth — disputes, refund history, delivery, window — before any money moves."

If you pitch A, B, C as three separate features you'll read as a feature pile. Pitch them as three stages of one pipeline (author → authorize → verify) and it's one product.

**3) Top 4 compiler failure modes + cheapest mitigation**

1. **Prompt injection in policy text** (adversarial/compromised merchant input smuggling unsafe fields). Mitigation: output constrained to a strict whitelisted schema, reject anything outside it — no free-form fields, no generated code, ever.
2. **LLM misreads the policy** (date basis, exclusions vs caps). Mitigation: plain-language playback + a handful of boundary-case tickets the merchant must eyeball before sign-off — cheap, reuses your existing ticket-gen pattern.
3. **Drift on re-compile** (edits silently change agent behavior, or non-determinism across runs). Mitigation: pin temp=0, version the exact prompt+model, show a diff of old vs new mandate JSON, require explicit re-sign before activation.
4. **Trust of self-generated conformance tests** (compiler grading its own homework — correlated errors slip past review). Mitigation: mix in your existing hand-authored 5 manipulative-ticket templates (non-LLM-authored) into every sign-off set instead of trusting only LLM-generated tests.

**4) 30-day build order (demoable at every checkpoint)**

- **W1 (B):** wire dispute-check, already-refunded-amount check, delivery/return-window check into the gate. Checkpoint: re-run the manipulative-ticket eval plus "stale state" tickets (open dispute, already refunded, outside window) → deterministic blocks.
- **W2 (trimmed A):** compile step (temp=0, schema-validated) → plain-language playback → sign-off using existing + hand-authored adversarial tickets → minimal diff/resign. Checkpoint: paste policy in English, see it translated, approve, mandate goes live — run on 1-2 policies NOT written by you.
- **W3 (D + hardening):** shadow mode flag, run at larger scale for a defensible $/% figure; regression-test the full pipeline (compiler → item-scoped interface → state checks → audit chain) for interaction bugs.
- **W4:** get 2-3 outside people to write a real policy cold and run it through the compiler unassisted (your best shot at external validation); tighten demo script; freeze code by day 26; record backup video.
- **Days 29-30:** buffer/slides only.

Do not start E or F at any point.

**5) Scores for final scoped project (B + C + trimmed-A + D; E/F cut)**

- **Innovation: 7/10.** None of A/B/C is individually novel — the wedge is the specific combination plus the rigor of evidence (hash-chained, item-scoped, state-verified). Not 9+ because a judge will note each mechanism has precedent elsewhere.
- **Impact: 7/10.** Closes two of three named gaps (English policy editing, live-state safety) and shadow mode gives a dollar figure. Capped below 9 because: n is still small everywhere (6 policies, 5 ticket templates), and there is still no real incident — only simulated adversarial tickets.
- **Missing for 9+:** an outside party validating the compiler cold on their own un-coached policy (Week 4 addresses this but isn't guaranteed sufficient), and ideally one real-world-shaped refund dispute replayed through the system rather than synthetic tickets only.

Recommendation: Build B and D immediately, trim A to compile+playback+minimal resign, keep C as-is, and cut E and F outright — because that's the only subset with provable or cheaply-provable evidence inside 30 days, it reads as one coherent authorize-then-verify pipeline instead of a feature pile, and it leaves a full week of buffer for the external-validation step a 9+ score actually requires.