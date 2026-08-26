#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {workflowContract, matches, readJson, writeJson} from './lib.mjs';
import {resolveRuntimePath} from '../lib/runtime_path.mjs';
import {
  FINDING_CLASSES,
  findingStatus,
  makeFinding,
  runGovernanceFindingSelfTest,
  summarizeFindings,
} from '../validation/governance_findings.mjs';
import {runGovernanceBlockerAudit} from '../validation/governance_blocker_audit.mjs';

const argv = process.argv.slice(2);
function value(flag) { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : null; }
const workflowId = value('--workflow');
const tracePath = value('--trace');
const selfTest = argv.includes('--self-test');

const AGGREGATABLE_KINDS = new Set(['undeclared_generated_output']);
const AGGREGATE_SAMPLE_LIMIT = 8;


function isForbiddenChange(file, contract) {
  const explicitlyAllowed = matches(file, contract.allowed_change_patterns || []);
  return matches(file, contract.forbidden_change_patterns || []) && !explicitlyAllowed;
}

function aggregateFindings(findings = []) {
  const passthrough = [];
  const groups = new Map();

  for (const finding of findings) {
    const eligible = AGGREGATABLE_KINDS.has(finding.kind)
      && ![FINDING_CLASSES.TRUE_BLOCKER, FINDING_CLASSES.INTERNAL_ERROR].includes(finding.classification);
    if (!eligible) {
      passthrough.push(finding);
      continue;
    }

    const key = `${finding.classification}:${finding.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }

  const aggregated = [...passthrough];
  for (const group of groups.values()) {
    const first = group[0];
    const sampleFiles = group.map(item => item.file).filter(Boolean).slice(0, AGGREGATE_SAMPLE_LIMIT);
    aggregated.push({
      ...first,
      id: `aggregate:${first.kind}`,
      file: null,
      message: `${group.length} generated output(s) were outside declared workflow patterns`,
      occurrence_count: group.length,
      sample_files: sampleFiles,
      evidence: [
        ...(first.evidence || []),
        {occurrence_count: group.length, sample_files: sampleFiles},
      ],
    });
  }

  return aggregated;
}

function runAggregationSelfTest() {
  const raw = [
    makeFinding({kind: 'undeclared_generated_output', file: 'public/a.html', material: false, optional: true, message: 'a'}),
    makeFinding({kind: 'undeclared_generated_output', file: 'public/b.html', material: false, optional: true, message: 'b'}),
    makeFinding({kind: 'secret_exposure', file: 'config/private.key', message: 'blocker'}),
  ];
  const aggregated = aggregateFindings(raw);
  const warning = aggregated.find(item => item.kind === 'undeclared_generated_output');
  const blocker = aggregated.find(item => item.classification === FINDING_CLASSES.TRUE_BLOCKER);
  const failures = [];
  if (aggregated.length !== 2) failures.push(`expected 2 findings after aggregation, got ${aggregated.length}`);
  if (warning?.occurrence_count !== 2) failures.push(`expected warning occurrence_count=2, got ${warning?.occurrence_count ?? 'missing'}`);
  if (!blocker) failures.push('true blocker was hidden by aggregation');
  return {fixtures: 3, failures};
}



function runChangePatternPrecedenceSelfTest() {
  const contract = {
    allowed_change_patterns: ['config/validation/browser_suite_contract.json', 'docs/operations/daily-insights/**'],
    forbidden_change_patterns: ['config/**', 'docs/**', 'scripts/**'],
  };
  const fixtures = [
    {file: 'config/validation/browser_suite_contract.json', forbidden: false},
    {file: 'docs/operations/daily-insights/touched-files-2026-08-09.txt', forbidden: false},
    {file: 'config/private/runtime.json', forbidden: true},
    {file: 'scripts/release/private.mjs', forbidden: true},
  ];
  const failures = fixtures
    .filter(fixture => isForbiddenChange(fixture.file, contract) !== fixture.forbidden)
    .map(fixture => `${fixture.file}: expected forbidden=${fixture.forbidden}`);
  return {fixtures: fixtures.length, failures};
}

function requireGovernanceFixtures() {
  const classifier = runGovernanceFindingSelfTest();
  const aggregation = runAggregationSelfTest();
  const changePatternPrecedence = runChangePatternPrecedenceSelfTest();
  const failures = [
    ...classifier.failures.map(failure => `${failure.name}: expected=${failure.expected}`),
    ...aggregation.failures,
    ...changePatternPrecedence.failures,
  ];
  const fixtureCount = classifier.fixtures + aggregation.fixtures + changePatternPrecedence.fixtures;
  if (failures.length) {
    const error = new Error(`governance fixtures failed ${failures.length}/${fixtureCount}`);
    error.details = failures;
    throw error;
  }
  return {fixtures: fixtureCount};
}

function reviewOne(id, traceFile) {
  const contract = workflowContract(id);
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  const rawFindings = [];
  const info = [];
  const changed = trace.lineage?.changed_files || [];

  const add = input => rawFindings.push(makeFinding(input));

  if (trace.workflow_id !== id) add({kind: 'canonical_corruption', message: 'trace workflow id does not match requested workflow'});
  if (trace.command_exit_code !== 0) add({kind: 'workflow_failed', message: `workflow command exit code was ${trace.command_exit_code}`});
  if (trace.validation?.status !== 'PASSED') add({kind: 'validation_failed', message: 'canonical workflow validation did not pass'});
  if (!Array.isArray(trace.lineage?.inputs_before) || trace.lineage.inputs_before.length === 0) add({kind: 'provenance_loss', message: 'input lineage is empty'});
  if (!Array.isArray(trace.lineage?.outputs_after) || trace.lineage.outputs_after.length === 0) add({kind: 'provenance_loss', message: 'output lineage is empty'});

  const requiredOutputs = [
    ...(contract.required_outputs || []),
    ...(contract.required_outputs_by_mode?.[trace.mode] || []),
  ];
  for (const required of requiredOutputs) {
    if (!fs.existsSync(resolveRuntimePath(required))) add({kind: 'required_output_missing', file: required, message: `required output missing for mode ${trace.mode || '(unknown)'}: ${required}`});
  }

  for (const item of changed) {
    if (isForbiddenChange(item.file, contract)) {
      add({kind: 'protected_lane_mutation', file: item.file, message: `workflow changed forbidden source/governance file: ${item.file}`});
    }
    if (!matches(item.file, contract.allowed_change_patterns || []) && !matches(item.file, contract.lineage_outputs || [])) {
      add({kind: 'undeclared_generated_output', file: item.file, material: false, optional: true, message: `observed generated output outside declared patterns: ${item.file}`});
    }
    if (/\.env(?:\.|$)|playwright-storage-state|\.pem$|\.key$/i.test(item.file)) {
      add({kind: 'secret_exposure', file: item.file, message: `possible secret-bearing output changed: ${item.file}`});
    }
  }

  const candidateManifest = readJson('data/content/programmatic_candidate_manifest.json', {candidates: []});
  const candidateRows = candidateManifest.candidates || [];
  const pendingCandidates = candidateRows.filter(candidate => String(candidate.status || '').toUpperCase() !== 'ADMITTED');
  if (pendingCandidates.length) {
    add({kind: 'canonical_corruption', message: `programmatic candidate manifest contains ${pendingCandidates.length} non-admitted candidate(s)`});
  } else if (candidateRows.length) {
    info.push(`programmatic candidate manifest retains ${candidateRows.length} admitted release atom(s) for downstream validation`);
  }

  const registry = readJson('data/content/page_admission_registry.json');
  if ((registry.records || []).some(record => record.status !== 'ADMITTED')) {
    add({kind: 'canonical_corruption', message: 'page admission registry contains a non-admitted public record'});
  }
  const manual = readJson('data/content/manual_expansion_pages.json').pages || [];
  for (const page of manual) {
    const record = (registry.records || []).find(item => item.path === page.path);
    if (!record || record.generation_lane !== 'manual' || record.admission_level !== 'full') {
      add({kind: 'provenance_loss', file: page.path, message: `manual admission provenance drifted: ${page.path}`});
    }
  }

  const findings = aggregateFindings(rawFindings);
  const findingSummary = summarizeFindings(findings);
  const errors = findings.filter(finding => [FINDING_CLASSES.TRUE_BLOCKER, FINDING_CLASSES.INTERNAL_ERROR].includes(finding.classification)).map(finding => finding.message);
  const warnings = findings.filter(finding => [FINDING_CLASSES.WARNING, FINDING_CLASSES.SELF_HEALABLE, FINDING_CLASSES.ITEM_SKIP].includes(finding.classification)).map(finding => finding.message);
  const safeNoise = findings.filter(finding => finding.classification === FINDING_CLASSES.SAFE_NOISE).map(finding => finding.message);

  const result = {
    schema_version: '1.4',
    workflow_id: id,
    run_id: trace.run_id,
    generated_at: new Date().toISOString(),
    status: findingStatus(findings),
    changed_file_count: changed.length,
    raw_finding_count: rawFindings.length,
    aggregated_finding_count: findings.length,
    input_count: trace.lineage?.inputs_before?.length || 0,
    output_count: trace.lineage?.outputs_after?.length || 0,
    finding_summary: findingSummary,
    findings,
    errors,
    warnings,
    safe_noise: safeNoise,
    info,
  };
  const reportPath = path.posix.join(path.posix.dirname(traceFile), 'hostile-review.json');
  writeJson(reportPath, result);
  return result;
}

function latestTraceFor(id) {
  const latest = path.join('reports', 'workflows', id, 'latest.json');
  if (!fs.existsSync(latest)) return null;
  const summary = JSON.parse(fs.readFileSync(latest, 'utf8'));
  if (summary.workflow_id && summary.workflow_id !== id) return null;
  const runId = summary.run_id;
  if (!runId) return null;
  const trace = path.join('reports', 'workflows', id, runId, 'trace.json');
  return fs.existsSync(trace) ? trace : null;
}

if (selfTest) {
  try {
    const result = requireGovernanceFixtures();
    console.log(`[workflow:hostile-review:self-test] PASS fixtures=${result.fixtures}`);
    process.exit(0);
  } catch (error) {
    console.error(`[workflow:hostile-review:self-test] FAIL ${error.message}`);
    for (const detail of error.details || []) console.error(` - ${detail}`);
    process.exit(1);
  }
}

let fixtureResult;
let blockerAudit;
try {
  fixtureResult = requireGovernanceFixtures();
  blockerAudit = runGovernanceBlockerAudit();
} catch (error) {
  console.error(`[workflow:hostile-review] INTERNAL_ERROR ${error.message}`);
  for (const detail of error.details || []) console.error(` - ${detail}`);
  process.exit(2);
}

if (workflowId || tracePath) {
  if (!workflowId || !tracePath || !fs.existsSync(tracePath)) {
    console.error('Usage: node scripts/workflow/hostile_review.mjs --workflow <id> --trace <trace.json>');
    process.exit(2);
  }
  const result = reviewOne(workflowId, tracePath);
  result.governance_fixture_count = fixtureResult.fixtures;
  result.governance_blocker_audit = {
    admitted_hard_fail_count: blockerAudit.admitted_hard_fail_count,
    suggested_review_counts: blockerAudit.suggested_review_counts,
  };
  const reportPath = path.posix.join(path.posix.dirname(tracePath), 'hostile-review.json');
  writeJson(reportPath, result);
  if (result.errors.length) {
    console.error(`[workflow:hostile-review] FAIL ${workflowId}`);
    for (const error of result.errors) console.error(` - ${error}`);
    process.exit(1);
  }
  console.log(`[workflow:hostile-review] ${result.status} ${workflowId}; changed=${result.changed_file_count}; raw_findings=${result.raw_finding_count}; findings=${result.aggregated_finding_count}; warnings=${result.warnings.length}; safe_noise=${result.safe_noise.length}; fixtures=${fixtureResult.fixtures}`);
  process.exit(0);
}

const contracts = readJson('data/workflows/workflow_contracts.json', {governed_workflows: []});
const results = [];
const errors = [];
for (const wf of contracts.governed_workflows || []) {
  const id = wf.id;
  const trace = latestTraceFor(id);
  if (!trace) {
    results.push({workflow_id: id, status: 'SKIP', errors: [], warnings: [], safe_noise: [], info: ['latest trace missing; no historical run available to hostile-review']});
    continue;
  }
  try {
    const result = reviewOne(id, trace);
    results.push(result);
    if (result.errors.length) errors.push(`${id}: ${result.errors.join('; ')}`);
  } catch (error) {
    const message = error?.message || String(error);
    errors.push(`${id}: ${message}`);
    results.push({workflow_id: id, status: 'INTERNAL_ERROR', errors: [message], warnings: [], safe_noise: [], info: []});
  }
}
const aggregate = {
  schema_version: '1.3',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : results.some(result => result.status === 'PASS_WITH_WARNING') ? 'PASS_WITH_WARNING' : 'PASS',
  workflow_count: results.length,
  reviewed_count: results.filter(result => ['PASS', 'PASS_WITH_WARNING', 'FAIL', 'INTERNAL_ERROR'].includes(result.status)).length,
  skipped_count: results.filter(result => result.status === 'SKIP').length,
  pass_count: results.filter(result => ['PASS', 'PASS_WITH_WARNING'].includes(result.status)).length,
  fail_count: results.filter(result => ['FAIL', 'INTERNAL_ERROR'].includes(result.status)).length,
  warning_count: results.reduce((sum, result) => sum + (result.warnings?.length || 0), 0),
  safe_noise_count: results.reduce((sum, result) => sum + (result.safe_noise?.length || 0), 0),
  raw_finding_count: results.reduce((sum, result) => sum + (result.raw_finding_count || 0), 0),
  aggregated_finding_count: results.reduce((sum, result) => sum + (result.aggregated_finding_count || 0), 0),
  info_count: results.reduce((sum, result) => sum + (result.info?.length || 0), 0),
  governance_fixture_count: fixtureResult.fixtures,
  governance_blocker_audit: {
    admitted_hard_fail_count: blockerAudit.admitted_hard_fail_count,
    suggested_review_counts: blockerAudit.suggested_review_counts,
  },
  errors,
  results,
};
writeJson('artifacts/validation/workflow-hostile-review-all.json', aggregate);
writeJson('reports/workflow-hostile-review-all.json', aggregate);
if (errors.length) {
  console.error(`[workflow:hostile-review] FAIL ${aggregate.fail_count}/${aggregate.workflow_count}`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[workflow:hostile-review] ${aggregate.status} all governed workflows=${aggregate.workflow_count}; warnings=${aggregate.warning_count}; raw_findings=${aggregate.raw_finding_count}; findings=${aggregate.aggregated_finding_count}; safe_noise=${aggregate.safe_noise_count}; fixtures=${fixtureResult.fixtures}; hard_fail_audit=${blockerAudit.admitted_hard_fail_count}`);
