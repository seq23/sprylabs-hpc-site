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
// exposing it. Only these six fields are kept; the key itself is never printed.
export async function keyInfo(apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch) {
  if (!apiKey) return { status: 'no_key' };
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/auth/key', { headers: { authorization: `Bearer ${apiKey}` } });
    // The body read is NOT swallowed: a failed read is an error, never an
    // "ok" key with every field null.
    const body = parseJson(await res.text());
    if (!res.ok) return { status: `http_${res.status}`, error: String(body?.error?.message || '').slice(0, 120) };
    const d = body?.data || {};
    return { status: 'ok', label: d.label ?? null, limit: d.limit ?? null, usage: d.usage ?? null, is_free_tier: d.is_free_tier ?? null, limit_remaining: d.limit_remaining ?? null, disabled: d.disabled ?? null };
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
// Statuses on a chat call that mean the KEY was refused. 403/404 are per model.
export const CREDENTIAL_STATUSES = new Set([401, 402]);

// The key-describing call is the authority on the key itself: a 401/402/403 from
// GET /auth/key, or a key reported disabled, is a credential stop before any
// model is asked. A network error or 5xx there is not (the chat calls decide).
export function keyInfoRefusal(info) {
  if (!info) return null;
  if (/^http_(401|402|403)$/.test(String(info.status))) return `OpenRouter key refused by GET /api/v1/auth/key (${String(info.status).replace('_', ' ').toUpperCase()}); free routing needs an enabled key with a $0 limit`;
  if (info.status === 'ok' && info.disabled === true) return 'OpenRouter key reported disabled by GET /api/v1/auth/key; free routing needs an enabled key with a $0 limit';
  return null;
}

// Reasoning models (the Nemotron 3 family) spend completion tokens thinking
// before they answer; with max_tokens 1200 that budget ran out and content came
// back empty (nemotron-3-ultra 24/25 on run 38154936131, nemotron-3-super on run
// 38932788448). So: low effort, reasoning excluded from the response, and
// headroom on top of the answer budget. If a model still ends on
// finish_reason=length with no content, it is asked once more with reasoning
// off. Free models bill $0 for the extra tokens.
export const REASONING_HEADROOM_TOKENS = 2048;
export const FIRST_REASONING = { effort: 'low', exclude: true };
export const RETRY_REASONING = { enabled: false };
// A 429 with a short Retry-After is honoured once per model, inside one bounded
// budget for the whole call.
export const MAX_RETRY_AFTER_S = 30;
export const RETRY_WAIT_BUDGET_MS = 60000;

function parseJson(text) { try { return JSON.parse(text); } catch { return {}; } }
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

let keyInfoCache = null;
export function resetKeyInfoCache() { keyInfoCache = null; }
async function cachedKeyInfo(apiKey, fetchImpl) {
  if (!keyInfoCache) keyInfoCache = await keyInfo(apiKey, fetchImpl);
  return keyInfoCache;
}

export async function freeChat({ messages, maxTokens = 1200, temperature = 0, timeoutMs = 45000, apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch, sleepImpl = realSleep, root } = {}) {
  const cfg = loadRouting(root);
  const attempts = [];
  const key_label = await cachedKeyInfo(apiKey, fetchImpl);
  if (!apiKey) return { ok: false, key_label, stop: 'NAMED_STOP_CREDENTIAL_REFUSED', reason: 'OPENROUTER_API_KEY is not set; free routing needs an enabled key with a $0 limit', attempts };
  const keyRefusal = keyInfoRefusal(key_label);
  if (keyRefusal) return { ok: false, key_label, stop: 'NAMED_STOP_CREDENTIAL_REFUSED', reason: keyRefusal, attempts };
  let waitBudgetMs = RETRY_WAIT_BUDGET_MS;

  // One HTTP call. The timer covers the headers AND the body download: OpenRouter
  // sends headers early on slow answers, so an abort while the body streams used
  // to be swallowed by res.json().catch(() => ({})) and logged as empty_answer.
  async function callOnce(modelId, reasoning) {
    const ctrl = new AbortController();
    const started = Date.now();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(cfg.policy.endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId, temperature, max_tokens: maxTokens + REASONING_HEADROOM_TOKENS, messages,
          reasoning,
          // usage.include makes OpenRouter report the billed cost on the response,
          // which is what the FAIL_LOUD check reads.
          usage: { include: true },
          // Pin the request to the exact id: no provider routing to a paid variant.
          provider: { allow_fallbacks: false },
        }),
      });
      const payload = parseJson(await res.text());
      return { res, payload, elapsed_ms: Date.now() - started };
    } catch (e) {
      const elapsed_ms = Date.now() - started;
      return { thrown: e, elapsed_ms, timedOut: e?.name === 'AbortError' || ctrl.signal.aborted };
    } finally {
      clearTimeout(timer);
    }
  }

  for (const m of cfg.free_models) {
    let reasoning = FIRST_REASONING;
    let retriedEmpty = false;
    let retried429 = false;
    for (;;) {
      const r = await callOnce(m.id, reasoning);
      if (r.thrown) {
        attempts.push({ model: m.id, status: r.timedOut ? 'timeout' : 'error', elapsed_ms: r.elapsed_ms, error: String(r.thrown?.message || r.thrown).slice(0, 160) });
        break;
      }
      const { res, payload } = r;
      if (CREDENTIAL_STATUSES.has(res.status)) {
        // 401 (bad/revoked key) and 402 (out of credit/limit) are about the key,
        // not the model: every other model would be asked with the same key, so
        // stop now and say so. A 403 or 404 is NOT a credential stop: OpenRouter
        // returns 403 per MODEL (e.g. thinkingmachines/inkling:free, "only
        // available on agentic harnesses", 16 Oct 2026 run 38932788448) while the
        // key is fine, so those fall through to the next model below.
        attempts.push({ model: m.id, status: `http_${res.status}`, error: String(payload?.error?.message || '').slice(0, 160) });
        return { ok: false, key_label, stop: 'NAMED_STOP_CREDENTIAL_REFUSED', reason: `OpenRouter key refused (HTTP ${res.status}); free routing needs an enabled key with a $0 limit`, attempts };
      }
      if (res.status === 429 && !retried429) {
        const after = Number(res.headers?.get?.('retry-after'));
        const waitMs = Math.ceil(after * 1000);
        if (Number.isFinite(after) && after >= 0 && after <= MAX_RETRY_AFTER_S && waitMs <= waitBudgetMs) {
          attempts.push({ model: m.id, status: 'http_429', error: `retry-after ${after}s honoured once` });
          retried429 = true;
          waitBudgetMs -= waitMs;
          await sleepImpl(waitMs);
          continue;
        }
      }
      if (!res.ok) { attempts.push({ model: m.id, status: `http_${res.status}`, error: String(payload?.error?.message || '').slice(0, 160) }); break; }
      const cost = reportedCost(payload);
      if (!(cost === 0)) {
        throw new Error(`[free-llm-router] FAIL_LOUD: ${m.id} reported usage.cost=${payload?.usage?.cost}; policy max_cost_usd is 0. Remove it from ${ROUTING_PATH}.`);
      }
      const answer = payload?.choices?.[0]?.message?.content || '';
      const finish = payload?.choices?.[0]?.finish_reason ?? 'none';
      if (!answer.trim()) {
        attempts.push({ model: m.id, status: 'empty_answer', error: `finish_reason=${finish}` });
        if (finish === 'length' && !retriedEmpty) { retriedEmpty = true; reasoning = RETRY_REASONING; continue; }
        break;
      }
      attempts.push({ model: m.id, status: 'answered', cost_usd: 0 });
      return { ok: true, key_label, model: payload?.model || m.id, answer, cost_usd: 0, attempts };
    }
  }
  return { ok: false, key_label, stop: 'NAMED_STOP_NO_FREE_MODEL', reason: `none of ${cfg.free_models.length} free model(s) answered`, attempts };
}
