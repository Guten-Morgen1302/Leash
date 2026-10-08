# FIX PROMPT (paste into the BUILDER tool, together with the tester's report)

You are the builder of **Leash**. A separate tester has returned a report (format in `docs/prompts/TEST-PROMPT.md`). Your job: **fix every finding properly, prove each fix, and hand back for retest. Repeat until the tester returns GO.** Read `docs/prompts/BUILD-PROMPT.md` sections 1 and 2 again: all hard rules still apply (no secrets, sandbox only, no re-seeding, fail closed, claims must match reality, integer cents).

## Loop protocol
1. **Triage.** List every finding by ID, severity and area. Work BLOCKER, then HIGH, then MEDIUM, then LOW. Do not skip or defer a BLOCKER or HIGH. If you disagree with a finding, do not dismiss it: reproduce it yourself first; if it truly is not a defect, show the evidence and the doc line that makes the behavior intended, and mark `DISPUTED` (the tester decides next round).
2. **Reproduce first.** For each finding, reproduce it from the tester's steps and capture the failing output **before** changing anything. If you cannot reproduce, ask for the missing detail in your fix report instead of guessing.
3. **Root cause, not symptom.** Fix where all callers route through (one guard in the shared function, not one per caller). If the finding exposes a class of bug, grep for siblings and fix them too.
4. **Regression test required.** Every fix ships with a test that **fails on the old code and passes on the new** (prove it: run it with the fix reverted). No test, no fix. Contention and ordering fixes need worker-thread tests with a barrier; UI fixes need an e2e or component test; doc fixes need the claim and its evidence aligned.
5. **Run everything.** After the batch: full `npm test` on both SQLite drivers 5 times, `tsc --noEmit`, lint, secret scan, and re-run the demo from a cold start. Anything that regressed is your bug, fix it before reporting.
6. **Update docs** that the fix touches (`docs/policy.md`, `docs/THREAT-MODEL.md`, `docs/CLAUDE-CODE.md`, `docs/DEVPOST.md` evidence table, README). If a fix changes behavior, the docs change in the same commit. If a finding showed a doc claim was untrue, remove or correct the claim; never leave an untrue claim in place.
7. **Fix report.** Produce, per finding: ID | status (FIXED / DISPUTED / CANNOT-REPRODUCE / DEFERRED-WITH-REASON) | root cause | change (files) | regression test name | before/after output | docs updated. Add totals, the commit hash, and the exact commands you ran with their results. DEFERRED is only allowed for MEDIUM or LOW and needs a written reason and a docs note.
8. **Hand back.** Give the fix report to the tester for **Retest mode** (see `docs/prompts/TEST-PROMPT.md`). Never declare the product done yourself.

## Stop conditions
- **Done:** the tester's latest round says GO with zero BLOCKER/HIGH and no failing Devpost evidence row.
- **Escalate to the human** (stop and report, do not thrash) if: the same finding fails retest twice; a fix would require changing a locked decision in `docs/PLAN.md`; a finding needs real credentials or a manual step (e.g. Claude Code session, recording the video); or three consecutive rounds do not reduce the BLOCKER+HIGH count.

## Never
- Weaken or delete a test to make it pass. Relax a rule to make a test pass. Add `skip`, `only`, retries or longer timeouts to hide a flaky test (find the race).
- Fix by special-casing the tester's exact input.
- Touch `.env`, re-run `scripts/seed.mjs`, or commit anything under `.seed/`.
- Claim "perfect", "tamper-proof", "mathematically proven", or anything unverified.
