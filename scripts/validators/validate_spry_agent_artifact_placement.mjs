#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { readJson, exists, fail, pass, writeSummary } from '../validation/common.mjs';
import { profilePurityFindings } from '../validation/profile_purity_lib.mjs';

const errors = [];
const warnings = [];
const runSummaries = [];

const agentRoot = 'data/report_fixes/agent_runs';
const normalizedRoot = 'data/report_fixes/normalized_agent_runs';
const allowedStatuses = new Set(['READY_FOR_ABSORPTION', 'ABSORBED', 'QUARANTINED']);
const requiredCommands = [
  'agent:bhpc:validate',
  'agent:bhpc:absorb',
  'agent:bhpc:trace',
  'agent:bhpc:compile-acceptance',
  'agent:bhpc:plan-exact',
  'agent:bhpc:apply-exact',
  'release:agent-intake:raw',
  'release:agent-intake',
  'build:agent-accepted-content',
  'validate:bhpc-agent-source-coverage',
  'validate:bhpc-agent-recommendation-driven-output'
];

const pkg = readJson('package.json');
for (const command of requiredCommands) {
  if (!pkg.scripts?.[command]) errors.push(`missing_agent_lane_command:${command}`);
}

const priorityContract = readJson('_bhpc_agent_artifact_priority_contract.json');
const citationContract = readJson('_citation_intelligence_contract.json');
const contentContract = readJson('_content_release_contract.json');

for (const rel of [
  'data/report_fixes/agent_runs/**',
  'data/report_fixes/normalized_agent_runs/**',
  'data/report_fixes/agent_exact_implementation_plan.json',
  'scripts/agent_intake/**'
]) {
  if (!priorityContract.forbidden_zero_dollar_mutations?.includes(rel)) errors.push(`priority_contract_missing_zero_dollar_protection:${rel}`);
  if (!citationContract.protected_paid_agent_paths?.includes(rel)) errors.push(`citation_contract_missing_paid_agent_protection:${rel}`);
}

if (!contentContract.forbidden_runtime_mutations?.includes('scripts/**')) errors.push('content_release_contract_must_forbid_runtime_script_mutation');

if (!exists(agentRoot)) errors.push(`missing_agent_root:${agentRoot}`);
else {
  for (const runDate of fs.readdirSync(agentRoot).sort()) {
    const runDir = path.join(agentRoot, runDate);
    if (!fs.statSync(runDir).isDirectory()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) errors.push(`agent_run_date_folder_invalid:${runDate}`);
    for (const scope of fs.readdirSync(runDir).sort()) {
      const scopeDir = path.join(runDir, scope);
      if (!fs.statSync(scopeDir).isDirectory()) continue;
      const manifestRel = path.posix.join(agentRoot, runDate, scope, 'agent_run_manifest.json');
      if (!exists(manifestRel)) {
        errors.push(`missing_agent_manifest:${manifestRel}`);
        continue;
      }
      const manifest = readJson(manifestRel);
      if (!allowedStatuses.has(manifest.status)) errors.push(`agent_manifest_bad_status:${manifestRel}:${manifest.status}`);
      if (manifest.run_date !== runDate) errors.push(`agent_manifest_run_date_mismatch:${manifestRel}`);
      if (!['bhpc', 'aplayer', 'a-player', 'a-player-mode'].includes(String(manifest.scope || scope))) {
        errors.push(`agent_manifest_scope_not_allowed:${manifestRel}:${manifest.scope || scope}`);
      }
      const artifacts = [];
      for (const key of ['csv_path', 'html_path', 'json_path']) {
        const rel = manifest[key];
        if (!rel) {
          if (runDate >= '2026-07-04' || manifest.status === 'READY_FOR_ABSORPTION') warnings.push(`agent_manifest_missing_optional_${key}:${manifestRel}`);
          continue;
        }
        if (rel.includes('..') || path.isAbsolute(rel)) errors.push(`agent_artifact_unsafe_path:${manifestRel}:${key}:${rel}`);
        if (!rel.startsWith(`${agentRoot}/${runDate}/${scope}/`)) errors.push(`agent_artifact_outside_run_folder:${manifestRel}:${key}:${rel}`);
        if (!exists(rel)) errors.push(`agent_artifact_missing:${manifestRel}:${key}:${rel}`);
        artifacts.push(rel);
      }
      if (!artifacts.length) errors.push(`agent_manifest_has_no_absorbable_artifacts:${manifestRel}`);
      if (manifest.status === 'ABSORBED') {
        const normalized = manifest.normalized_path || `${normalizedRoot}/${runDate}_${String(manifest.scope || scope).replace(/-/g, '_')}.json`;
        if (!exists(normalized)) errors.push(`absorbed_agent_run_missing_normalized_output:${manifestRel}:${normalized}`);
      }
      runSummaries.push({ run_date: runDate, scope, status: manifest.status, artifact_count: artifacts.length, manifest: manifestRel });
    }
  }
}

const matrix = readJson('_repo_validation_matrix.json');
const profileFindings = profilePurityFindings(matrix, pkg.scripts || {});
for (const finding of profileFindings) errors.push(`validation_profile_mutates:${finding.profile}:${finding.id}`);

const report = {
  status: errors.length ? 'FAIL' : warnings.length ? 'PASS_WITH_WARNING' : 'PASS',
  run_count: runSummaries.length,
  runs: runSummaries,
  warnings,
  errors
};

writeSummary('validate-spry-agent-artifact-placement', report);
fs.mkdirSync('artifacts/validation', { recursive: true });
fs.writeFileSync('artifacts/validation/spry-agent-artifact-placement.json', JSON.stringify(report, null, 2) + '\n');

if (errors.length) fail(`[validate:spry-agent-artifact-placement] FAIL: ${errors.length} agent artifact placement issue(s)`, errors);
if (warnings.length) {
  console.log(`[validate:spry-agent-artifact-placement] PASS_WITH_WARNING: ${warnings.length} non-blocking legacy artifact warning(s)`);
  for (const warning of warnings) console.log(` - ${warning}`);
  process.exit(0);
}
pass(`[validate:spry-agent-artifact-placement] PASS: ${runSummaries.length} external agent run(s) remain placeable/processable`);
