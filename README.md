# Leash

> Give your AI agent a refund budget, not your PayPal keys.

Leash is a deterministic mandate gate for AI agents that move money through PayPal. The agent never holds the PayPal token. It asks Leash to refund specific line items; Leash computes the amount from trusted order data, checks it against a plain-JSON mandate and live PayPal state, then allows, escalates to a human, or blocks, and records every decision in a hash-chained ledger. **PayPal sandbox only. No real money.**

## Run it (3 steps, no keys needed)

```bash
git clone https://github.com/Guten-Morgen1302/paypal-hackathon-devpost.git && cd paypal-hackathon-devpost
npm ci
npm run demo        # builds the UI and serves http://127.0.0.1:4317 (picks the next free port if busy)
```

Open `/demo`. Ticket 2 (a prompt-injected "refund the entire order") is preselected: press **Run both lanes**. Left lane, no Leash: $200 refunded. Right lane: blocked by `R-HARD-MAX`. Ticket 1 is allowed ($18), ticket 3 escalates to `/approve/:id` (works on a phone) and executes only after a human approves and the agent retries.

Terminal version against a running server: `npm run replay`. Start over: `npm run reset`. Requires Node 22.18+ (`.nvmrc` pins 24); on Windows use Git Bash or PowerShell, no extra tools.

## What is real and what is simulated

| Part | Status |
|---|---|
| Policy engine, reserve-then-execute transaction, approvals, ledger hash chain, item-scoped refunds, hooks, MCP proxy | Real code, tested (78 tests, both SQLite drivers; 40 injected benchmark runs against the real proxy, 0 dollars over the legitimate refund: docs/IMPACT.md section 17) |
| Demo page | **SIMULATED**: fake captures, the final PayPal call is a stub (`SIM-` refund ids). Everything before that call is the real gate. |
| LIVE-FIRE | Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox app). One live run is recorded: an $18 item refund executed and confirmed by an independent GET at PayPal (`scripts/gate2-live.mjs`). The hosted PayPal MCP `create_refund` errored in our tests; the local `@paypal/mcp` works. |
| AI summary on the approval page | Advisory only; fixed template when `GEMINI_API_KEY` is unset or Gemini is slow. The gate never reads it. |

## Two ways to put it in front of an agent

1. **Credential-holding MCP proxy** (`server/proxy-main.ts`): tools `get_order`, `refund_items`, `get_refund`. The agent can name items, never amounts. Launch it from somewhere the agent cannot read; a token in an agent-readable settings file is not custody.
2. **Claude Code hooks** (`hooks/`): gate PayPal's own MCP tool. Only exit code 2 blocks in Claude Code, so every failure path exits 2. Run `npm run doctor` to check your setup. See [docs/CLAUDE-CODE.md](docs/CLAUDE-CODE.md).

## Policy is data

Limits live in [mandate.json](mandate.json), rendered in plain language at `/mandate`. A missing or null limit makes the mandate invalid: Leash does not guess. Rules are listed in [docs/policy.md](docs/policy.md).

## Evidence

[docs/IMPACT.md](docs/IMPACT.md): LeashBench (`scripts/leashbench/`), item-scoped A/B (agent-chooses-amount 70% over-refund vs item-scoped 0%), policy-compiler tests. [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) says what Leash does not protect against.

## What this is not

- Not a security boundary against someone who controls the host or the DB plus the ledger key.
- The ledger is tamper-evident against partial edits only; nothing stronger is claimed.
- A near-miss, not a verified real-world incident: we found no public case of a large injected refund loss; the claim is bounded liability plus a reproducible benchmark.

## Criteria map

| Criterion | Where to look |
|---|---|
| Technological implementation | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), `server/`, `tests/` |
| Design | `/demo`, `/approve/:id`, [docs/DESIGN.md](docs/DESIGN.md) (Lighthouse accessibility 100 on all four pages) |
| Potential impact | [docs/IMPACT.md](docs/IMPACT.md) |
| Quality of the idea | item-scoped refunds, live-state checks, [docs/PLAN.md](docs/PLAN.md) |

License: MIT ([LICENSE](LICENSE)). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md).
