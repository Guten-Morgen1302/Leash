#!/usr/bin/env node
// npm run hooks:print > .claude/settings.json  (merge by hand if you already have one). Prints the hook block with ABSOLUTE paths for this checkout.
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..').replaceAll(String.fromCharCode(92), '/');
const cmd = (script, arg = '') => `node "${root}/hooks/${script}"${arg ? ' ' + arg : ''}`;
const paypal = 'mcp__.*paypal.*';
const hook = (command) => ({ type: 'command', command, timeout: 5 });
console.log(JSON.stringify({
  hooks: {
    PreToolUse: [
      { matcher: paypal, hooks: [hook(cmd('leash-hook.mjs', 'pre'))] },
      { matcher: 'Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit|Read', hooks: [hook(cmd('guard.mjs'))] },
    ],
    PostToolUse: [{ matcher: paypal, hooks: [hook(cmd('leash-hook.mjs', 'post'))] }],
    PostToolUseFailure: [{ matcher: paypal, hooks: [hook(cmd('leash-hook.mjs', 'failure'))] }],
  },
}, null, 2));
