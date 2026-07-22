#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fail, pass, writeSummary } from '../validation/common.mjs';

const errors = [];
const warnings = [];

const CONTRACT_PATH = 'config/tree/spry_tree_architecture_contract.json';
let contract;
try {
  contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
} catch (error) {
  fail(`[validate:spry-tree-hygiene] FAIL: missing or malformed ${CONTRACT_PATH}`, [error.message]);
}

const ROOT_RECEIPT_PATTERN = /^(PASS|PHASE|AUDIT|CHANGE_MAP|COVERAGE_ROUTE|DEEP_VALIDATION|END_TO_END|EXTRACTION|FINAL_NORMALIZATION|FULL_EXTRACTION|HOSTILE|IMPLEMENTATION|LIVE_AGENT|NEXT_PASS|QUERY_OWNERSHIP|SNAPSHOT_ROOT|THIRD_PASS|VALIDATION_).*\.(md|txt)$/i;
const ROOT_CONTROL_FILE_PATTERN = /(queue|cadence|self[-_]?heal).*\.(json|md|txt)$/i;
const allowedRootDocs = new Set(contract.root_policy?.allowed_root_docs || []);
const allowedRootRuntimeFiles = new Set(contract.root_policy?.allowed_root_runtime_files || []);
const excludedRootDirs = new Set(
  [
    ...(contract.generated_output_policy?.excluded_from_baseline || []),
    ...(contract.root_policy?.ignored_local_root_directories || [])
  ]
    .map((item) => item.replace(/\/$/, ''))
    .filter((item) => item && !item.includes('/'))
);
const prohibitedRootDirs = new Set(contract.root_policy?.prohibited_root_directories || []);

function shaList(items) {
  return crypto.createHash('sha256').update([...items].sort().join('\n') + '\n').digest('hex');
}

function rootEntries(filter) {
  return fs.readdirSync('.', { withFileTypes: true }).filter(filter).map((entry) => entry.name).sort();
}

function walk(rel = '.') {
  const out = [];
  for (const entry of fs.readdirSync(rel, { withFileTypes: true })) {
    if (rel === '.' && excludedRootDirs.has(entry.name)) continue;
    if (entry.name === '.git') continue;
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) out.push(...walk(child));
    else out.push(child.replace(/\\/g, '/').replace(/^\.\//, ''));
  }
  return out;
}

for (const dir of [
  'config',
  'config/tree',
  'content',
  'data',
  'scripts',
  'scripts/programmatic',
  'scripts/render',
  'scripts/validation',
  'scripts/validators',
  'docs',
  'docs/architecture',
  'docs/runbooks',
  'assets',
  'functions',
  'tests'
]) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) errors.push(`missing_architecture_namespace:${dir}`);
}

for (const rel of [
  CONTRACT_PATH,
  'docs/architecture/SPRY_TREE_ARCHITECTURE_2026-07-22.md',
  'data/content/page_admission_registry.json',
  'data/content/programmatic_lane_contracts.json',
  'data/programmatic/programmatic_page_candidates.json',
  'scripts/programmatic/run_lane.mjs',
  'scripts/programmatic/generate_candidates.mjs',
  'scripts/content/build_manual_expansion_pages.mjs',
  'docs/runbooks/PROGRAMMATIC_ADMISSION_RUNBOOK.md'
]) {
  if (!fs.existsSync(rel) || fs.statSync(rel).size === 0) errors.push(`missing_architecture_required_file:${rel}`);
}

const rootHtml = rootEntries((entry) => entry.isFile() && entry.name.endsWith('.html'));
const rootJson = rootEntries((entry) => entry.isFile() && entry.name.endsWith('.json'));
const rootDirs = rootEntries((entry) => entry.isDirectory() && !excludedRootDirs.has(entry.name));
const legacyHtml = contract.root_policy?.legacy_root_html || {};
const legacyJson = contract.root_policy?.legacy_root_json || {};
const legacyDirs = contract.root_policy?.legacy_root_directories || {};

