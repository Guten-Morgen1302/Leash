#!/usr/bin/env node
// node scripts/compile-policy.mjs <policy.txt> [draft.json]   (needs GEMINI_API_KEY; model from GEMINI_MODEL or Google's live list)
// Writes a DRAFT (fields, questions, unsupported). Nothing is activated: `--activate <draft.json> <expiresAt>` writes mandate.json only if no required field is null.
import { readFileSync, writeFileSync } from 'node:fs';
import { activate, compilePolicy } from '../server/compiler.ts';
import { askGemini } from '../server/llm.ts';
import { describeMandate, parseMandate } from '../server/config.ts';

const [a, b, c] = process.argv.slice(2);
if (a === '--activate') {
  const draft = JSON.parse(readFileSync(b, 'utf8'));
  try {
    const m = activate(draft, c ?? '');
    writeFileSync('mandate.json', JSON.stringify(m, null, 2));
    console.log('Wrote mandate.json. Playback of what will be enforced:');
    for (const l of describeMandate(parseMandate(m))) console.log(' - ' + l);
    if (draft.unsupported?.length) console.log('NOT enforced (the schema cannot express these):\n' + draft.unsupported.map((u) => ' - ' + u).join('\n'));
  } catch (e) {
    console.error(`Not activated: ${e.message}\nQuestions still open:\n${(draft.questions ?? []).map((q) => ' - ' + q).join('\n')}`);
    process.exit(1);
  }
} else {
  if (!a) { console.error('usage: compile-policy.mjs <policy.txt> [draft.json]'); process.exit(1); }
  const d = await compilePolicy(readFileSync(a, 'utf8'), askGemini);
  writeFileSync(b ?? 'mandate.draft.json', JSON.stringify(d, null, 2));
  console.log(JSON.stringify(d, null, 2));
  console.log(d.questions.length ? '\nNot activatable yet: answer the questions, then edit the draft.' : '\nAll fields filled. Review the playback, then run with --activate.');
}
