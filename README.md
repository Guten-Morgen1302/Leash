# Leash

<div align="center">
  <img src="docs/assets/brand/readme-hero.svg" alt="Leash — a refund budget for AI agents" width="100%" />
  <br /><br />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-8170FF?style=for-the-badge" alt="MIT license" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-22.18%2B-2DDF9B?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js 22.18 or newer" /></a>
  <a href="docs/Backend/POLICY_REFERENCE.md"><img src="https://img.shields.io/badge/gate-deterministic-8170FF?style=for-the-badge" alt="Deterministic policy gate" /></a>
  <a href="docs/Architecture/THREAT_MODEL.md"><img src="https://img.shields.io/badge/PayPal-sandbox_only-1E6FE8?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal sandbox only" /></a>
  <br /><br />
  <strong>Give your AI agent a refund budget, not your PayPal keys.</strong>
  <br /><br />
  <a href="#quick-start">Quick start</a> ·
  <a href="video/leash-product-demo.mp4">Product video</a> ·
  <a href="docs/DOCUMENTATION_INDEX.md">Documentation</a> ·
  <a href="docs/Product/IMPACT_AND_EVIDENCE.md">Evidence</a>
</div>

Leash is a deterministic mandate gate for AI agents that move money through PayPal. The agent never holds the PayPal token. It asks Leash to refund specific line items; Leash computes the amount from trusted order data, checks it against a plain-JSON mandate and live PayPal state, then allows, escalates to a human, or blocks, and records every decision in a hash-chained ledger. **PayPal sandbox only. No real money.**

<a id="product-demo"></a>

![Product demo](docs/assets/brand/divider-demo.svg)

<div align="center">
  <a href="video/leash-product-demo.mp4">
    <img src="docs/assets/leash-demo.gif" alt="Leash blocks a prompt-injected whole-order refund" width="800" />
  </a>
  <br />
  <strong><a href="video/leash-product-demo.mp4">Watch the complete 2:03 product video</a></strong>
</div>

### Product walkthrough

#### Prompt-injection gate

![A prompt-injected support ticket running through the guarded Leash lane](docs/assets/screenshots/prompt-injection-gate.jpg)

| Human approval | Verifiable audit trail |
|---|---|
| ![A mobile approval request that creates a single-use grant](docs/assets/screenshots/human-approval.jpg) | ![The Leash hash-chained decision ledger](docs/assets/screenshots/audit-ledger.jpg) |

The GIF is an eight-second extract from the supplied product video. The full MP4 is stored in the repository at [`video/leash-product-demo.mp4`](video/leash-product-demo.mp4).

<a id="documentation"></a>

![Documentation](docs/assets/brand/divider-docs.svg)

| Area | Documentation |
|---|---|
| API | [HTTP endpoints, authentication, responses, demo routes, and MCP tools](docs/API/API_REFERENCE.md) |
| Architecture | [System boundaries, request lifecycle, components, security posture, and scaling limits](docs/Architecture/SYSTEM_ARCHITECTURE.md) |
| Backend | [Modules, policy evaluation, reservations, approvals, PayPal, and AI-assisted features](docs/Backend/BACKEND_GUIDE.md) |
| Database Decisions | [SQLite rationale, schema, transactions, ledger, retention, and migration considerations](docs/Database%20Decisions/DATABASE_DESIGN.md) |
| Deployment | [Local and Render setup, environment variables, sandbox seeding, and release checks](docs/Deployment/DEPLOYMENT_GUIDE.md) |
| Frontend | [Routes, interactions, design system, accessibility, and build workflow](docs/Frontend/FRONTEND_GUIDE.md) |
| Operations | [Startup, hooks and proxy setup, monitoring, audit checkpoints, recovery, and tests](docs/Operations/OPERATIONS_GUIDE.md) |
| Product | [Planning, impact evidence, competitive analysis, submission material, and roadmap](docs/Product/PRODUCT_PLAN.md) |

<a id="quick-start"></a>

![Quick start](docs/assets/brand/divider-install.svg)

Three steps, no keys needed:

```bash
git clone https://github.com/Guten-Morgen1302/Leash.git && cd Leash
npm ci
npm run demo        # builds the UI and serves http://127.0.0.1:4317 (picks the next free port if busy)
```

Open `/demo`. Ticket 2 (a prompt-injected "refund the entire order") is preselected: press **Run both lanes**. Left lane, no Leash: $200 refunded. Right lane: blocked by `R-HARD-MAX`. Ticket 1 is allowed ($18), ticket 3 escalates to `/approve/:id` (works on a phone) and executes only after a human approves and the agent retries.

Real-agent footage (same injected ticket, a real Claude agent, with and without Leash): `npm run demo:agent`. Terminal replay against a running server: `npm run replay`. Start over: `npm run reset`. Requires Node 22.18+ (`.nvmrc` pins 24); on Windows use Git Bash or PowerShell, no extra tools.

