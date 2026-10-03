#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readCapturedScope} from './page_scope.mjs';
import {examinePageSeoContract, acceptanceEntriesByPath, activePlanSpecs as activeSpecsOf} from '../lib/page_seo_contract.mjs';

const ROOT = process.cwd();
const mode = process.argv.includes('--full') || process.env.VALIDATION_CACHE_MODE === 'full' ? 'full' : 'incremental';
// The rules themselves live in scripts/lib/page_seo_contract.mjs, shared with
// the agent-intake hold stage so a held page and a failed page are judged by
// one definition. This file owns the examination scope and the verdict.

// The old readJson(rel, fallback) had a bare `catch { return fallback; }`, so a
// MISSING or CORRUPT artifact was indistinguishable from a present, empty one:
// the incremental examination set silently became "no pages" and the run reported
// PASS. Absence and corruption hard-fail here, naming the artifact and the command
// that produces it; a present-but-legitimately-empty collection still passes
// through, and is floored separately where it is used.
function readRequiredJson(rel, produced) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[validate:page-seo-contract] FAIL: required artifact ${rel} is missing; produce it with \`${produced}\`. Treating a missing artifact as an empty examination set proves nothing.`);
    process.exit(1);
  }
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (error) {
    console.error(`[validate:page-seo-contract] FAIL: required artifact ${rel} is not valid JSON (${error.message}); regenerate it with \`${produced}\`. Treating a corrupt artifact as an empty examination set proves nothing.`);
    process.exit(1);
  }
}
function pathToRel(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }
function activePlanSpecs() {
  return activeSpecsOf(readRequiredJson('artifacts/validation/agent-exact-implementation-plan.json', 'npm run agent:bhpc:plan-exact'));
}
function citablePagePaths() {
  const registry = readRequiredJson('data/citation/citable_pages.json', 'npm run build:all');
  return (registry.pages || [])
    .filter(x => (x.status || 'ACTIVE') === 'ACTIVE' && x.path)
    .map(x => String(x.path).replace(/^\/+/, ''));
}
function activePaths() {
  return new Set(activePlanSpecs().map(x => String(x.implementation_path).replace(/^\/+/, '')));
}
function activeAcceptanceIds() {
  return new Set(activePlanSpecs().flatMap(x => x.acceptance_ids || []).map(String));
}
function acceptanceByPath() {
  const manifest = readRequiredJson('data/report_fixes/agent_acceptance_manifest.generated.json', 'npm run agent:bhpc:compile-acceptance');
  return acceptanceEntriesByPath(manifest, activeAcceptanceIds());
}

const active = activePaths();
const acceptance = acceptanceByPath();
const usingCapturedScope = mode !== 'full' && Boolean(process.env.VALIDATION_PAGE_SCOPE_FILE);
const scopedPaths = mode === 'full'
  ? citablePagePaths()
  : usingCapturedScope
    ? readCapturedScope(process.env.VALIDATION_PAGE_SCOPE_FILE).paths
    : [...active];

// A full run examines every ACTIVE page in data/citation/citable_pages.json, so
// an empty scope there means the registry is empty and nothing was examined at
// all. The two incremental sources are allowed to be empty - a captured scope
// legitimately holds no path when nothing changed (readCapturedScope already
// hard-fails when that file is missing or not READY), and the plan artifact is
// now read strictly rather than defaulted to {specs: []}.
if (mode === 'full' && !scopedPaths.length) {
  console.error('[validate:page-seo-contract] FAIL: mode=full produced 0 pages to examine; expected at least one ACTIVE page in data/citation/citable_pages.json. A page contract that examines no page proves nothing.');
  process.exit(1);
}

const failures = [];
const warnings = [];
const checked = [];

// `.filter(fs.existsSync)` silently DISCARDED every scoped path that is not on
// disk - which is exactly the failure this validator exists to catch. A page the
// plan says was written, but that was never written, simply left the examination
// set and the run passed. A scoped path with no file is now a failure.
const files = [];
for (const rel of scopedPaths) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { failures.push({path: rel, code: 'SCOPED_PAGE_MISSING'}); continue; }
  files.push(abs);
}

for (const abs of files) {
  const rel = pathToRel(abs);
  const html = fs.readFileSync(abs, 'utf8');
  const verdict = examinePageSeoContract({rel, html, acceptanceEntries: acceptance.get(rel) || [], active: active.has(rel)});
  failures.push(...verdict.failures);
  warnings.push(...verdict.warnings);
  checked.push(rel);
}

const report = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  mode,
  status: failures.length ? 'FAIL' : 'PASS',
  files_checked: checked.length,
  active_paths: [...active].sort(),
  failure_count: failures.length,
  warning_count: warnings.length,
  failures,
  warnings
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/page-seo-contract.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[validate:page-seo-contract] ${report.status}: mode=${mode}; files=${checked.length}; failures=${failures.length}; warnings=${warnings.length}`);
process.exit(report.status === 'PASS' ? 0 : 1);
