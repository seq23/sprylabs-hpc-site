#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {normalizeBhpcSeoExecution} from '../lib/bhpc_seo_execution_contract.mjs';

const root = process.cwd();
const fixturePath = path.join(root, 'data/report_fixes/fixtures/bhpc_seo_execution_contract_cases.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const failures = [];
for (const test of fixture.cases || []) {
  const result = normalizeBhpcSeoExecution(test.input);
  if (result.status !== test.expected_status) failures.push(`${test.name}:status=${result.status}`);
  if (test.expected_canonical_page_type && result.seo_execution?.canonical_page_type !== test.expected_canonical_page_type) failures.push(`${test.name}:canonical_page_type=${result.seo_execution?.canonical_page_type}`);
  if (test.expected_schema_action && result.seo_execution?.schema_action !== test.expected_schema_action) failures.push(`${test.name}:schema_action=${result.seo_execution?.schema_action}`);
}
const report = {schema_version: '1.0', status: failures.length ? 'FAIL' : 'PASS', case_count: (fixture.cases || []).length, failures};
fs.mkdirSync(path.join(root, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(root, 'artifacts/validation/bhpc-seo-execution-self-test.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[self-test:bhpc-seo-execution] ${report.status}: cases=${report.case_count}; failures=${failures.length}`);
process.exit(report.status === 'PASS' ? 0 : 1);
