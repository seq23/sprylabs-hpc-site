#!/usr/bin/env node
// The admission gate for pages the exact-agent lane CREATES, run BEFORE anything
// commits and BEFORE the corpus run of validate:programmatic-admission.
//
// ─── WHY THIS STAGE EXISTS ─────────────────────────────────────────────────
//
// Spry Content Release run 35477412322 (commit 3f0a52f7f, 2026-09-19) created
// three insights pages through agent:bhpc:apply-exact, ran
// validate:programmatic-admission fifty seconds later, printed
// "PASS: 1625/1625 pages admitted", and committed. Two of the three were 76%
// identical in the block that validator compares. It passed because it judges
// the pages REGISTERED in data/content/page_admission_registry.json, and the
// three were registered ninety seconds after it ran, by
// apply_citation_program.sync_agent_page_admission_records() in build:postprocess,
// which admits every generated agent page it finds on disk with no gate. The next
// Validate Repo on main (35514776878) read the registered pair and went red.
//
// The class defect: a guard that cannot reach what it governs. The corpus run
// only ever sees pages some earlier writer already admitted, so a writer that
// admits without the gate is invisible to it until the next push.
//
// ─── WHAT THIS STAGE DOES ──────────────────────────────────────────────────
//
// 1. Finds every CREATE_NEW_TARGET_PAGE spec in the plan whose page is on disk
//    and NOT yet ADMITTED in the registry. Those are candidates - nothing else.
// 2. Writes them to data/content/programmatic_candidate_manifest.json and runs
//    validate_programmatic_admission.py --candidate-only, the SAME validator with
//    the SAME thresholds the corpus run uses: per-page quality, query collision,
//    similarity against every admitted page, and similarity between the
//    candidates themselves (that last one is the pair this exists for).
// 3. Accepted candidates are registered ADMITTED, exactly as the postbuild
//    writer would have, so the corpus run and the postbuild both see them.
// 4. Rejected candidates are REMOVED from the tree (they were created this run
//    and never committed - nothing published is touched), recorded in
//    data/content/agent_page_quarantine.json and data/programmatic/rejection_backlog.json,
//    and the plan is rebuilt so the spec reads BLOCKED with the gate's reason.
//
// Exit codes follow the runbook: a content-quality rejection is a NAMED outcome,
// exit 0, never a red release. Zero candidates is also named (the artifact carries
// stop_reason; validate:no-silent-zero-work reads it). A validator that cannot run
// is an infrastructure fault and propagates its exit code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readQuarantine, writeQuarantine, specFingerprint, QUARANTINE_LANE} from '../lib/agent_page_quarantine.mjs';
import {writeRejectionBacklog} from '../lib/rejection_backlog.mjs';

const require = createRequire(import.meta.url);
const {admissionLevelFor, sealedRoutes} = require('../lib/admission_level.js');

export const ARTIFACT_PATH = 'artifacts/validation/agent-created-page-admission.json';
const PLAN_PATH = 'artifacts/validation/agent-exact-implementation-plan.json';
const SPECS_PATH = 'data/citation/agent_page_specs.generated.json';
const REGISTRY_PATH = 'data/content/page_admission_registry.json';
const CANDIDATE_MANIFEST_PATH = 'data/content/programmatic_candidate_manifest.json';
const TAG = '[bhpc-agent-admit-created]';

function readJson(abs, fallback) {
  if (!fs.existsSync(abs)) return fallback;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}
