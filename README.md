# Leash

> Give your AI agent a refund budget, not your PayPal keys.

**Status: planning stage. There is no runnable code yet.** This README will be replaced with the 3-step run instructions (`npm ci`, `npm run demo`) when the build exists. Everything in `docs/` describes the target design; see [docs/README.md](docs/README.md) for the index and [docs/PLAN.md](docs/PLAN.md) for the locked plan.

Leash is a policy gate for AI agents that can move money through PayPal. It runs as an MCP proxy that holds the PayPal credential (so the agent never has it), in front of PayPal's sandbox refund API; a Claude Code hook mode for PayPal's own toolkit is planned. It decides allow, escalate or block against a mandate, asks a human to approve borderline actions, and records every decision in a hash-chained audit trail. PayPal sandbox only.

## Design notes

### Separation of concerns: policy is data, not code
Leash's policy engine is a pure function: it takes the action, the current state and a mandate, and returns a decision. Every limit (per-refund cap, daily cap, hard limits, allowlists, expiry) is injected data read from `mandate.json`, never hardcoded logic. Changing a limit never means changing code.

### Production vision (and what the hackathon MVP is)
In this hackathon build the mandate is a static, version-stamped JSON file. That is a deliberate scoping choice: the time went into the hard part, a correct, race-free, auditable gate, rather than a settings screen. The same schema is the contract a merchant dashboard would edit, so an operations team could raise refund caps for a holiday sale and lower them afterward without engineering involvement. In production those edits would themselves be permissioned and recorded in the audit trail with the mandate version. No dashboard, hot reload or role-based editing exists in this build.

## What this is not
- Not a security boundary against someone who controls the machine, the agent's credentials or the settings: it is a guardrail for an agent you run. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).
- Not tamper-proof: the audit trail is tamper-evident against partial edits only.
- Sandbox only; no real money.

License: MIT (LICENSE file to be added with the first commit).
