// The only path from this repository to a language model.
//
// Owner, 11 Oct 2026: "nothing should be paid". Every model call goes through
// freeChat(), which asks ONLY the $0/$0 models listed in config/llm_routing.json,
// in order. There is no paid fallback: when no free model answers, the caller gets
// a NAMED_STOP_NO_FREE_MODEL receipt and must generate nothing. A response that
// reports a non-zero usage.cost throws (FAIL_LOUD), so a model that silently
// stops being free fails the run rather than billing it.
//
// paidLaneAllowed() is the matching gate for the lanes that cannot be free at all
// (OpenRouter's web plugin bills per request): they run only when CONFIRM_PAID is
// exactly "true", which the workflows set only on workflow_dispatch with
// confirm_paid: true.
import fs from 'node:fs';
import path from 'node:path';

export const ROUTING_PATH = 'config/llm_routing.json';
export const DISABLED_STATE = 'DISABLED_BY_OWNER_POLICY';

export function loadRouting(root = process.cwd()) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, ROUTING_PATH), 'utf8'));
  if (cfg?.policy?.max_cost_usd !== 0) throw new Error(`[free-llm-router] FAIL_LOUD: ${ROUTING_PATH} policy.max_cost_usd must be 0, found ${JSON.stringify(cfg?.policy?.max_cost_usd)}`);
  if (cfg?.policy?.fallback_to_paid !== false) throw new Error(`[free-llm-router] FAIL_LOUD: ${ROUTING_PATH} policy.fallback_to_paid must be false`);
  const models = cfg.free_models || [];
  if (!models.length) throw new Error(`[free-llm-router] FAIL_LOUD: ${ROUTING_PATH} lists no free models`);
  for (const m of models) {
    if (String(m?.pricing?.prompt) !== '0' || String(m?.pricing?.completion) !== '0') {
      throw new Error(`[free-llm-router] FAIL_LOUD: ${m?.id} is not priced $0/$0 in ${ROUTING_PATH}`);
    }
  }
  return cfg;
}

// Callers pass process.env.CONFIRM_PAID explicitly, so the read is visible in the
// lane script itself (validate:workflow-step-env-contract traces env names there).
export function paidLaneAllowed(confirmPaid) {
  return confirmPaid === 'true';
}

// Which key is this? GET /api/v1/auth/key describes the calling key without
// exposing it. Only these five fields are kept; the key itself is never printed.
export async function keyInfo(apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch) {
  if (!apiKey) return { status: 'no_key' };
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/auth/key', { headers: { authorization: `Bearer ${apiKey}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { status: `http_${res.status}`, error: String(body?.error?.message || '').slice(0, 120) };
    const d = body?.data || {};
    return { status: 'ok', label: d.label ?? null, limit: d.limit ?? null, usage: d.usage ?? null, is_free_tier: d.is_free_tier ?? null, limit_remaining: d.limit_remaining ?? null };
  } catch (e) {
    return { status: 'error', error: String(e?.message || e).slice(0, 120) };
  }
}

export function paidLaneStopMessage(lane) {
  return `[${lane}] NAMED STOP ${DISABLED_STATE}: this lane bills per call and the owner turned paid model calls off on 11 Oct 2026 ("nothing should be paid"). Nothing was called. To run it once on purpose: workflow_dispatch with confirm_paid: true.`;
}

function reportedCost(payload) {
  const c = payload?.usage?.cost;
  return c === undefined || c === null ? 0 : Number(c);
}

// messages: OpenAI-style chat messages. Returns
//   { ok: true, model, answer, cost_usd: 0, attempts }  or
//   { ok: false, stop: 'NAMED_STOP_NO_FREE_MODEL' | 'NAMED_STOP_CREDENTIAL_REFUSED', reason, attempts }
let keyInfoCache = null;
async function cachedKeyInfo(apiKey, fetchImpl) {
  if (!keyInfoCache) keyInfoCache = await keyInfo(apiKey, fetchImpl);
  return keyInfoCache;
}

export async function freeChat({ messages, maxTokens = 1200, temperature = 0, timeoutMs = 45000, apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch, root } = {}) {
  const cfg = loadRouting(root);
  const attempts = [];
  const key_label = await cachedKeyInfo(apiKey, fetchImpl);
  if (!apiKey) return { ok: false, key_label, stop: 'NAMED_STOP_CREDENTIAL_REFUSED', reason: 'OPENROUTER_API_KEY is not set; free routing needs an enabled key with a $0 limit', attempts };
  for (const m of cfg.free_models) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(cfg.policy.endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: m.id, temperature, max_tokens: maxTokens, messages,
          // usage.include makes OpenRouter report the billed cost on the response,
          // which is what the FAIL_LOUD check below reads.
          usage: { include: true },
          // Pin the request to the exact id: no provider routing to a paid variant.
          provider: { allow_fallbacks: false },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403 || res.status === 402) {
        // The key itself was refused (disabled, revoked, or out of limit). Every
        // other model would be asked with the same key, so stop now and say so:
        // this is a credential stop, not "no free model answered".
        attempts.push({ model: m.id, status: `http_${res.status}`, error: String(payload?.error?.message || '').slice(0, 160) });
        return { ok: false, key_label, stop: 'NAMED_STOP_CREDENTIAL_REFUSED', reason: `OpenRouter key disabled or invalid (HTTP ${res.status}); free routing needs an enabled key with a $0 limit`, attempts };
      }
      if (!res.ok) { attempts.push({ model: m.id, status: `http_${res.status}`, error: String(payload?.error?.message || '').slice(0, 160) }); continue; }
      const cost = reportedCost(payload);
      if (!(cost === 0)) {
        throw new Error(`[free-llm-router] FAIL_LOUD: ${m.id} reported usage.cost=${payload?.usage?.cost}; policy max_cost_usd is 0. Remove it from ${ROUTING_PATH}.`);
      }
      const answer = payload?.choices?.[0]?.message?.content || '';
      if (!answer.trim()) { attempts.push({ model: m.id, status: 'empty_answer' }); continue; }
      attempts.push({ model: m.id, status: 'answered', cost_usd: 0 });
      return { ok: true, key_label, model: payload?.model || m.id, answer, cost_usd: 0, attempts };
    } catch (e) {
      if (String(e?.message || '').includes('FAIL_LOUD')) throw e;
      attempts.push({ model: m.id, status: e?.name === 'AbortError' ? 'timeout' : 'error', error: String(e?.message || e).slice(0, 160) });
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, key_label, stop: 'NAMED_STOP_NO_FREE_MODEL', reason: `none of ${cfg.free_models.length} free model(s) answered`, attempts };
}
