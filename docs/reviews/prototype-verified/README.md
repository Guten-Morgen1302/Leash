# Verified prototype (not the final code)

Reference implementation of the designed db layer, policy engine, approval/grant flow, ledger chain and hardened hook. Run on 2026-10-07 on Node v24.10.0: 54 of 54 tests pass on three consecutive runs (26 db/dispatch/contention on both drivers, 3 hook failure-mode tests, 8 loophole-fix tests, 8 credential-proxy tests over real MCP stdio, 9 tests on real Claude Code and PayPal plugin events).

Run: `npm install` then `npm test` in this folder. The real build ports this to TypeScript under server/ and hooks/, adds the HTTP layer, and replaces the assumed hook payloads with the ones captured from a live session (docs/reviews/verification-log.md section C).
