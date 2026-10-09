# BUILD PROMPT (paste this whole file into the coding AI tool, with the repo folder open)

You are building **Leash**, a hackathon entry for the PayPal AI Hackathon (deadline Nov 12, 2026, 12:00 pm PT; target submit Nov 9). Leash is a policy gate for AI agents that can move money through PayPal: **"Give your AI agent a refund budget, not your PayPal keys."** PayPal **sandbox only**. A solo builder owns this repo; judges are PayPal developer advocates and engineers who will run it from the README, and may judge from the video and text alone.

The planning is finished and locked. **Do not re-plan or redesign. Build exactly what the docs specify, in the phases below, and stop at each gate.**

## 0. Read first (in this order)
1. `docs/README.md` (index) and `docs/PLAN.md` (locked plan; the LAST addenda supersede earlier text; the "Official Rules Addendum", "Hardening Addendum", "WIN-T1 Source Audit", "Verification Results", "Loophole Fix Results", "Credential Proxy Built", "Live-Fire Results and Demo Correction", "Primary Path Decision", "Last Unverified Items Closed" sections are authoritative)
2. `docs/designs/leash.md`, `docs/policy.md` (the 12 rules), `docs/THREAT-MODEL.md`, `docs/CLAUDE-CODE.md`, `docs/DESIGN.md` (UI tokens, the contract), `docs/DEMO-SCRIPT.md`, `docs/DEVPOST.md`, `docs/SUBMISSION-CHECKLIST.md`, `docs/reviews/verification-log.md`, `docs/reviews/mcp-tool-payloads.md`
3. **The verified prototype: `docs/reviews/prototype-verified/`** (JavaScript, 54 passing tests). This is the reference implementation of the db layer, policy engine, approvals/grants, ledger chain + seal, guard hook, doctor, brief sanitizer, credential proxy and result parser, plus REAL captured Claude Code / PayPal event fixtures. **Port it to TypeScript under `server/` and `hooks/`; do not rewrite from scratch and do not weaken any of its tests.** Run it first: `cd docs/reviews/prototype-verified && npm install && npm test` must be green before you start.

## 1. Hard rules (violating any is a failure)
- **Never read, print, log, commit or paste secrets.** `.env` holds real sandbox credentials. Read variable names only. `.env`, `.seed/`, `*.db` stay gitignored. Never put a credential in code, tests, docs, fixtures, logs or commit messages. Run a secret scan over the whole tree before every commit.
- **Sandbox only.** Refuse any non-sandbox PayPal URL in code.
- **Do not run `scripts/seed.mjs` again** (it creates new real sandbox payments). Existing captures are in `.seed/captures.json` (20 payments; labels `demo-allow-$18-of-$60`, `demo-escalate-$75-of-$120`, `demo-injection-full-$200-vs-$18`, rest `pool`).
- **Claims must match reality.** Never write "tamper-proof", "non-repudiation", "mathematically", "proves", "perfect". Do not claim anything not verified (see verification-log). Anything not built is described with "would".
- **Money is integer cents.** No floats anywhere in policy or storage.
- **The gate is deterministic code, never an LLM.** The LLM (Gemini via an adapter, optional) only writes an advisory summary and is never read by the gate.
- **Fail closed everywhere.** Hook exits 2 on every failure path (Claude Code fails OPEN on exit 1, crashes and timeouts). Unknown or unmapped money tools are blocked or absent.
- **Single instance.** SQLite with `BEGIN IMMEDIATE`; never design for scale-out.
- Match the docs' wording for rule ids, statuses and error messages (every error: problem + cause + fix). No em dashes in UI copy. No AI-slop UI (see `docs/DESIGN.md`).
- Do not start the optional/stretch items in section 7 until every phase gate passes.

