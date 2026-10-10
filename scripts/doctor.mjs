#!/usr/bin/env node
// npm run doctor: proves the hooks are INSTALLED and actually BLOCK (a missing hook fails open in Claude Code).
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { doctor } from './doctor-lib.mjs';

const root = resolve(import.meta.dirname, '..');
const explicit = process.env.LEASH_SETTINGS ? [process.env.LEASH_SETTINGS] : [];
const settingsFiles = [...explicit, join(root, '.claude', 'settings.json'), join(root, '.claude', 'settings.local.json'), join(homedir(), '.claude', 'settings.json')].filter(existsSync);
const out = doctor({ settingsFiles, hookScript: join(root, 'hooks', 'leash-hook.mjs'), guardScript: join(root, 'hooks', 'guard.mjs'), leashUrl: process.env.LEASH_URL ?? 'http://127.0.0.1:4317' });
for (const c of out.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `\n      fix: ${c.fix}`}`);
console.log(out.ok ? '\nLeash hooks look installed and the sample over-cap refund is blocked.' : '\nNot ready: fix the FAIL lines above. Until they pass, PayPal tool calls may proceed unchecked.');
process.exit(out.ok ? 0 : 1);
