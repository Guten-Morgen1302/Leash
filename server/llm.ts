// Optional AI summary for the approval page. ADVISORY ONLY: the gate never reads this, and failure never blocks approval.
// Provider is Google Gemini (REST). The model comes from GEMINI_MODEL, or is discovered from Google's live model list: nothing is hardcoded from memory.
import { buildPrompt, sanitizeBrief } from './brief.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
let discovered: string | null = null;

async function pickModel(key: string, f: typeof fetch): Promise<string | null> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (discovered) return discovered;
  const r = await f(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const models = ((await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }).models ?? [];
  const flash = models.filter((m) => /flash/i.test(m.name) && !/(image|tts|live|audio|thinking|preview|exp|lite)/i.test(m.name) && m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, '')).sort();
  return (discovered = flash.at(-1) ?? null);
}

/** Returns null when keyless, slow, or failing: callers show a fixed template instead. */
export async function aiSummary(i: { amountCents: number; ruleId: string; ticket: unknown }, f: typeof fetch = fetch): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const model = await pickModel(key, f);
    if (!model) return null;
    // thinking tokens count against maxOutputTokens: a small cap truncates the answer mid-sentence
    const r = await f(`${BASE}/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(i) }] }], generationConfig: { maxOutputTokens: 1024, temperature: 0, thinkingConfig: { thinkingLevel: 'low' } } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const t = sanitizeBrief(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '');
    return t || null;
  } catch {
    return null;
  }
}
