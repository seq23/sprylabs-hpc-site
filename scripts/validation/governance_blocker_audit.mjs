#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeFinding, summarizeFindings} from './governance_findings.mjs';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, '_validation_registry.json');
const matrixPath = path.join(ROOT, '_repo_validation_matrix.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
}

function suggestedClassification(record) {
  const command = String(record.command || '').toLowerCase();
  const risk = String(record.risk_prevented || '').toLowerCase();
  if (/secret|protected|provenance|canonical|provider mutation|corrupt/.test(`${command} ${risk}`)) return 'TRUE_BLOCKER';
  if (/warning|readiness|budget|target|coverage/.test(`${command} ${risk}`)) return 'REVIEW_WARNING_BOUNDARY';
  if (/repair|self-heal|parity/.test(command)) return 'EXISTING_REPAIR_AVAILABLE';
  return 'REVIEW_REQUIRED';
}

export function runGovernanceBlockerAudit({write = true} = {}) {
  const registry = readJson(registryPath).records || [];
  const matrix = readJson(matrixPath).entries || [];
  const activeHardFail = registry.filter(record => record.status === 'ADMITTED' && record.proposed_severity === 'HARD_FAIL');
  const matrixByValidation = new Map();
  for (const entry of matrix) {
    if (!matrixByValidation.has(entry.validation_id)) matrixByValidation.set(entry.validation_id, []);
    matrixByValidation.get(entry.validation_id).push(entry.matrix_id);
  }

  const rows = activeHardFail.map(record => ({
    validation_id: record.validation_id,
    name: record.name,
    command: record.command,
    owning_lane: record.owning_lane,
    risk_prevented: record.risk_prevented,
    current_severity: record.proposed_severity,
    matrix_ids: matrixByValidation.get(record.validation_id) || [],
    suggested_review: suggestedClassification(record),
    migration_status: 'UNREVIEWED',
    decision: null,
    evidence: [],
  }));

  const findings = [];
  for (const row of rows) {
    if (row.matrix_ids.length === 0) {
      findings.push(makeFinding({
        id: `audit:${row.validation_id}:missing-matrix`,
        kind: 'metadata_gap',
        message: `${row.validation_id} is admitted HARD_FAIL but has no matrix placement`,
        optional: true,
        material: false,
      }));
    }
  }

  const reviewCounts = rows.reduce((counts, row) => {
    counts[row.suggested_review] = (counts[row.suggested_review] || 0) + 1;
    return counts;
  }, {});

  const report = {
    schema_version: '1.1',
    generated_at: new Date().toISOString(),
    purpose: 'Inventory existing release-blocking validators before changing severity or repair behavior.',
    admitted_hard_fail_count: rows.length,
    suggested_review_counts: reviewCounts,
    rows,
    findings,
    finding_summary: summarizeFindings(findings),
    rules: {
      preserve_existing_control_plane: true,
      no_severity_changes_without_fixture_evidence: true,
      no_generic_repair_for_secrets_provenance_or_protected_ownership: true,
    },
  };

  if (write) {
    for (const target of [
      path.join(ROOT, 'reports/validation/governance-blocker-audit.json'),
      path.join(ROOT, 'artifacts/validation/governance-blocker-audit.json'),
    ]) {
      ensureDir(target);
      fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
    }
  }

  return report;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const report = runGovernanceBlockerAudit();
  console.log(`[governance:blocker-audit] PASS: admitted_hard_fail=${report.admitted_hard_fail_count}; findings=${report.findings.length}`);
}
