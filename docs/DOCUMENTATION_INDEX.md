# Leash documentation index

The documentation is organized by responsibility. Start with the seven implementation sections, then use Product for submission and planning material and Research for supporting evidence.

## Core documentation

| Area | Documents |
|---|---|
| API | [API reference](API/API_REFERENCE.md) |
| Architecture | [System architecture](Architecture/SYSTEM_ARCHITECTURE.md) · [Threat model](Architecture/THREAT_MODEL.md) |
| Backend | [Backend guide](Backend/BACKEND_GUIDE.md) · [Policy reference](Backend/POLICY_REFERENCE.md) · [Claude Code integration](Backend/CLAUDE_CODE_INTEGRATION.md) |
| Database Decisions | [Database design](Database%20Decisions/DATABASE_DESIGN.md) |
| Deployment | [Deployment guide](Deployment/DEPLOYMENT_GUIDE.md) |
| Frontend | [Frontend guide](Frontend/FRONTEND_GUIDE.md) · [Design system](Frontend/DESIGN_SYSTEM.md) |
| Operations | [Operations guide](Operations/OPERATIONS_GUIDE.md) · [Demo script](Operations/DEMO_SCRIPT.md) · [Video production runbook](Operations/VIDEO_PRODUCTION_RUNBOOK.md) |

## Product documentation

| Document | Purpose |
|---|---|
| [Product plan](Product/PRODUCT_PLAN.md) | Historical decision ledger, implementation plan, review outcomes, and test matrix |
| [Original design proposal](Product/ORIGINAL_DESIGN_PROPOSAL.md) | Initial problem framing, alternatives, recommended approach, and success criteria |
| [Impact and evidence](Product/IMPACT_AND_EVIDENCE.md) | Audience, benchmarks, evidence boundaries, and allowed claims |
| [Competitive analysis](Product/COMPETITIVE_ANALYSIS.md) | Comparison with other agent-payment gates |
| [Devpost submission](Product/DEVPOST_SUBMISSION.md) | Submission copy and supporting claim checklist |
| [Submission checklist](Product/SUBMISSION_CHECKLIST.md) | Rules and release-readiness checklist |
| [Roadmap](Product/ROADMAP.md) | Deferred work and known follow-ups |

## Research and build records

- [PayPal MCP audit](Backend/PAYPAL_MCP_AUDIT.md) records the tool and payload inspection behind the hook allowlist.
- [Verification record](Operations/VERIFICATION_RECORD.md) records the live sandbox and integration checks.
- Reproducible benchmark harnesses live in `scripts/leashbench/`; generated results are intentionally not committed.

These research records are retained for reproducibility and provenance; they are not the primary operating documentation.

## Repository-level documents

- [Main project README](../README.md)
- [Environment template](../.env.example)
- [Contributing guide](../CONTRIBUTING.md)
- [Security policy](../SECURITY.md)
- [Changelog](../CHANGELOG.md)
- [License](../LICENSE)
