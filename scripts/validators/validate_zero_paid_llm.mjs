#!/usr/bin/env node
// validate:zero-paid-llm - owner, 11 Oct 2026: "nothing should be paid ... cut the
// probes and make them free."
//
// Refuses, by reading the code and workflows rather than any prose:
//  1. config/llm_routing.json holding anything but $0/$0 ":free" models, a
//     max_cost_usd other than 0, a paid fallback, or no dated pricing snapshot.
//  2. Any script that sends a request to a model provider other than the free
//     router (scripts/lib/free_llm_router.mjs) or a paid lane listed in
//     paid_lanes - and every paid lane must gate on paidLaneAllowed().
//  3. A scheduled workflow exposing a model-provider secret to a step that a
//     schedule can reach, or a paid-lane step whose CONFIRM_PAID is not
//     gated on workflow_dispatch + inputs.confirm_paid (default false).
// Hard-fails on zero items scanned. Evidence: artifacts/validation/zero-paid-llm.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
const evidence = { checked_at: new Date().toISOString(), free_models: [], model_callers: [], workflows_scanned: 0, scheduled_workflows: [], provider_secret_refs: [] };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. Routing config
const ROUTING = 'config/llm_routing.json';
let routing = {};
try { routing = JSON.parse(rd(ROUTING)); } catch (e) { errors.push(`${ROUTING}: unreadable (${e.message})`); }
if (routing?.policy?.max_cost_usd !== 0) errors.push(`${ROUTING}: policy.max_cost_usd must be 0`);
if (routing?.policy?.fallback_to_paid !== false) errors.push(`${ROUTING}: policy.fallback_to_paid must be false`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(routing?.pricing_snapshot?.taken_at || ''))) errors.push(`${ROUTING}: pricing_snapshot.taken_at must be a YYYY-MM-DD date`);
const models = routing?.free_models || [];
if (models.length < 1) errors.push(`${ROUTING}: free_models is empty - zero items is a failure, not a pass`);
for (const m of models) {
  evidence.free_models.push(m?.id);
  if (String(m?.pricing?.prompt) !== '0' || String(m?.pricing?.completion) !== '0') errors.push(`${ROUTING}: ${m?.id} is not priced $0/$0`);
  if (!String(m?.id || '').endsWith(':free')) errors.push(`${ROUTING}: ${m?.id} is not a ":free" variant; a paid id can be priced 0 today and billed tomorrow`);
}

