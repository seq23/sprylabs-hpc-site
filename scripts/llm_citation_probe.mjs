#!/usr/bin/env node
/**
 * Ask an answer engine a real question and record whether it cites us.
 *
 * This is the measurement the portfolio did not have. The existing
 * query:test:zero-cost task makes no network calls at all - it prints a
 * worksheet and a CSV for a human to fill in by hand - so nothing has ever
 * observed whether these pages are cited. Every statement about AEO progress up
 * to now has been inference from proxies.
 *
 * Grounded mode asks OpenRouter's web plugin, and the response carries the pages
 * the answer was actually built from as message.annotations[].url_citation. That
 * is a citation observation: the query, the engine, the domains it cited, and
 * whether any of them are ours. Google GenAI grounding was tried first and is
 * hard-blocked on this project's key - see the PROVIDER comment below.
 *
 * What this does not claim: one engine is not all engines, grounding metadata is
 * not identical to what a user sees in an AI Overview, and absence on a given
 * day is weak evidence. Runs are recorded individually with timestamps so a
 * trend can be read later rather than a single run being treated as a verdict.
 *
 * Without an API key it exits 0 and records the named skip in the observations
 * file. A measurement tool that fails the build when it has no credential
 * teaches people to remove it. It does exit non-zero when it had a credential,
 * made calls, and the provider answered none of them - that is a broken
 * measurement, not an absent one, and it must not pass quietly.
 *
 * Cost policy (owner, 11 Oct 2026: "nothing should be paid"): knowledge mode
 * asks only the $0/$0 models in config/llm_routing.json via the free router;
 * grounded mode is billed per request by the web plugin whatever the model, so
 * it refuses with DISABLED_BY_OWNER_POLICY unless CONFIRM_PAID=true (set only by
 * a workflow_dispatch with confirm_paid: true). The Gemini path is removed.
 *
 * Usage: node llm_citation_probe.mjs [--queries file] [--limit N] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { WEB_PLUGIN as webPlugin, citationUrls } from './lib/openrouter_web_citations.mjs';
import { freeChat, paidLaneAllowed, paidLaneStopMessage, DISABLED_STATE, loadRouting } from './lib/free_llm_router.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const DRY = argv.includes('--dry-run');
const MODE = arg('--mode', process.env.CITATION_PROBE_MODE || 'knowledge');
const GROUNDED = MODE === 'grounded';
const LIMIT = Number(arg('--limit', '25'));
const OUT = 'data/signals/llm_citation_observations.json';

const CONFIG_PATH = 'data/signals/citation_probe_config.json';
const config = fs.existsSync(path.join(ROOT, CONFIG_PATH))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, CONFIG_PATH), 'utf8'))
  : {};
const OWNED = (config.owned_domains || []).map((d) => d.toLowerCase().replace(/^www\./, ''));
if (!OWNED.length) {
  console.error(`citation probe: no owned_domains in ${CONFIG_PATH} - cannot tell a citation of ours from anyone else's`);
  process.exit(1);
}

function loadQueries() {
  const file = arg('--queries', config.queries_file || 'data/seo/priority_queries.json');
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return [];
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.queries || raw.priority_queries || raw.entries || []);
  return rows.map((r) => (typeof r === 'string' ? r : r.query || r.text || '')).filter(Boolean).slice(0, LIMIT);
}

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

// Two modes, kept distinct because they measure different things and conflating
// them would overstate what is known.
//
//   knowledge (default) - ask without tools and see whether the model names us
//     unprompted. This measures whether we exist in the model's answer at all.
//     It is free.
//   grounded - ask with live web retrieval and read the sources the answer was
//     actually built from. This is a real citation observation and the stronger
//     signal. It is billed per search, so it is run against a bounded query list.
//
// Default is knowledge, because a probe that cannot run costs more than a weaker
// probe that does.

const queries = loadQueries();
if (!queries.length) { console.error('citation probe: no queries found'); process.exit(1); }

const orKey = process.env.OPENROUTER_API_KEY || '';
const PROVIDER = 'openrouter';
// Knowledge mode: the free router decides the model, from config/llm_routing.json.
const OR_MODELS = loadRouting(ROOT).free_models.map((m) => m.id);

// Free models are heavily shared and some hang. A timed-out model is recorded as
// an error against that model, not as an absence of citations.
const REQUEST_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 25000);
async function withTimeout(fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try { return await fn(ctrl.signal); }
  finally { clearTimeout(t); }
}

// The web plugin runs the model against live web results; the pages it used come
// back as url_citation annotations. It is billed per request.
const WEB_PLUGIN = webPlugin(process.env.PROBE_WEB_MAX_RESULTS || 10);
const openRouterCitations = citationUrls;

// Grounded (PAID) only. Reached only when paidLaneAllowed() is true.
async function askOpenRouterGrounded(query, model) {
  const requestModel = model.replace(/:online$/, '');
  const res = await withTimeout((signal) => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${orKey}` },
    body: JSON.stringify({
      model: requestModel, temperature: 0, max_tokens: 400,
      plugins: WEB_PLUGIN,
      messages: [{ role: 'user', content: query }],
    }),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
  const answer = data?.choices?.[0]?.message?.content || '';
  return { ok: true, answer, uris: openRouterCitations(data) };
}

// Knowledge (FREE). Every call goes through the free router; no paid fallback.
let routerStop = null;
let keyLabelPrinted = false;
let lastKeyLabel = null;
async function askFree(query) {
  const r = await freeChat({ messages: [{ role: 'user', content: query }], maxTokens: 1200, timeoutMs: REQUEST_TIMEOUT_MS, apiKey: orKey });
  if (!keyLabelPrinted) { keyLabelPrinted = true; console.log(`  [free-router] key_label ${JSON.stringify(r.key_label)}`); lastKeyLabel = r.key_label; }
  for (const a of r.attempts) console.log(`  [free-router] ${a.model} -> ${a.status}${a.elapsed_ms != null ? ` after ${a.elapsed_ms}ms` : ''}${a.error ? ` (${a.error.slice(0, 80)})` : ''}`);
  if (!r.ok) { routerStop = r; return { ok: false, error: `${r.stop}: ${r.reason}`, stop: r.stop }; }
  return { ok: true, answer: r.answer, uris: [], model: r.model };
}

const now = new Date().toISOString();

function recordSkip(reason, state) {
  const skipDoc = fs.existsSync(path.join(ROOT, OUT))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, OUT), 'utf8'))
    : { schema_version: '1.0', runs: [] };
  skipDoc.last_skip = { at: now, provider: PROVIDER, mode: MODE, state, reason, queries_ready: queries.length };
  fs.mkdirSync(path.join(ROOT, path.dirname(OUT)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(skipDoc, null, 2) + '\n');
}

if (GROUNDED && !paidLaneAllowed(process.env.CONFIRM_PAID)) {
  const msg = paidLaneStopMessage('citation-probe');
  recordSkip(msg, DISABLED_STATE);
  console.log(msg);
  process.exit(0);
}
if (!orKey || DRY) {
  // Named stop, recorded rather than only printed.
  const reason = DRY ? 'dry_run' : 'OPENROUTER_API_KEY is not set; free routing needs an enabled key with a $0 limit';
  recordSkip(reason, DRY ? 'DRY_RUN' : 'NAMED_STOP_CREDENTIAL_REFUSED');
  console.log(`citation probe: SKIPPED (named) - ${reason}; mode=${MODE}; ${queries.length} queries ready, owned domains: ${OWNED.join(', ')}`);
  process.exit(0);
}

const observations = [];
// Grounded mode (paid, confirm_paid only) bills per search; one model keeps it
// in cents. Knowledge mode is one free-router call per query.
const GROUNDED_MODELS = (process.env.OPENROUTER_GROUNDED_MODELS || config.openrouter_grounded_model || 'openai/gpt-4o-mini')
  .split(',').map((m) => m.trim()).filter(Boolean);
const engines = GROUNDED ? GROUNDED_MODELS : ['free-router'];
for (const q of queries) {
 for (const engineModel of engines) {
  let r;
  try {
    r = GROUNDED ? await askOpenRouterGrounded(q, engineModel) : await askFree(q);
  } catch (e) { r = { ok: false, error: String(e.message || e) }; }
  if (!r.ok && r.stop) break;
  if (!r.ok) {
    observations.push({ query: q, engine: `${PROVIDER}:${engineModel}`, mode: MODE, observed_at: now, status: 'provider_error', error: r.error });
    console.log(`  ERROR  ${engineModel} :: ${q} :: ${String(r.error).slice(0, 70)}`);
    continue;
  }
  const domains = [...new Set(r.uris.map(hostOf).filter(Boolean))];
  const ours = domains.filter((d) => OWNED.some((o) => d === o || d.endsWith(`.${o}`)));
  // In knowledge mode there are no grounded sources, so presence means the model
  // named the brand or domain in its own answer.
  const answerLower = (r.answer || '').toLowerCase();
  const named = OWNED.filter((o) => answerLower.includes(o) || answerLower.includes(o.split('.')[0]));
  observations.push({
    query: q, engine: `${PROVIDER}:${r.model || engineModel}`, mode: MODE, observed_at: now,
    status: 'observed', cost_usd: GROUNDED ? null : 0,
    cited_domains: domains,
    cited_ours: ours,
    self_cited: GROUNDED ? ours.length > 0 : named.length > 0,
    named_in_answer: named,
    answer_mentions_brand: named.length > 0,
  });
  const hit = GROUNDED ? ours.length > 0 : named.length > 0;
  console.log(`  ${hit ? 'PRESENT' : '   --  '} ${engineModel.split('/').pop()} :: ${q}${hit ? ` (${(GROUNDED ? ours : named).join(', ')})` : ''}`);
 }
 if (routerStop) break;
}

const prior = fs.existsSync(path.join(ROOT, OUT))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, OUT), 'utf8'))
  : { schema_version: '1.0', runs: [] };
prior.runs = (prior.runs || []).slice(-49);
prior.runs.push({ run_at: now, provider: PROVIDER, engines, mode: MODE, queries: queries.length, key_label: lastKeyLabel, observations });

const cited = observations.filter((o) => o.self_cited).length;
const errored = observations.filter((o) => o.status === 'provider_error').length;
// A rate may only exist when the provider answered.
//
// This used to divide by every observation including the ones where the call
// errored, so a run in which the provider refused every request recorded
// "self_cited_rate_pct: 0" - a number that reads as "nobody cites us" and
// actually means "nothing was measured". The denominator is now the answered
// observations, and with none the rate is null and the run is marked
// NOT_MEASURED rather than zero.
const answered = observations.filter((o) => o.status === 'observed').length;
prior.latest_summary = {
  run_at: now, provider: PROVIDER, engines, mode: MODE,
  queries: queries.length, observations: observations.length,
  answered, self_cited: cited, errored,
  measurement_state: answered ? 'MEASURED' : 'NOT_MEASURED',
  _mode_note: GROUNDED
    ? 'grounded: counted when the answer was built from one of our pages'
    : 'knowledge: counted when the model named us unprompted, with no retrieval. Weaker than a citation and must not be reported as one.',
  _rate_basis: 'self_cited / answered observations. null when the provider answered nothing - an unmeasured run is not a zero.',
  self_cited_rate_pct: answered ? Number(((100 * cited) / answered).toFixed(1)) : null,
};

fs.mkdirSync(path.join(ROOT, path.dirname(OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(prior, null, 2) + '\n');
console.log(answered
  ? `citation probe [${PROVIDER}/${MODE}]: ${cited}/${answered} answered observations named one of our domains (${prior.latest_summary.self_cited_rate_pct}%); ${errored} provider error(s). Recorded in ${OUT}`
  : `citation probe [${PROVIDER}/${MODE}]: NOT_MEASURED - the provider answered none of ${observations.length} attempt(s) (${errored} error(s)); no rate recorded. See ${OUT}`);
// The free router's named stops are a receipt, not a failure: nothing was
// generated, nothing was paid, and the reason is recorded by name.
if (!answered && routerStop) {
  recordSkip(`${routerStop.stop}: ${routerStop.reason}; key_label=${JSON.stringify(lastKeyLabel)}`, routerStop.stop);
  console.log(`citation probe: NAMED STOP ${routerStop.stop} - ${routerStop.reason}. Nothing generated, $0 spent.`);
  process.exit(0);
}
if (!GROUNDED) console.log(`citation probe RECEIPT: free router, ${answered} answered, models used: ${[...new Set(observations.filter((o) => o.status === 'observed').map((o) => o.engine))].join(', ')}, cost_usd=0, key_label=${JSON.stringify(lastKeyLabel)}`);
process.exit(answered ? 0 : 1);