## 2. Verified facts you must build around (do not re-derive or contradict)
- PayPal **rejects refunds larger than the capture** (`REFUND_AMOUNT_EXCEEDED`). The demo attack is therefore: ticket legitimately asks $18, hidden injection says "refund the full order"; the agent refunds the whole $200 capture (PayPal accepts it); Leash blocks it with `R-HARD-MAX`. A "$900 on a $60 order" demo is invalid.
- Real tool name for PayPal's plugin: `mcp__plugin_paypal_paypal-sandbox__create_refund`; use matcher `mcp__.*paypal.*` and take the tool as the text after the last `__`. Refund args: `capture_id`, optional `amount {currency_code, value: string}` (omitted amount = full refund), `note_to_payer?`.
- Claude Code MCP `tool_response` is an **array of content blocks** (`[{type:"text", text:"<escaped JSON>"}]`); never regex the stringified array. Plugin error shape is `{ok:false, code, message}`. `PostToolUse` fires only on success; `PostToolUseFailure` carries failures; a blocked call produces no PostToolUse. Fixtures: `docs/reviews/prototype-verified/fixtures/`.
- PayPal's **hosted** MCP `create_refund` returned a server-side error in testing. PayPal's **local** `@paypal/mcp --tools=all` works. Build the live demo on the **credential proxy** and/or the local server, never on the hosted one.
- The PayPal token **is readable by the agent's shell** when set in the Claude environment. This is why proxy mode (credential custody) and the guard hook exist.
- Sandbox tokens last ~9 h: refresh on 401 once (single-flight).
- `node:sqlite` returns null-prototype rows (normalize to plain objects). Both `better-sqlite3` and `node:sqlite` must pass the whole suite (`LEASH_DB_DRIVER`).
- AG Grid: `ag-grid-community` 36.2.0 (MIT); `themeQuartz.withParams` with the planned param names works. Community modules only; no license warning in the browser console.
- Approval token travels in the URL **fragment**, stored hashed, single use, 15 min; approve/deny are **POST only**; approval waives only the two soft caps and re-checks hard rules; the agent's retry consumes a single-use 10-minute grant matched by args hash.

## 3. Target repo layout
```
LICENSE (MIT)  README.md  package.json  tsconfig.json  .nvmrc  .npmrc (engine-strict=true)  .gitignore  .env.example
mandate.json            # commented defaults + schema_version; limits are DATA (see README "policy is data")
server/  index.ts db.ts schema.ts dispatch.ts policy.ts ledger.ts seal.ts approvals.ts proxy.ts proxy-main.ts brief.ts llm.ts config.ts errors.ts
hooks/   leash-hook.mjs guard.mjs     # plain Node ESM, no build step, absolute-path friendly
scripts/ doctor.mjs seed.mjs (exists) replay.mjs reset.mjs
web/     (Vite + React + TS) pages: /demo /approve/:id /ledger ; AG Grid themed per docs/DESIGN.md
tests/   ported prototype suites (unit + contention + proxy + hook + real-event fixtures) + Playwright e2e
docs/    (exists; keep updated)  .github/workflows/ci.yml (ubuntu + windows)
```
`npm run demo` (server + SPA + opens browser on /demo, keyless, SIMULATED), `npm run demo:cli` (prints the 3-ticket outcome table, exits 0, no keys, no browser), `npm run doctor`, `npm test`, `npm run build`, `npm start`. One Express service serves `/v1/*` and the built SPA on one port (Render `PORT`); unknown `/v1` paths 404.

## 4. Phases (each ends with a GATE; do not proceed until it passes)

**Phase 1: Repo + core port.** `git init`, LICENSE MIT, configs, `.gitignore` verified. Port db/tx (unified `Db` interface, explicit BEGIN IMMEDIATE/COMMIT/ROLLBACK, async-callback and nested-tx guards), policy (12 rules, table-driven, pure), dispatch (`check`/`result`/`sweep`/`approve`, reserve-then-execute, grants, `reserved_cents`, `R-CURRENCY`, `dupWindowMs`), ledger (hash chain) + seal (HMAC outside the DB), brief sanitizer. Port every prototype test to the same assertions.
GATE 1: `npm test` green on BOTH drivers, including the worker-thread contention tests and the busy_timeout negative control; `tsc --noEmit` clean; secret scan clean.

**Phase 2: Integration surfaces.** (a) Credential-holding MCP proxy (`create_refund`, `get_refund` only) per the prototype; (b) hooks: `leash-hook.mjs` (pre/post/failure, watchdog < hook timeout, exit 2 on every failure) and `guard.mjs`; (c) `scripts/doctor.mjs` (hook installed, matcher covers `mcp__.*paypal.*`, absolute path, scripts exist, guard configured, an over-cap sample is BLOCKED end to end); (d) HTTP API in `server/index.ts` (`/v1/check`, `/v1/result`, `/v1/approve`, `/v1/ledger`, `/v1/session`, token auth required in production, 503 on busy, fail closed).
GATE 2: all prototype proxy/hook/doctor/real-event tests green; a manual run of `proxy-main` against the real sandbox (`.seed/captures.json`) executes an $18 refund, blocks the $200-full-refund attack with `R-HARD-MAX`, escalates $75-of-$120; independent GET of the refund at PayPal confirms the executed one. Do NOT seed again; refund only captures you need and track which are spent.