function writeJson(abs, doc) {
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  fs.writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n');
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function today() { return new Date().toISOString().slice(0, 10); }

/**
 * The registry row the postbuild writer would have minted for this page, so the
 * two writers cannot disagree about what an admitted agent page looks like.
 * Mirrors apply_citation_program.sync_agent_page_admission_records().
 */
function candidateRecord(root, pagePath, spec, sealed) {
  const html = fs.readFileSync(path.join(root, pagePath), 'utf8');
  const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i) || [])[1] || '';
  let domain = '';
  // Non-fatal: an unparseable canonical only means the domain falls back to the
  // path-derived default below, the same default the Python writer uses.
  try { domain = canonical ? new URL(canonical).hostname.toLowerCase() : ''; } catch { domain = ''; }
  // The same route string apply_citation_program.sync_agent_page_admission_records
  // writes ('/' + path), because validate:authority-admission-honesty looks the
  // seal up by the record's own route and both writers must ask the same question.
  const route = '/' + pagePath;
  return {
    path: pagePath,
    route,
    canonical_domain: domain || (pagePath.startsWith('insights/') ? 'spryexecutiveos.com' : 'billionairehighperformancecoach.com'),
    generation_lane: 'legacy',
    admission_level: admissionLevelFor(pagePath, sealed, route),
    status: 'CANDIDATE',
    primary_query: spec.h1 || pagePath,
    query_aliases: [],
    intent: spec.type || 'concept',
    cluster: 'agent-exact-implementation',
    framework: spec.framework || spec.h1 || pagePath,
    unique_atom: spec.definition || spec.h1 || pagePath,
    artifact_type: 'agent_exact_citation_page',
    entity: null,
    use_case: null,
    comparison_entities: null,
    comparison_methodology: null,
    official_sources: null,
    conflict_disclosure: null,
    verified_at: null,
    health_adjacent: false,
    commercial_comparison: false,
    admitted_at: null,
    source: QUARANTINE_LANE,
    candidate_hash: sha256(html),
  };
}

/**
 * Run the admission validator in candidate mode. `validatorRoot` is the tree the
 * validator script lives in (its ROOT is derived from its own location);
 * `runtimeRoot` is where the managed Python runtime lives. They differ only
 * under the self-test, which points the validator at a scratch repository.
 */
function runCandidateValidator({runtimeRoot, validatorRoot, resultPath}) {
  const script = path.join(validatorRoot, 'scripts/validation/validate_programmatic_admission.py');
  const r = spawnSync(process.execPath, [
    path.join(runtimeRoot, 'scripts/validation/python_runtime.mjs'), 'run', script,
    '--candidate-only', '--json-output', resultPath, '--no-fail-quality',
  ], {cwd: runtimeRoot, stdio: 'inherit', env: {...process.env, PYTHONDONTWRITEBYTECODE: '1'}});
  return r.status ?? 2;
}

