# TEST PROMPT (paste into a DIFFERENT AI tool than the one that built it, after the build gates pass)

You are an adversarial QA and release engineer. **Do not fix code. Find failures, prove them with evidence, and report.** The product is **Leash** (see `README.md`, `docs/PLAN.md`, `docs/THREAT-MODEL.md`, `docs/policy.md`, `docs/DEMO-SCRIPT.md`, `docs/SUBMISSION-CHECKLIST.md`, `docs/reviews/verification-log.md`). It is a hackathon entry: **the demo must never break in front of judges**, and every claim in the Devpost text and video must be true. Assume the builder is wrong until each check passes with captured output.

## Ground rules
- Never print or commit secrets. `.env` has real sandbox credentials: read variable names only. Sandbox only.
- Do **not** re-run `scripts/seed.mjs` (creates real payments). Existing captures: `.seed/captures.json`. Refunds consume captures; keep a ledger of which you spent and report it.
- Run everything from a **fresh clone in a new empty folder** (`git clone <repo> fresh && cd fresh`), not the dev folder, unless a check says otherwise.
- Every finding needs: ID, severity (BLOCKER / HIGH / MEDIUM / LOW), exact steps, expected vs actual, captured output, and which doc claim it breaks. "Looks fine" is not evidence.

## Phase A: Clean-machine run (BLOCKER if any fail)
1. On a **clean Windows user profile** (no node_modules, no env vars, no `.env`): `git clone`, `npm ci`, `npm run demo`. Record wall-clock time per step and total (target under 5 minutes; Windows Defender/antivirus on). Note any native-module build output from `better-sqlite3`; confirm a failed native build shows a problem+cause+fix message, not a raw stack trace.
2. Same on Linux (container or Codespace) and macOS if available.
3. With `engines` mismatch (try Node 18): must stop with a clear message (`engine-strict`).
4. `npm run demo:cli` prints the three outcomes (allow, block, escalate) and exits 0 with no keys and no browser.
5. Port 3000 (or the chosen port) already in use: server picks another port and prints the URL.

## Phase B: Automated suites
1. `npm test` green with `LEASH_DB_DRIVER` unset and `=node:sqlite`. Run the suite **5 times in a row** each; report any flake (a flaky concurrency test is a HIGH).
2. Read `tests/` for the contention tests: confirm they use worker threads with separate connections and an Atomics barrier, include the busy_timeout negative control (timeout 0 must fail with BUSY), and that the negative control actually fails if you set `busy_timeout` to 0 in the normal path. **Mutation check:** temporarily change the transaction to a deferred `BEGIN` (or move the cap check outside the transaction) and confirm the contention test FAILS; revert. A test that cannot fail is a HIGH finding.
3. Mutation checks on policy: flip `>` to `>=` at each cap boundary, remove the `R-HARD-MAX` rule, remove the own-id exclusion in the window query; each must fail at least one test.
4. `tsc --noEmit`, lint, and `npm audit` (report highs).

## Phase C: Policy and money correctness (against the real sandbox, using `.seed/captures.json`)
Verify each rule in `docs/policy.md` with a real or recorded case: the demo trio ($18 of $60 allow; $75 of $120 escalate with `R-ACTION-CAP`; **full $200 refund when $18 was asked => blocked by `R-HARD-MAX`**); omitted amount resolves to the remaining balance; currency mismatch => `R-CURRENCY`; duplicate within window => `R-DUP` and `dupWindowMs=0` disables it; refund above remaining => `R-OVER-CAPTURE`; hard daily cap after approval; mandate expiry. Float traps: `"0.1"`, `"0.10"`, `"1e2"`, `"-5.00"`, `"5."`, `".5"`, `"9999999999.99"`, whitespace, unicode digits, empty string => rejected or exact cents, never NaN/float drift. Concurrency: 10 simultaneous refunds across 10 captures near the daily cap; 6 simultaneous on one capture. Confirm balances at PayPal (GET the refund / capture) match the ledger.
For every executed refund, independently GET it from PayPal and compare amount and status.

## Phase D: Approval and state machine
Escalate, then: wrong token (403), double click (second 409), replay after approve, approve after 15 min (410 with correct message), deny, approve after other refunds consumed the **hard** daily cap (must be rejected with the hard-rule reason), approve then agent retry executes **once**, second retry does not execute. GET `/approve/:id` must change no state. Token must be in the URL fragment (confirm it never appears in server logs or Referer). Kill the server between escalate and approve and restart: pending approvals and boot_id message behave per `docs/PLAN.md`.

