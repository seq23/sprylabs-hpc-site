#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeFinding, summarizeFindings} from './governance_findings.mjs';

const ROOT = process.cwd();
const registryPath = path.join(ROOT, '_validation_registry.json');
const matrixPath = path.join(ROOT, '_repo_validation_matrix.json');
const reviewDecisionsPath = path.join(ROOT, 'data/validation/governance_blocker_review_decisions.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readOptionalJson(file, fallback) {
  return fs.existsSync(file) ? readJson(file) : fallback;
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

function loadReviewDecisions(activeIds) {
  const source = readOptionalJson(reviewDecisionsPath, {decisions: []});
  const decisions = new Map();
  const errors = [];
  for (const row of source.decisions || []) {
    const id = String(row.validation_id || '');
    if (!id) {
      errors.push('review decision is missing validation_id');
      continue;
    }
    if (decisions.has(id)) {
      errors.push(`duplicate review decision for ${id}`);
      continue;
    }
    if (!activeIds.has(id)) {
      errors.push(`review decision references unknown or non-HARD_FAIL validator ${id}`);
      continue;
    }
    if (!String(row.migration_status || '').startsWith('REVIEWED')) {
      errors.push(`review decision ${id} must use a REVIEWED migration_status`);
      continue;
    }
    if (!row.decision || !Array.isArray(row.evidence) || row.evidence.length === 0) {
      errors.push(`review decision ${id} requires decision and evidence`);
      continue;
    }
    decisions.set(id, row);
  }
  return {decisions, errors};
}

export function runGovernanceBlockerAudit({write = true} = {}) {
  const registry = readJson(registryPath).records || [];
  const matrix = readJson(matrixPath).entries || [];
  const activeHardFail = registry.filter(record => record.status === 'ADMITTED' && record.proposed_severity === 'HARD_FAIL');
  const activeIds = new Set(activeHardFail.map(record => record.validation_id));
  const {decisions: reviewedDecisions, errors: decisionErrors} = loadReviewDecisions(activeIds);
  const matrixByValidation = new Map();
  for (const entry of matrix) {
    if (!matrixByValidation.has(entry.validation_id)) matrixByValidation.set(entry.validation_id, []);
    matrixByValidation.get(entry.validation_id).push(entry.matrix_id);
  }

  const rows = activeHardFail.map(record => {
    const reviewed = reviewedDecisions.get(record.validation_id);
    return {
      validation_id: record.validation_id,
      name: record.name,
      command: record.command,
      owning_lane: record.owning_lane,
      risk_prevented: record.risk_prevented,
      current_severity: record.proposed_severity,
      matrix_ids: matrixByValidation.get(record.validation_id) || [],
      suggested_review: suggestedClassification(record),
      migration_status: reviewed?.migration_status || 'UNREVIEWED',
      decision: reviewed?.decision || null,
      evidence: reviewed?.evidence || [],
    };
  });

  const findings = [];
  for (const error of decisionErrors) {
    findings.push(makeFinding({
      kind: 'canonical_corruption',
      message: `governance blocker review decisions: ${error}`,
    }));
  }
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
  const migrationStatusCounts = rows.reduce((counts, row) => {
    counts[row.migration_status] = (counts[row.migration_status] || 0) + 1;
    return counts;
  }, {});
  const unresolvedReviewCounts = rows.filter(row => row.migration_status === 'UNREVIEWED').reduce((counts, row) => {
    counts[row.suggested_review] = (counts[row.suggested_review] || 0) + 1;
    return counts;
  }, {});

  const report = {
    schema_version: '1.2',
    generated_at: new Date().toISOString(),
    purpose: 'Inventory existing release-blocking validators before changing severity or repair behavior.',
    admitted_hard_fail_count: rows.length,
    reviewed_count: rows.filter(row => row.migration_status !== 'UNREVIEWED').length,
    unreviewed_count: rows.filter(row => row.migration_status === 'UNREVIEWED').length,
    suggested_review_counts: reviewCounts,
    unresolved_review_counts: unresolvedReviewCounts,
    migration_status_counts: migrationStatusCounts,
    rows,
    findings,
    finding_summary: summarizeFindings(findings),
    rules: {
      preserve_existing_control_plane: true,
      no_severity_changes_without_fixture_evidence: true,
      no_generic_repair_for_secrets_provenance_or_protected_ownership: true,
      reviewed_decisions_require_source_evidence: true,
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
  const blocking = report.finding_summary.blocking_count;
  console.log(`[governance:blocker-audit] ${blocking ? 'FAIL' : 'PASS'}: admitted_hard_fail=${report.admitted_hard_fail_count}; reviewed=${report.reviewed_count}; unreviewed=${report.unreviewed_count}; findings=${report.findings.length}`);
  if (blocking) process.exit(1);
}
