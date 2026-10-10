# Security

Leash is a hackathon project that talks to the PayPal **sandbox** only; the client refuses any non-sandbox URL.

- Report problems by opening a GitHub issue (no secrets in it). Credential leaks: rotate first, then report.
- Never commit `.env`, `.seed/`, sandbox passwords or card numbers. `.gitignore` covers them; run a secret scan before pushing.
- Scope and honest limits: [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). Leash is not a boundary against someone who controls the host, and the ledger is tamper-evident against partial edits only.