if (rootHtml.length !== legacyHtml.count) errors.push(`legacy_root_html_count_changed:expected=${legacyHtml.count}:actual=${rootHtml.length}`);
if (shaList(rootHtml) !== legacyHtml.sorted_name_sha256) errors.push('legacy_root_html_name_set_changed');
if (rootJson.length !== legacyJson.count) errors.push(`legacy_root_json_count_changed:expected=${legacyJson.count}:actual=${rootJson.length}`);
if (shaList(rootJson) !== legacyJson.sorted_name_sha256) errors.push('legacy_root_json_name_set_changed');
if (rootDirs.length !== legacyDirs.count) warnings.push(`legacy_root_directory_count_changed:expected=${legacyDirs.count}:actual=${rootDirs.length}`);
if (shaList(rootDirs) !== legacyDirs.sorted_name_sha256) warnings.push('legacy_root_directory_name_set_changed');

for (const dir of prohibitedRootDirs) {
  if (excludedRootDirs.has(dir.replace(/\/$/, ''))) continue;
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) errors.push(`prohibited_root_directory_present:${dir}`);
}

for (const entry of fs.readdirSync('.', { withFileTypes: true })) {
  if (excludedRootDirs.has(entry.name)) continue;
  if (!entry.isFile()) continue;
  if (ROOT_RECEIPT_PATTERN.test(entry.name) && !allowedRootDocs.has(entry.name)) errors.push(`legacy_receipt_in_root:${entry.name}`);
  if (ROOT_CONTROL_FILE_PATTERN.test(entry.name) && !entry.name.startsWith('_')) errors.push(`generated_control_file_in_root:${entry.name}`);
  if (entry.name.endsWith('.md') && !allowedRootDocs.has(entry.name)) errors.push(`unapproved_root_doc:${entry.name}`);
  if (!entry.name.endsWith('.html') && !entry.name.endsWith('.json') && !entry.name.endsWith('.md') && !allowedRootRuntimeFiles.has(entry.name) && !entry.name.startsWith('_') && !/\.txt$/.test(entry.name)) {
    warnings.push(`unclassified_root_file:${entry.name}`);
  }
}

for (const rel of walk('.')) {
  if (/^reports\//.test(rel) || /^artifacts\/(validation|diagnostics|release)\//.test(rel) || /^_ops\/audits\//.test(rel) || /^audit\//.test(rel) || /^\.build\//.test(rel)) continue;
  if (/^(data|scripts|docs|assets|content|sitemaps|distribution_scripts|tests|fixtures|admin|answers|tools)\//.test(rel)) continue;
  if (/\.html$/.test(rel)) continue;
  if (/^(_|package|README|REPO_IDENTITY|ARTIFACT_MANIFEST|LICENSES|robots|sitemap|feed|llms|indexnow|favicon|distribution|playwright|requirements|apply_|fix_|install_|setup_|overhaul)/.test(rel)) continue;
  if (/\.(json|md|txt|csv|log)$/i.test(rel) && /receipt|report|summary|ledger|verification|warnings|changed_files|query_coverage/i.test(rel)) {
    warnings.push(`unclassified_operational_artifact:${rel}`);
  }
}

const report = {
  status: errors.length ? 'FAIL' : warnings.length ? 'PASS_WITH_WARNING' : 'PASS',
  contract: CONTRACT_PATH,
  legacy_root_html_count: rootHtml.length,
  legacy_root_json_count: rootJson.length,
  legacy_root_directory_count: rootDirs.length,
  errors,
  warnings
};

writeSummary('validate-spry-tree-hygiene', report);

if (errors.length) fail(`[validate:spry-tree-hygiene] FAIL: ${errors.length} tree hygiene issue(s)`, errors);
if (warnings.length) {
  console.log(`[validate:spry-tree-hygiene] PASS_WITH_WARNING: ${warnings.length} unclassified artifact(s)`);
  for (const warning of warnings.slice(0, 100)) console.log(` - ${warning}`);
  process.exit(0);
}
pass('[validate:spry-tree-hygiene] PASS: tree architecture contract is enforced and root legacy surface is frozen');