## Phase E: Integration surfaces (real tools)
1. **Proxy:** connect an MCP client over stdio; `listTools` shows only `create_refund` and `get_refund`; allowed/blocked/escalated behave; PayPal 4xx releases the reservation and the token never appears in any agent-visible output (grep all output for the token); PayPal 5xx or hang => `unknown_outcome`, amount stays reserved, sweep after 120 s.
2. **Hook:** in real Claude Code, install the hooks from `docs/CLAUDE-CODE.md` with absolute paths; run `npm run doctor` (must pass); ask the agent to refund via PayPal's local `@paypal/mcp --tools=all` server (a real sandbox refund works; the **hosted** server's `create_refund` errored in earlier testing: record whether it still does). Over-cap blocked with exit 2 and the agent sees the reason; allowed executes; PostToolUse/PostToolUseFailure update the ledger. Fail-open probes: stop the Leash service, corrupt the hook input, rename the hook script, set an invalid path in settings. For each, state whether the PayPal call was blocked. A missing hook script is expected to fail OPEN; `doctor` must catch it.
3. **Guard:** from the agent, try: `curl` to `api-m.sandbox.paypal.com`, `echo $PAYPAL_*`, reading `.env`, editing `.claude/settings.json`, `mandate.json`. Report which are blocked. Try obfuscations (base64 host, variable concatenation, PowerShell). Anything that bypasses is a documented limit only if `docs/THREAT-MODEL.md` already says so; otherwise HIGH.
4. **Ledger:** `verify` passes on a fresh DB; edit a middle row, delete a middle row, truncate the tail, rewrite with recomputed hashes: with the seal, each must be detected; confirm the documented limit (attacker with DB **and** key can re-seal).

## Phase F: UI and demo-day resilience (BLOCKER class: the demo must not break)
1. `/demo` on a cold start: ticket preselected, **Run both lanes** produces unguarded then guarded outcomes with the single motion; run it 20 times in a row with no state leaking between runs; click Run during an in-flight run; refresh mid-run; back/forward; two tabs.
2. Sim vs live-fire: chip is correct on every page and every ledger row; sim never claims a real refund; live-fire pool empty degrades to sim with the stated note.
3. Break things on purpose while the page is open: kill the server (UI shows the specified error state, no blank screen), return after restart (recovers), slow network (DevTools throttling), offline, Gemini key missing/invalid/timeout (summary shows "unavailable", approval still works), PayPal token expired (401 refresh once, transparent), PayPal 5xx.
4. Phone width (375px) and tablet: approval page 44px targets, sticky bar, countdown, no horizontal scroll; desktop at 1280 and 1920 and 125% zoom; Chrome, Edge, Firefox, Safari if available.
5. Accessibility: keyboard-only walkthrough of all three pages; screen reader (NVDA) announces both outcomes in order; Lighthouse accessibility >= 95; contrast of every status chip; `prefers-reduced-motion` produces no movement; color is never the only signal.
6. Console: zero errors and zero warnings on all pages (specifically no AG Grid license warning, no 404s for fonts, no mixed content). Fonts are self-hosted: disable the network and confirm they still render.
7. Hosted run, if deployed: cold start time, restart resets state with the boot_id message, rate limit works behind the proxy (X-Forwarded-For), no secrets in the client bundle (grep the built JS for the client secret, token, Gemini key).

## Phase G: Security sweep
Secret scan over the **entire git history** (gitleaks or equivalent) and the built `dist/`; `.env` never committed; `.seed/` and `*.db` ignored. Inputs: oversized bodies, malformed JSON, SQL-ish strings in ids, huge numbers, unicode/bidi/zero-width in ticket text, `<script>` in the brief (must render inert), links in the brief (removed). Auth: `/v1/check` and `/v1/result` without `LEASH_TOKEN` in production return 503/401 (never open). Timing-safe compares present.

## Phase H: Docs and claims audit
Walk `docs/DEVPOST.md`'s evidence table row by row: each claim must have a passing test or captured proof; list any claim without one. Grep all docs and UI copy for banned words: tamper-proof, non-repudiation, mathematically, proves, perfect. Follow the README from a blank state and note every ambiguity. Confirm `LICENSE` is detectable (GitHub About shows MIT). Check `docs/SUBMISSION-CHECKLIST.md` against the Rules: public repo, license, run instructions, text, tools list, video under 3:00 on YouTube with no third-party trademarks or copyrighted music (watch the video; flag any PayPal logo, dashboard footage, or music).

## Phase I: Full rehearsal (the final gate)
Run the whole `docs/DEMO-SCRIPT.md` three times from a cold start on the recording machine, timing each beat (total under 3:00). Between runs reset state. Any hiccup, delay over 2 s, unexpected modal, notification, or visible secret/path is a finding. Have a person who has never seen the project watch the video without the repo and say what it does and why it matters; record their answer verbatim.

## Retest mode (rounds 2 and later)
If you are given a previous report plus a fix report, first re-run **every** earlier finding's exact reproduction and mark it FIXED (with evidence), STILL FAILING, or REGRESSED. Then re-run the full Phases A, B, F and I from scratch (fixes break other things) and any phase touched by a fix. Treat a fix without a new regression test as NOT FIXED. Finally hunt for new issues the fixes introduced. Round numbering: the report header says `Round N`.

## Report format (required)
0. **Header:** `Round N`, commit hash tested, date.
1. **Verdict:** GO / NO-GO for submission, one paragraph.
2. **Findings table:** ID | severity | area | steps | expected | actual | evidence (output/screenshot path) | doc claim affected.
3. **Test counts:** per phase, pass/fail/skipped, drivers, runs, flake rate.
4. **Timings:** clean-clone time per step; demo beat times.
5. **Refund ledger:** captures spent during testing.
6. **Not tested** (and why).
Any BLOCKER or a failing claim in the Devpost evidence table means NO-GO. Do not soften findings; do not fix them; return the report.