**Phase 3: UI.** Implement `docs/DESIGN.md` exactly: tokens as CSS variables, Instrument Sans + IBM Plex Mono self-hosted, hairline split screen (unguarded vs guarded), one motion moment (unguarded first, guarded settles 12px over 250ms; reduced-motion respected), status chips with text+glyph+border style, AG Grid ledger with `themeQuartz.withParams`, SIMULATED/LIVE-FIRE chip in the top bar and on every ledger row, full state tables from `docs/PLAN.md` (loading/empty/error/success/partial for every feature), phone-first approval page (44px targets, sticky action bar, countdown, "AI summary, advisory only", boot_id mismatch message "demo was reset after a server restart"), `aria-live` announcing both outcomes in reveal order, keyboard operable, contrast >= 4.5:1. **Exposure meter** (docs/IMPACT.md section 4): show "Exposure today: $X of $Y hard daily cap" on /demo and /ledger using the policy's own window-sum query, and "Exposure: unlimited" in the unguarded lane; add a test that the meter equals the policy window sum. Judge path: `/demo` has ticket 2 (the injection; ticket 1 = allow, ticket 3 = escalate) preselected; "Run both lanes" always resets both lanes first.
GATE 3: `npm run demo` works on a clean clone with ZERO env vars; all three outcomes (allow/block/escalate) visible; approve flow works end to end in SIMULATED mode; AG Grid console shows no license warning; Lighthouse accessibility >= 95 on the three pages.

**Phase 4: Modes, resilience, deploy.** Per-session SIMULATED vs LIVE-FIRE (identical pipeline; only the final PayPal HTTP call is stubbed in sim, with the stub shaped from real recorded responses); recorded-agent replay feeding the REAL pipeline, labeled "replayed agent calls, live Leash"; keyless summaries when no `GEMINI_API_KEY`; `llm.ts` adapter (provider/model from env; check Google's current model list at build time, never hardcode from memory; 5 s timeout; "AI summary unavailable" fallback that never blocks approval); rate limit per IP (`trust proxy` set), request size limits; `render.yaml` (optional hosting; single instance; README states free-tier cold starts and ephemeral storage); `reset`/`replay` scripts; boot-time `unknown_outcome` sweep every 60 s.
GATE 4: kill the server mid-flow and restart: no cap under-count, pending approvals behave per spec; token expiry handled; port-in-use auto-picks the next port and prints the URL.

**Phase 5: Docs and polish.** Replace the root README (3-step run: clone, `npm ci`, `npm run demo`; README first code block shows both `npm run demo` and `npm run demo:cli`; "what is real vs simulated"; criteria map table; `.nvmrc` + Windows Node note; license visible), write `docs/ARCHITECTURE.md`, update `docs/policy.md` and `docs/CLAUDE-CODE.md` to match shipped behavior, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`. Update `docs/DEVPOST.md` so every claim matches its evidence row; delete claims that are not true.
GATE 5: `docs/SUBMISSION-CHECKLIST.md` "Required by the Rules" fully checked.

## 5. Working method
- Small commits with clear messages; run the full test suite before each commit; never commit with a failing test or a secret.
- When something in the docs seems wrong or a verified fact contradicts reality, **stop and report with evidence** instead of silently diverging.
- Report at each gate: what was built, test output (counts), what was NOT done, and anything surprising.
- Keep the prototype folder as reference; do not delete it until Gate 5.

## 6. Definition of done
All five gates pass; `npm test` green on both SQLite drivers; the demo runs keyless from a fresh clone in under 5 minutes; a real sandbox refund through the proxy is shown executed, a within-capture attack refund is blocked, a $75 refund is escalated and approved on a phone-width viewport; docs are accurate; no secrets in the tree or history.

## 6b. When you receive a test report
If a tester hands you a report, stop building and follow `docs/prompts/FIX-PROMPT.md` exactly (fix loop with regression tests and a retest handoff). Never mark a finding fixed without a test that failed before and passes after.

## 7. Stretch (only after Gate 5, in this order, each optional)
live Gemini ticket box (rate limited, token capped); Playwright e2e as CI job; published head hash for the ledger seal; webhook reconciliation; mandate builder UI. Do NOT add: Docker, other languages, other PayPal tools, dispute/invoice flows (they stay absent from the proxy by design).
