# TODOS (deferred, not rejected)

## Mandate builder UI (merchant dashboard; the stated production vision)
**What:** edit the mandate in-app instead of mandate.json, with permissioned edits, a recorded mandate version on every decision, and seasonal schedules (effective-from and effective-to windows, such as holiday caps). The policy engine already takes the mandate as data, so this is a UI and storage change, not an engine change. **Why:** nicer demo of the "mandate" concept. **Pros:** design polish. **Cons:** a whole screen plus validation. **Context:** CEO D-MANDATE-UI; static config is must-have. **Effort:** human ~2d / CC ~2h (M). **Priority:** P3. **Depends on:** core done by Oct 27.

## npx / Docker distribution and stdio MCP transport
**What:** package Leash as an installable MCP server. **Why:** judges and devs can try it in their own agent. **Pros:** adoption story. **Cons:** packaging and docs. **Context:** CEO D-DIST. **Effort:** human ~1d / CC ~1h (S). **Priority:** P3. **Depends on:** MCP wrapper existing (itself first on the cut list).

## Per-entry signatures and published head-hash gist
**What:** Ed25519 signed ledger rows; publish head hash externally. **Why:** stronger tamper evidence. **Cons:** key management. **Context:** CEO D-SIGN; E5 states the honest current guarantee. **Effort:** human ~1d / CC ~45min (S). **Priority:** P3.

## Dispute accept / subscription cancel flows beyond "always escalate"
**What:** real gated flows. **Context:** CEO D-DISPUTE; rule rows exist. **Effort:** human ~2d / CC ~2h (M). **Priority:** P3.

## APIMatic SDK/OpenAPI for Leash
**What:** generate an SDK/OpenAPI for the Leash API. **Why:** sponsor prize, only if under one hour. **Effort:** S. **Priority:** P3.

## Refund reconciliation via GET /v2/payments/refunds/{id}
**What:** richer reconciliation beyond replaying the same Request-Id. **Context:** EO-4 covers the must-have path. **Priority:** P3.

## Ledger tamper demo button
**What:** a demo-only button that edits a ledger row so Verify turns red. **Why:** makes the tamper-evidence claim visible. **Cons:** scope creep; needs a guarded "demo only" route. **Context:** design D-UI-11, deferred by CEO scope reduction. **Effort:** human ~3h / CC ~20min (S). **Priority:** P3.

## Mockups
**What:** generate visual mockups for /demo, /approve, /ledger with the gstack designer (needs an OpenAI API key) or run /design-review on the first deployed build. **Priority:** P2. **Depends on:** key or first hosted build.
