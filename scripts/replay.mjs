// Replays the three recorded agent requests (allow, injection, escalate) against a RUNNING Leash. The gate is live; the agent calls are replayed.
const base = process.env.LEASH_URL ?? 'http://127.0.0.1:4317';
for (const id of [1, 2, 3]) {
  const r = await fetch(`${base}/v1/demo/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticketId: id }) });
  const j = await r.json();
  if (!r.ok) { console.error(`ticket ${id}: HTTP ${r.status} ${JSON.stringify(j)}`); process.exit(1); }
  console.log(`ticket ${id} (${j.ticket.title}): without Leash $${j.unguarded.amount} | with Leash ${j.guarded.status}${j.guarded.ruleId ? ' ' + j.guarded.ruleId : ''}`);
}
console.log('(replayed agent calls, live Leash)');