export function admitCreatedPages({root = process.cwd(), runtimeRoot = root, rebuildPlan = true, runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`} = {}) {
  // Real paths, not symlinked ones: python_runtime.mjs only runs main() when
  // process.argv[1] equals its own resolved location, so invoking it through a
  // symlinked directory (macOS /tmp) exits 0 having done nothing - which this
  // gate would then report as "wrote no result". Resolve once, up front.
  root = fs.realpathSync(root);
  runtimeRoot = fs.realpathSync(runtimeRoot);
  const plan = readJson(path.join(root, PLAN_PATH), null);
  if (!plan || !Array.isArray(plan.specs)) {
    throw new Error(`${PLAN_PATH} is missing or has no specs; run agent:bhpc:plan-exact first. A gate with no plan to read cannot tell "nothing was created" from "nothing was looked at".`);
  }
  const specsDoc = readJson(path.join(root, SPECS_PATH), {new_pages: {}});
  const registry = readJson(path.join(root, REGISTRY_PATH), null);
  if (!registry || !Array.isArray(registry.records)) throw new Error(`${REGISTRY_PATH} is missing or has no records`);
  const admitted = new Map(registry.records.filter((r) => r.status === 'ADMITTED').map((r) => [r.path, r]));
  const sealed = sealedRoutes(root);

  const candidates = [];
  const seen = new Set();
  for (const spec of plan.specs) {
    if (spec.status === 'BLOCKED' || spec.operation !== 'CREATE_NEW_TARGET_PAGE' || !spec.implementation_path) continue;
    const rel = spec.implementation_path;
    if (seen.has(rel) || admitted.has(rel) || !fs.existsSync(path.join(root, rel))) continue;
    seen.add(rel);
    const pageSpec = (specsDoc.new_pages || {})[rel] || {};
    const record = candidateRecord(root, rel, pageSpec, sealed);
    candidates.push({record, spec, pageSpec, acceptanceIds: [...new Set([...(spec.acceptance_ids || []), ...(pageSpec.agent_acceptance?.acceptance_ids || [])].map(String))]});
  }

  const artifact = {
    schema_version: '1.0', validator: 'bhpc-agent-admit-created', generated_at: new Date().toISOString(), run_id: runId,
    status: 'PASS', candidate_count: candidates.length, admitted_count: 0, quarantined_count: 0,
    candidates: candidates.map((c) => c.record.path), admitted: [], quarantined: [], stop_reason: null, outcome: null,
  };

  if (!candidates.length) {
    artifact.stop_reason = {code: 'NO_UNADMITTED_CREATED_PAGE', message: 'agent:bhpc:plan-exact planned no CREATE_NEW_TARGET_PAGE spec whose page is on disk and not yet ADMITTED in data/content/page_admission_registry.json; there was nothing for the created-page gate to judge this run.'};
    writeJson(path.join(root, ARTIFACT_PATH), artifact);
    console.log(`${TAG} NAMED STOP ${artifact.stop_reason.code}: ${artifact.stop_reason.message}`);
    return artifact;
  }

  // Candidate manifest -> the repo's own admission validator, candidate mode.
  const manifestAbs = path.join(root, CANDIDATE_MANIFEST_PATH);
  const priorManifest = readJson(manifestAbs, null);
  writeJson(manifestAbs, {schema_version: '1.0', generated_at: new Date().toISOString(), lane: QUARANTINE_LANE, run_id: runId, candidates: candidates.map((c) => c.record)});
  const resultPath = path.join(root, 'artifacts', 'validation', `agent-created-page-admission-${runId}.result.json`);
  let result;
  try {
    const code = runCandidateValidator({runtimeRoot, validatorRoot: root, resultPath});
    if (code !== 0 || !fs.existsSync(resultPath)) {
      throw new Error(`validate_programmatic_admission.py --candidate-only exited ${code}${fs.existsSync(resultPath) ? '' : ' and wrote no result'}; the gate cannot judge ${candidates.length} created page(s) and will not admit them unjudged`);
    }
    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } finally {
    fs.rmSync(resultPath, {force: true});
    // Leave the manifest as run_lane.mjs leaves it: empty, so a corpus run that
    // follows cannot mistake stale candidates for live ones.
    writeJson(manifestAbs, {schema_version: '1.0', generated_at: new Date().toISOString(), lane: null, run_id: runId, candidates: []});
    if (priorManifest && Array.isArray(priorManifest.candidates) && priorManifest.candidates.length) {
      console.log(`${TAG} note: ${CANDIDATE_MANIFEST_PATH} held ${priorManifest.candidates.length} stale candidate(s) from ${priorManifest.lane || 'an unknown lane'}; reset to empty`);
    }
  }
  const verdicts = new Map((result.results || []).map((item) => [item.path, item]));
  if (candidates.some((c) => !verdicts.has(c.record.path))) {
    const missing = candidates.filter((c) => !verdicts.has(c.record.path)).map((c) => c.record.path);
    throw new Error(`the validator returned no verdict for ${missing.length} candidate(s): ${missing.join(', ')}; an unjudged page is not admitted`);
  }

  const quarantine = readQuarantine(root);
  const rejections = [];
  for (const candidate of candidates) {
    const verdict = verdicts.get(candidate.record.path);
    const rel = candidate.record.path;
    if (verdict.accepted) {
      const row = {...candidate.record, status: 'ADMITTED', admitted_at: today()};
      delete row.candidate_hash;
      const idx = registry.records.findIndex((r) => r.path === rel);
      if (idx >= 0) registry.records[idx] = row; else registry.records.push(row);
      artifact.admitted.push(rel);
      continue;
    }
    const reasons = (Array.isArray(verdict.errors) ? verdict.errors : [String(verdict.errors || 'rejected')]).map((x) => String(x));
    const fingerprint = specFingerprint({path: rel, acceptanceIds: candidate.acceptanceIds, h1: candidate.pageSpec.h1, framework: candidate.pageSpec.framework, type: candidate.pageSpec.type, definition: candidate.pageSpec.definition});
    fs.rmSync(path.join(root, rel), {force: true});
    quarantine.rows = quarantine.rows.filter((row) => !(row.path === rel && row.spec_fingerprint === fingerprint));
    quarantine.rows.push({path: rel, spec_fingerprint: fingerprint, record_id: candidate.spec.record_id || null, acceptance_ids: candidate.acceptanceIds, candidate_hash: candidate.record.candidate_hash, reasons: reasons.slice(0, 10), reason_count: reasons.length, quarantined_at: new Date().toISOString(), run_id: runId});
    rejections.push({run_id: runId, lane: QUARANTINE_LANE, path: rel, primary_query: candidate.record.primary_query, candidate_hash: candidate.record.candidate_hash, reason_count: reasons.length, reason_sample: reasons.slice(0, 5).map((r) => r.slice(0, 300)), reason_hash: sha256(JSON.stringify(reasons)), rejected_at: new Date().toISOString()});
    artifact.quarantined.push({path: rel, spec_fingerprint: fingerprint, reasons: reasons.slice(0, 5)});
  }

  if (artifact.admitted.length) {
    registry.records.sort((a, b) => String(a.path).localeCompare(String(b.path)));
    registry.record_count = registry.records.length;
    registry.generated_at = today();
    writeJson(path.join(root, REGISTRY_PATH), registry);
  }
  if (rejections.length) {
    writeQuarantine(quarantine, root);
    writeRejectionBacklog(rejections, root);
    if (rebuildPlan) {
      // The plan is the one list every writer runs off. Rebuilt now, the rejected
      // spec reads BLOCKED with this gate's reason for every stage that follows.
      const r = spawnSync(process.execPath, [path.join(root, 'scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs')], {cwd: root, stdio: 'inherit'});
      if (r.status !== 0) throw new Error(`plan rebuild after quarantine exited ${r.status}`);
    }
  }
  artifact.admitted_count = artifact.admitted.length;
  artifact.quarantined_count = artifact.quarantined.length;
  if (!artifact.admitted.length) {
    artifact.stop_reason = {code: 'EVERY_CREATED_PAGE_REJECTED', message: `all ${candidates.length} page(s) the exact-agent lane created this run were rejected by validate:programmatic-admission and quarantined; none was registered or left on disk. See ${ARTIFACT_PATH} and data/content/agent_page_quarantine.json for the reasons.`};
  } else {
    artifact.outcome = {code: 'CREATED_PAGES_ADMITTED', message: `${artifact.admitted.length} created page(s) passed the admission validator and were registered ADMITTED; ${artifact.quarantined.length} quarantined.`};
  }
  writeJson(path.join(root, ARTIFACT_PATH), artifact);
  for (const q of artifact.quarantined) console.log(`${TAG} QUARANTINED ${q.path}: ${q.reasons[0] || 'rejected'}`);
  if (artifact.stop_reason) console.log(`${TAG} NAMED STOP ${artifact.stop_reason.code}: ${artifact.stop_reason.message}`);
  else console.log(`${TAG} PASS: candidates=${candidates.length}; admitted=${artifact.admitted.length}; quarantined=${artifact.quarantined.length}`);
  return artifact;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    admitCreatedPages();
  } catch (e) {
    console.error(`${TAG} FAIL: ${e.message}`);
    process.exit(1);
  }
}