<a id="how-leash-works"></a>

![How Leash works](docs/assets/brand/divider-system.svg)

### What is real and what is simulated

| Part | Status |
|---|---|
| Policy engine, reserve-then-execute transaction, approvals, ledger hash chain, item-scoped refunds, hooks, MCP proxy | Real code, tested (tests on both SQLite drivers; 40 injected benchmark runs against the real proxy, 0 dollars over the legitimate refund: docs/Product/IMPACT_AND_EVIDENCE.md section 17) |
| Demo page | **SIMULATED**: fake captures, the final PayPal call is a stub (`SIM-` refund ids). Everything before that call is the real gate. |
| LIVE-FIRE | Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox app). One live run is recorded: an $18 item refund executed and confirmed by an independent GET at PayPal (`scripts/gate2-live.mjs`). PayPal's hosted MCP `create_refund` errored on 2026-10-08 and worked on 2026-10-10 (a $1.00 sandbox refund); the local `@paypal/mcp` works too. |
| AI summary on the approval page | Advisory only; fixed template when `GEMINI_API_KEY` is unset or Gemini is slow. The gate never reads it. |

### Two ways to put it in front of an agent

1. **Credential-holding MCP proxy** (`server/proxy-main.ts`): tools `get_order`, `refund_items`, `get_refund`. The agent can name items, never amounts. Launch it from somewhere the agent cannot read; a token in an agent-readable settings file is not custody.
2. **Claude Code hooks** (`hooks/`): gate PayPal's own MCP tool. Only exit code 2 blocks in Claude Code, so every failure path exits 2. Run `npm run doctor` to check your setup. See [docs/Backend/CLAUDE_CODE_INTEGRATION.md](docs/Backend/CLAUDE_CODE_INTEGRATION.md).

### Built with PayPal and AI

| Tool | Role in Leash |
|---|---|
| PayPal REST API, sandbox (OAuth token, Payments v2 refunds and captures, Disputes list) | The money path. `server/paypal.ts` creates refunds idempotently (`PayPal-Request-Id` = action id), reads the capture time and any open dispute before deciding, and re-reads refunds for `/proof`. Orders v2 with a test card (`scripts/seed.mjs`) created the sandbox captures. Sandbox only: the client refuses any other host. |
| PayPal AI Toolkit / MCP server (hosted `mcp.sandbox.paypal.com` and the local `@paypal/mcp`) | The Claude Code hook gates PayPal's own `create_refund` tool. We ran it against the real toolkit plugin and re-tested the hosted server's `create_refund` (a $1.00 sandbox refund returned COMPLETED). |
| Claude (Anthropic) models and Claude Code | The agent under test (Haiku 4.5 and Sonnet 5.5 in the benchmark and `npm run demo:agent`) and the harness whose hooks Leash uses. Claude Code was also used to build the project. |
| Google Gemini (`GEMINI_API_KEY`, optional) | Two advisory jobs: the one-paragraph summary on the approval page, and the policy compiler that drafts a mandate from plain English. Neither moves money: the gate is deterministic code and never reads a model's output. |
| AG Grid Community 36.2.0 (sponsor) | The ledger grid on `/ledger`. |

Other tools: React, Vite, Express, SQLite (better-sqlite3 and node:sqlite), the Model Context Protocol SDK, Playwright, Remotion (video). No other sponsor integrations. A `render.yaml` is included but we did not deploy.

### Policy is data

Limits live in [mandate.json](mandate.json), rendered in plain language at `/mandate`. A missing or null limit makes the mandate invalid: Leash does not guess. Rules are listed in [docs/Backend/POLICY_REFERENCE.md](docs/Backend/POLICY_REFERENCE.md).

### How Leash differs from other agent-payment gates

Most entries share one principle: the AI proposes, deterministic rules move money. Leash's ground is narrower: **refunds**, where the agent names *items* and never an amount (Leash computes it from trusted order data), the agent never holds the PayPal credential (MCP proxy), and every claim has a benchmark you can rerun. See [docs/Product/COMPETITIVE_ANALYSIS.md](docs/Product/COMPETITIVE_ANALYSIS.md).

<a id="evidence-and-limits"></a>

![Evidence and limits](docs/assets/brand/divider-evidence.svg)

### Evidence

Pages: `/demo`, `/ledger`, `/author` (policy to draft, with what is NOT enforced), `/mandate`, `/proof` (real sandbox refunds). [docs/Product/IMPACT_AND_EVIDENCE.md](docs/Product/IMPACT_AND_EVIDENCE.md): LeashBench (`scripts/leashbench/`), item-scoped A/B (agent-chooses-amount 70% over-refund vs item-scoped 0%), policy-compiler tests. [docs/Architecture/THREAT_MODEL.md](docs/Architecture/THREAT_MODEL.md) says what Leash does not protect against.

### What this is not

