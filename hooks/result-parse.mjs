// Parses what Claude Code sends to PostToolUse / PostToolUseFailure for an MCP tool.
// REAL shape (captured from Claude Code 2.1.278): tool_response is an ARRAY of content blocks, e.g.
//   [{ "type": "text", "text": "{\"id\":\"...\",\"status\":\"COMPLETED\"}" }]
// so the PayPal JSON is nested inside escaped text. Never regex the stringified array.
export function parseToolResponse(resp) {
  const blocks = Array.isArray(resp) ? resp : Array.isArray(resp?.content) ? resp.content : [];
  const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
  let body = null; try { body = JSON.parse(text); } catch { /* not JSON: leave null */ }
  return { text, body };
}
export function outcomeFromEvent(ev) {
  if (ev.hook_event_name === 'PostToolUseFailure' || ev.error) return { outcome: 'failed' };
  const { body, text } = parseToolResponse(ev.tool_response);
  if (body && /^(COMPLETED|PENDING)$/.test(String(body.status))) return { outcome: 'executed', refundId: body.id };
  if (body && body.ok === false) return /TIMEOUT|NETWORK|ECONN|ETIMEDOUT|SOCKET/i.test(String(body.code)) ? { outcome: 'unknown', note: String(body.code) } : { outcome: 'failed', note: String(body.code) };   // REAL plugin error shape: {ok:false, code, message}
  if (resp_isError(ev.tool_response) || (body && (body.name || body.debug_id) && !body.status)) return { outcome: 'failed' };   // PayPal error object
  return { outcome: 'unknown', note: text.slice(0, 120) };                                              // ambiguous: keep the reservation
}
const resp_isError = (r) => r?.isError === true || r?.is_error === true;
