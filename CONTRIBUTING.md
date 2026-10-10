# Contributing

```bash
npm ci
npm run typecheck
npm test                    # better-sqlite3
npm run test:node-sqlite    # node:sqlite
```

- Node 22.18+ runs the TypeScript directly: no parameter properties or enums, imports use `.ts` extensions.
- Every limit comes from `mandate.json`; never hardcode a policy number in code.
- A bug fix needs a test that fails before and passes after.
- Hooks: only exit code 2 blocks, so every failure path must exit 2.
