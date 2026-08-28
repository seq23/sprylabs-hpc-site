/**
 * Read the pages an OpenRouter web-plugin answer was actually built from.
 *
 * Shared by scripts/llm_citation_probe.mjs and
 * scripts/search_intelligence/observe_live_search.mjs so that both read the
 * same field of the same response shape. They previously pointed at Google
 * GenAI grounded search, which is hard-blocked on this project's key: a plain
 * generateContent call returns 200 and the identical call carrying
 * tools:[{google_search:{}}] returns 429 RESOURCE_EXHAUSTED, reproduced across
 * three models and persistent.
 *
 * Verified request shape:
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   {"model":"openai/gpt-4o-mini","plugins":[{"id":"web","max_results":10}],"messages":[...]}
 * Verified response shape: choices[0].message.annotations[] entries of type
 * "url_citation", each carrying url_citation.url (and usually .title).
 */
export const WEB_PLUGIN = (maxResults = 10) => [{ id: 'web', max_results: Number(maxResults) || 10 }];

export const hostOf = (value) => {
  try { return new URL(String(value)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

/** @returns {Array<{url:string,title:string|null}>} in response order, deduped by url. */
export function citations(payload) {
  const message = payload?.choices?.[0]?.message || {};
  const seen = new Set();
  const out = [];
  for (const annotation of message.annotations || []) {
    const cite = annotation?.url_citation;
    if (!cite?.url || seen.has(cite.url)) continue;
    seen.add(cite.url);
    out.push({ url: cite.url, title: cite.title || null });
  }
  return out;
}

/** @returns {string[]} just the URLs. */
export function citationUrls(payload) {
  return citations(payload).map((c) => c.url);
}

/** @returns {Array<{domain:string,title:string|null,uri:string}>} URLs that resolve to a host. */
export function citationRefs(payload) {
  return citations(payload)
    .map((c) => ({ domain: hostOf(c.url), title: c.title, uri: c.url }))
    .filter((r) => r.domain);
}

export function answerText(payload) {
  return payload?.choices?.[0]?.message?.content || '';
}
