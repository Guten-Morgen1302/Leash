// Deletes the local demo database so the next start is empty. Stop the server first.
import { rmSync } from 'node:fs';
const base = process.env.LEASH_DB ?? 'leash.db';
for (const f of [base, base + '-wal', base + '-shm']) rmSync(f, { force: true });
console.log(`Removed ${base} (and WAL files). Next start begins with an empty ledger.`);