// 2. Model callers in code
const PROVIDER_HOST = /(openrouter\.ai\/api|generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|api\.perplexity\.ai|serpapi\.com|api\.groq\.com|api\.together\.xyz|api\.mistral\.ai|api\.deepseek\.com)/;
const ROUTER = 'scripts/lib/free_llm_router.mjs';
const paidScripts = Object.entries(routing?.paid_lanes || {}).filter(([k]) => !k.startsWith('_')).map(([, v]) => v?.script).filter(Boolean);
if (!paidScripts.length) errors.push(`${ROUTING}: paid_lanes lists no scripts; the probe lanes must be named so they can be gated`);
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(rel, out); }
    else if (/\.(m?js|cjs|py|sh)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const codeFiles = [...walk('scripts'), ...walk('.github/scripts')];
if (!codeFiles.length) errors.push('no code files scanned under scripts/ - zero items is a failure, not a pass');
for (const f of codeFiles) {
  const src = rd(f);
  const calls = /\bfetch\s*\(|requests\.(post|get)\(|urlopen\(|curl\s/.test(src);
  if (!calls || !PROVIDER_HOST.test(src)) continue;
  evidence.model_callers.push(f);
  if (paidScripts.includes(f)) {
    if (!/paidLaneAllowed\(process\.env\.CONFIRM_PAID\)/.test(src)) errors.push(`${f}: paid lane does not gate on paidLaneAllowed(process.env.CONFIRM_PAID)`);
    continue;
  }
  errors.push(`${f}: calls a model provider outside the free router (${ROUTER}) and is not a gated paid lane in ${ROUTING}`);
}
// The router takes its endpoint from the routing config, so it is checked by shape.
{
  const src = fs.existsSync(path.join(ROOT, ROUTER)) ? rd(ROUTER) : '';
  if (!/fetchImpl\(cfg\.policy\.endpoint/.test(src)) errors.push(`${ROUTER}: the free router is missing or does not call ${ROUTING} policy.endpoint`);
  if (!src.includes('FAIL_LOUD') || !src.includes('usage: { include: true }')) errors.push(`${ROUTER}: must request usage.include and FAIL_LOUD on a non-zero reported cost`);
  if (!src.includes('loadRouting(')) errors.push(`${ROUTER}: must read its model list from ${ROUTING}`);
  if (!/^https:\/\/openrouter\.ai\/api\/v1\/chat\/completions$/.test(String(routing?.policy?.endpoint || ''))) errors.push(`${ROUTING}: policy.endpoint must be the OpenRouter chat endpoint`);
}

// 3. Workflows
const SECRET = /secrets\.(OPENROUTER|GEMINI|GOOGLE_GEMINI|OPENAI|ANTHROPIC|PERPLEXITY|SERPAPI)\w*/;
const GATE = /github\.event_name == 'workflow_dispatch' && inputs\.confirm_paid/;
const PAID_STEP = /llm_citation_probe|search:observe|search:intelligence-cycle|workflow:search-intelligence/;
const wfDir = '.github/workflows';
const workflows = fs.readdirSync(path.join(ROOT, wfDir)).filter((f) => /\.ya?ml$/.test(f));
evidence.workflows_scanned = workflows.length;
if (!workflows.length) errors.push('no workflows scanned - zero items is a failure, not a pass');
const indentOf = (l) => l.match(/^\s*/)[0].length;
for (const wf of workflows) {
  const rel = `${wfDir}/${wf}`;
  const lines = rd(rel).split('\n');
  const scheduled = lines.some((l) => /^\s+schedule:\s*$/.test(l));
  if (scheduled) evidence.scheduled_workflows.push(rel);
  // Steps: a "- " list item inside steps:
  const stepStarts = [];
  lines.forEach((l, i) => { if (/^\s*- (name|uses|run|if|id|env):?/.test(l) || /^\s*- [a-z_-]+:/.test(l)) stepStarts.push(i); });
  const stepOf = (i) => {
    let s = -1; for (const st of stepStarts) if (st <= i) s = st;
    if (s < 0) return null;
    const ind = indentOf(lines[s]);
    let e = s + 1; while (e < lines.length && !(lines[e].trim() && indentOf(lines[e]) <= ind)) e++;
    return lines.slice(s, e).join('\n');
  };
  lines.forEach((l, i) => {
    if (!SECRET.test(l) || /^\s*#/.test(l)) return;
    const step = stepOf(i);
    const ref = `${rel}:${i + 1}`;
    evidence.provider_secret_refs.push(ref);
    if (!step) { errors.push(`${ref}: model-provider secret outside any step (workflow/job env reaches every step)`); return; }
    if (!scheduled) return;
    const stepIfDispatch = /\n?\s*-?\s*if:.*github\.event_name == 'workflow_dispatch'/.test(step);
    if (!GATE.test(l) && !stepIfDispatch) errors.push(`${ref}: scheduled workflow exposes a model-provider secret to a step a schedule can reach`);
  });
  if (!scheduled) continue;
  for (const st of stepStarts) {
    const step = stepOf(st);
    if (!step || !PAID_STEP.test(step.split('\n').filter((x) => !/^\s*#/.test(x)).join('\n'))) continue;
    if (!/^\s+WORKFLOW_ARGV:/m.test(step) && !/CONFIRM_PAID:/.test(step)) errors.push(`${rel}:${st + 1}: step runs a paid lane with no CONFIRM_PAID env`);
    const cp = step.match(/CONFIRM_PAID:\s*(.*)/);
    if (cp && !GATE.test(cp[1])) errors.push(`${rel}:${st + 1}: CONFIRM_PAID is not gated on workflow_dispatch + inputs.confirm_paid`);
    if (cp) {
      const src = lines.join('\n');
      const input = src.match(/confirm_paid:\s*\n((?:\s{8,}.*\n)+)/);
      if (!input || !/type:\s*boolean/.test(input[1]) || !/default:\s*false/.test(input[1])) errors.push(`${rel}: workflow_dispatch input confirm_paid must be boolean, default false`);
    }
  }
}

fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/zero-paid-llm.json'), JSON.stringify({ ...evidence, errors, status: errors.length ? 'FAIL' : 'PASS' }, null, 2) + '\n');
if (errors.length) { console.error(`[validate:zero-paid-llm] FAIL (${errors.length})`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
console.log(`[validate:zero-paid-llm] PASS free_models=${models.length} model_callers=${evidence.model_callers.length} (${evidence.model_callers.join(', ')}) workflows=${workflows.length} scheduled=${evidence.scheduled_workflows.length} provider_secret_refs=${evidence.provider_secret_refs.length}`);
