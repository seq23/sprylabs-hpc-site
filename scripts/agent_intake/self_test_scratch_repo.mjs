// The scratch repository the exact-agent self-tests run the REAL plan builder,
// applier and admission gate in, with cwd = scratch. Shared so the admission
// self-test and the demand-gate self-test replay the same 2026-09-19 artifact
// against the same tree and cannot drift apart in what "a created page" means.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {MEASURED_DEMAND_PATH} from '../lib/measured_demand.mjs';
import {REJECTION_BACKLOG_PATH} from '../lib/rejection_backlog.mjs';

export const REAL_ROOT = fs.realpathSync(process.cwd());
export const FIXTURES = path.join(REAL_ROOT, 'fixtures/validation/agent_created_page_admission');
export const PAGES = ['insights/chatgpt-prompts-to-help-executive-coaches-scale.html', 'insights/how-to-use-chatgpt-as-your-life-and-leadership-coach.html'];
export const QUERIES = ['ChatGPT prompts to help executive coaches scale', 'how to use ChatGPT as your life and leadership coach'];
export const PLAN = 'artifacts/validation/agent-exact-implementation-plan.json';
export const SPECS = 'data/citation/agent_page_specs.generated.json';
export const REGISTRY = 'data/content/page_admission_registry.json';

export function readJson(abs) { return JSON.parse(fs.readFileSync(abs, 'utf8')); }
export function writeJson(abs, doc) { fs.mkdirSync(path.dirname(abs), {recursive: true}); fs.writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n'); }

/**
 * An owner_approved_seed record for a fixture query: the shape the demand gate
 * accepts as demand without a measured volume. approved_by names the fixture,
 * never the owner - this is a scratch tree, not data/demand/measured_demand.json.
 */
export function seedRecord(query) {
  return {query, query_normalized: query.toLowerCase().trim(), volume: null, keyword_difficulty: null, source_type: 'owner_approved_seed', evidence_tier: 'T3', target_domain: 'spryexecutiveos.com', approved_by: 'self-test fixture', approved_at: '2026-09-19', aliases: []};
}

/** Write measured_demand.json in the scratch with exactly these queries seeded. */
export function seedDemand(root, queries) {
  writeJson(path.join(root, MEASURED_DEMAND_PATH), {schema_version: '1.0', record_count: queries.length, records: queries.map(seedRecord)});
}

/**
 * A scratch repository the real scripts can run in. `demand` is the list of
 * fixture queries that get a demand record; the default seeds every fixture
 * query so the admission self-test judges quality, not demand.
 */
export function makeScratch({demand = QUERIES} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-created-page-')));
  const mk = (rel) => fs.mkdirSync(path.join(root, rel), {recursive: true});
  for (const d of ['scripts/validation', 'data/report_fixes/normalized_agent_runs', 'data/citation', 'data/content', 'data/demand', 'data/page_contracts', 'data/programmatic', 'insights', 'artifacts/validation']) mk(d);
  // JS scripts resolve ROOT from cwd, so the real directories can be linked.
  // The Python validator resolves ROOT from its OWN location, so it is copied.
  fs.symlinkSync(path.join(REAL_ROOT, 'scripts/agent_intake'), path.join(root, 'scripts/agent_intake'));
  fs.symlinkSync(path.join(REAL_ROOT, 'scripts/lib'), path.join(root, 'scripts/lib'));
  for (const f of ['validate_programmatic_admission.py', 'style_policy.py']) fs.copyFileSync(path.join(REAL_ROOT, 'scripts/validation', f), path.join(root, 'scripts/validation', f));
  // protected_buyer_pages.json: the acceptance parser (reached through the plan
  // builder) reads the shared protected-buyer-page list at import and refuses
  // to load without it, so the scratch tree carries the real list.
  for (const f of ['data/report_fixes/agent_exact_implementation_policy.json', 'data/content/programmatic_lane_contracts.json', 'data/citation/health_adjacent_content_contract.json', 'data/demand/pre_gate_page_baseline.json', 'data/page_contracts/protected_buyer_pages.json']) fs.copyFileSync(path.join(REAL_ROOT, f), path.join(root, f));
  fs.copyFileSync(path.join(FIXTURES, 'normalized_agent_run.json'), path.join(root, 'data/report_fixes/normalized_agent_runs/2026-09-19_bhpc.json'));
  fs.copyFileSync(path.join(FIXTURES, 'citable_pages.json'), path.join(root, 'data/citation/citable_pages.json'));
  writeJson(path.join(root, 'data/citation/query_registry.json'), {queries: []});
  writeJson(path.join(root, REGISTRY), {schema_version: '1.0', records: [], record_count: 0});
  writeJson(path.join(root, REJECTION_BACKLOG_PATH), {schema_version: '1.1-compact', rejections: []});
  if (demand) seedDemand(root, demand);
  return root;
}
export function placeFixtures(root, set) {
  for (const rel of PAGES) fs.copyFileSync(path.join(FIXTURES, set, path.basename(rel)), path.join(root, rel));
}
export function runNode(root, script) {
  const r = spawnSync(process.execPath, [path.join(root, script)], {cwd: root, encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`${script} exited ${r.status} in ${root}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
export function plan(root) { runNode(root, 'scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs'); return readJson(path.join(root, PLAN)); }
export function apply(root) { return runNode(root, 'scripts/agent_intake/apply_bhpc_agent_exact_implementation.mjs'); }
