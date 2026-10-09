# Leash docs index

| File | What it is |
|---|---|
| [PLAN.md](PLAN.md) | The locked working plan: decision ledger, CEO, Eng, Design and DX reviews, test matrix, schedule, review report |
| [DESIGN.md](DESIGN.md) | Design tokens and component vocabulary (contract for the UI) |
| [TODOS.md](TODOS.md) | Deferred work (not rejected) |
| [designs/leash.md](designs/leash.md) | Approved office-hours design doc (problem, premises, approaches) |
| [CLAUDE-CODE.md](CLAUDE-CODE.md) | Hook install, doctor, known limits |
| [policy.md](policy.md) | Every policy rule and its trigger |
| [SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md) | Rules-based submission and quality checklist |
| [DEMO-SCRIPT.md](DEMO-SCRIPT.md) | Timecoded 3-minute video script and rehearsal checklist |
| [reviews/strategy-red-team.md](reviews/strategy-red-team.md) | Strategy red-team: how rivals would beat the plan |
| [THREAT-MODEL.md](THREAT-MODEL.md) | Claims and non-claims, 15 threats, hash-chain limits, judge Q&A |
| [IMPACT.md](IMPACT.md) | Sourced impact case, audience, innovation comparison, claims allowed and banned |
| [DEVPOST.md](DEVPOST.md) | Draft Devpost technical, innovation and impact text, with an evidence checklist |
| [reviews/mcp-tool-payloads.md](reviews/mcp-tool-payloads.md) | WIN-T1 source audit: real tool names, payloads, verdict, what is still unverified |
| [reviews/verification-log.md](reviews/verification-log.md) | What was verified, how, and what still needs a live session |
| [reviews/prototype-verified/](reviews/prototype-verified/) | Reference implementation, 54 passing tests (incl. the credential proxy and real Claude Code and PayPal plugin event fixtures) |
| [../.env.example](../.env.example) | Environment variables (the real `.env` is gitignored and never committed) |
| [prompts/BUILD-PROMPT.md](prompts/BUILD-PROMPT.md) | Prompt for a coding AI tool to build the app in gated phases |
| [prompts/TEST-PROMPT.md](prompts/TEST-PROMPT.md) | Prompt for a DIFFERENT AI tool to adversarially test it before submission |
| [prompts/FIX-PROMPT.md](prompts/FIX-PROMPT.md) | Prompt that fixes a test report's findings with regression tests, then hands back for retest |
| [reviews/eng-test-plan.md](reviews/eng-test-plan.md) | QA test plan from the eng review |

Docs still to be written during the build: ARCHITECTURE.md, TTHW.md (measured after the build). Everything else listed above exists. The repo-root README.md and LICENSE stay at the root because GitHub renders them there.
