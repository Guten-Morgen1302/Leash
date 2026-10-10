#!/usr/bin/env node
// Bypass guard hook (best effort). Matches Bash, Write, Edit, MultiEdit, NotebookEdit, Read. Exit 2 blocks; every failure path blocks.
const PAYPAL_CALL = /(api-m|api)(\.sandbox)?\.paypal\.com|mcp(\.sandbox)?\.paypal\.com|PAYPAL_(SANDBOX_)?ACCESS_TOKEN|PAYPAL_CLIENT_SECRET|PAYPAL_ACCESS_TOKEN/i;
const PROTECTED_PATH = /(^|[\\/])\.claude[\\/](settings(\.local)?\.json|hooks)|leash-hook|guard\.mjs|(^|[\\/])mandate\.json$|(^|[\\/])\.env(\.|$)|[\\/]\.seed[\\/]/i;
export const classify = (ev) => {
  const t = String(ev.tool_name ?? ''), i = ev.tool_input ?? {};
  if (t === 'Bash' || t === 'PowerShell') { const c = String(i.command ?? ''); if (PAYPAL_CALL.test(c)) return 'Direct PayPal API/token use from a shell bypasses Leash. Use the PayPal MCP tools so the mandate applies.'; }
  if (/^(Write|Edit|MultiEdit|NotebookEdit|Read)$/.test(t)) { const p = String(i.file_path ?? i.notebook_path ?? ''); if (PROTECTED_PATH.test(p)) return `Leash protects ${p} (hook config, mandate, secrets). Ask the operator to change it.`; }
  return null;
};
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('guard.mjs')) {
  const fail = (why) => { process.stderr.write(`Leash guard blocked this call. ${why}\n`); process.exit(2); };
  process.on('uncaughtException', (e) => fail(`Internal guard error (${e?.message}); failing closed.`));
  const raw = await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)); });
  let ev; try { ev = JSON.parse(raw); } catch { fail('Could not read hook input.'); }
  const why = classify(ev); if (why) fail(why); process.exit(0);
}
