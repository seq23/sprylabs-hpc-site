#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {applyBhpcInternalLinkMutations} from '../lib/bhpc_link_mutations.mjs';

const ROOT = process.cwd();
function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
}
function writeJson(rel, value) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + '\n');
}

const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const activeIds = new Set((plan.specs || []).filter(spec => spec.status === 'PLANNED').flatMap(spec => spec.acceptance_ids || []).map(String));
const entries = (manifest.entries || []).filter(entry => activeIds.has(String(entry.id)) && entry.acceptance_status === 'REQUIRED');
const report = applyBhpcInternalLinkMutations({root: ROOT, entries, runDate: plan.active_run_date || 'active'});
writeJson('artifacts/validation/bhpc-agent-internal-link-mutations.json', report);
writeJson('reports/bhpc-agent-internal-link-mutations.json', report);
if (report.status !== 'PASS') {
  console.error(`[bhpc-agent-link-mutations] FAIL: ${report.errors.length} issue(s)`);
  for (const error of report.errors.slice(0, 80)) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-link-mutations] PASS: mutations=${report.mutation_count}; applied=${report.applied_count}; sources=${report.touched_paths.length}`);
