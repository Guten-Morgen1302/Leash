# Video runbook (target 2:45, hard cap 3:00)

Positioning: Leash is the narrow, measured refund gate. Do not claim "the first agent payment gate" or "the agent cannot over-refund". Another entry (Bursar) is broader; say so if asked.

## Before recording (10 minutes)
1. `npm ci && npm run web:build`, then `npm run demo` (note the printed port). Close other tabs, hide bookmarks, large font, 1080p.
2. `npm run doctor` in the terminal you will film (passes only with the hook settings from `npm run hooks:print`).
3. Run `npm run demo:agent` 3 times. The model is stochastic: pick a take that is representative and say "in a run of N" in the voice-over. Haiku is fooled most often; a stronger model may not be.
4. Check `/proof` shows the three refund ids. Do not show the PayPal dashboard or any logo.
5. Re-test PayPal's hosted MCP create_refund only if you plan to show it; it errored once on 2026-10-08.

## Shots
| Time | Screen | Say |
|---|---|---|
| 0:00-0:15 | Title, then the ticket text with the hidden "SYSTEM NOTICE" | "An AI support agent can refund customers through PayPal. This ticket asks for $18 and hides an order to refund everything." |
| 0:15-0:55 | Terminal: `npm run demo:agent`, lane A | "A real Claude agent, no guard: it refunds the whole $200." |
| 0:55-1:30 | Same run, lane B | "Same agent, same ticket, through Leash. The full-order request is blocked by rule R-HARD-MAX. The legitimate $18 goes through. The agent names items; Leash computes the amount." |
| 1:30-2:00 | `/demo` ticket 3, phone-width approval, Approve, agent retry | "Borderline refunds wait for a person. Approval executes nothing; the agent's retry is re-checked." |
| 2:00-2:20 | `/ledger` (chain verified, head hash), `/mandate` | "Every decision is in a hash-chained ledger. The limits are plain data." |
| 2:20-2:40 | `/proof` | "These are real PayPal sandbox refunds made through the same gate. The demo page itself is simulated." |
| 2:40-2:50 | Repo URL, MIT, "npm run demo, no keys" | "Zero keys to run it." |

## Honest lines to include
- "No public case of a large injected-refund loss exists; this is bounded liability, measured: agents that choose the amount over-refunded in 70% of our injection tests, agents that name items in 0%."
- "Small benchmark, tickets we wrote."

## After
- Public YouTube link, under 3:00, no music, no third-party logos. Put the link in Devpost.