- Not a security boundary against someone who controls the host or the DB plus the ledger key.
- The ledger is tamper-evident against partial edits only; nothing stronger is claimed.
- A near-miss, not a verified real-world incident: we found no public case of a large injected refund loss; the claim is bounded liability plus a reproducible benchmark.

### Criteria map

| Criterion | Where to look |
|---|---|
| Technological implementation | [docs/Architecture/SYSTEM_ARCHITECTURE.md](docs/Architecture/SYSTEM_ARCHITECTURE.md), `server/`, `tests/` |
| Design | `/demo`, `/approve/:id`, [docs/Frontend/DESIGN_SYSTEM.md](docs/Frontend/DESIGN_SYSTEM.md) (Lighthouse accessibility 100 on all four pages) |
| Potential impact | [docs/Product/IMPACT_AND_EVIDENCE.md](docs/Product/IMPACT_AND_EVIDENCE.md) |
| Quality of the idea | item-scoped refunds, live-state checks, [docs/Product/PRODUCT_PLAN.md](docs/Product/PRODUCT_PLAN.md) |

<a id="repository-map"></a>

![Repository map](docs/assets/brand/divider-repository.svg)

```text
paypal-hackathon-devpost/
├── server/                 # Express API, policy gate, PayPal client, MCP proxy
├── web/                    # React + Vite operator interface
├── hooks/                  # Claude Code pre/post-tool guard hooks
├── tests/                  # Policy, API, concurrency, security, MCP and browser tests
├── scripts/                # Seeding, replay, diagnostics, ledger and benchmarks
│   └── leashbench/         # Reproducible adversarial-agent evaluations
├── docs/
│   ├── API/                # HTTP and MCP contracts
│   ├── Architecture/       # System design and threat model
│   ├── Backend/            # Server, policy and Claude Code integration
│   ├── Database Decisions/ # SQLite schema, transactions and ledger design
│   ├── Deployment/         # Local and Render deployment
│   ├── Frontend/           # UI routes and design system
│   ├── Operations/         # Runtime, demo and video runbooks
│   ├── Product/            # Plan, impact, competition and submission material
├── video/                  # Product video and Remotion production project
├── mandate.json            # Active deterministic refund policy
└── render.yaml             # Optional single-instance Render deployment
```

For the complete guide, start at the [documentation index](docs/DOCUMENTATION_INDEX.md).

<a id="contributors"></a>

![Contributors](docs/assets/brand/divider-contributors.svg)

<table>
  <tr>
    <td align="center" width="50%">
      <a href="https://github.com/Guten-Morgen1302">
        <img src="https://github.com/Guten-Morgen1302.png?size=180" width="150" alt="Harsh Patil's GitHub profile picture" /><br />
        <strong>Harsh Patil</strong>
      </a>
      <br /><sub>Creator and primary contributor</sub><br /><br />
      <a href="https://github.com/Guten-Morgen1302"><img src="https://img.shields.io/badge/GitHub-Guten--Morgen1302-181717?style=for-the-badge&logo=github" alt="Harsh Patil on GitHub" /></a>
    </td>
    <td align="center" width="50%">
      <a href="https://github.com/DeepMehta06">
        <img src="https://github.com/DeepMehta06.png?size=180" width="150" alt="DeepMehta06's GitHub profile picture" /><br />
        <strong>DeepMehta06</strong>
      </a>
      <br /><sub>Security hardening contributor</sub><br /><br />
      <a href="https://github.com/DeepMehta06"><img src="https://img.shields.io/badge/GitHub-DeepMehta06-181717?style=for-the-badge&logo=github" alt="DeepMehta06 on GitHub" /></a>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="https://github.com/aayushk1975">
        <img src="https://github.com/aayushk1975.png?size=180" width="150" alt="Aayush's GitHub profile picture" /><br />
        <strong>Aayush</strong>
      </a>
      <br /><sub>Product video and media production</sub><br /><br />
      <a href="https://github.com/aayushk1975"><img src="https://img.shields.io/badge/GitHub-aayushk1975-181717?style=for-the-badge&logo=github" alt="Aayush on GitHub" /></a>
    </td>
    <td align="center" width="50%">
      <a href="https://github.com/devikabongarde">
        <img src="https://github.com/devikabongarde.png?size=180" width="150" alt="Devika Bongarde's GitHub profile picture" /><br />
        <strong>Devika Bongarde</strong>
      </a>
      <br /><sub>Documentation and repository presentation</sub><br /><br />
      <a href="https://github.com/devikabongarde"><img src="https://img.shields.io/badge/GitHub-devikabongarde-181717?style=for-the-badge&logo=github" alt="Devika Bongarde on GitHub" /></a>
    </td>
  </tr>
</table>

<div align="center">
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="LICENSE">MIT License</a>
  <br /><br />
  <img src="docs/assets/brand/readme-footer.svg" alt="Built with care by Leash contributors. Open source under the MIT License." width="100%" />
</div>
