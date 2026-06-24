#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, AGENT_ROOT, VALID_STATUSES, findAgentManifests, writeJson, parseCsv} from './bhpc_agent_common.mjs';

const errors = [];
const warnings = [];
const runs = [];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const allowedFields = new Set(['source','run_date','scope','bucket','csv_path','html_path','status','created_at','absorbed_at','absorbed_record_count','normalized_path','social_run_path','notes']);

for (const entry of findAgentManifests()) {
  const manifest = entry.manifest || {};
  const context = entry.manifestRel;
  if (!dateRe.test(entry.runDate)) errors.push(`${context}: parent folder must be YYYY-MM-DD`);
  if (manifest.run_date !== entry.runDate) errors.push(`${context}: run_date must match folder ${entry.runDate}`);
  const scope = manifest.scope || manifest.bucket;
  if (scope !== 'bhpc') errors.push(`${context}: scope/bucket must be "bhpc"`);
  if (!manifest.source || !/^twin_agent|ai_agent|citation_velocity_monitor$/i.test(String(manifest.source))) warnings.push(`${context}: source should identify Twin/Citation Velocity Monitor`);
  if (!VALID_STATUSES.has(manifest.status)) errors.push(`${context}: status must be one of ${Array.from(VALID_STATUSES).join(', ')}`);
  for (const key of Object.keys(manifest)) if (!allowedFields.has(key)) warnings.push(`${context}: unexpected manifest field ${key}`);
  if ('pdf_path' in manifest) errors.push(`${context}: pdf_path is retired; use html_path`);
  const expectedCsv = `${AGENT_ROOT}/${entry.runDate}/bhpc/bhpc.csv`;
  const expectedHtml = `${AGENT_ROOT}/${entry.runDate}/bhpc/bhpc.html`;
  if (manifest.csv_path !== expectedCsv) errors.push(`${context}: csv_path must be ${expectedCsv}`);
  if (manifest.html_path !== expectedHtml) errors.push(`${context}: html_path must be ${expectedHtml}`);
  for (const rel of [manifest.csv_path, manifest.html_path]) {
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) errors.push(`${context}: unsafe artifact path ${rel}`);
    else if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`${context}: missing artifact ${rel}`);
  }
  const pdfs = fs.existsSync(path.join(ROOT, entry.dirRel)) ? fs.readdirSync(path.join(ROOT, entry.dirRel)).filter(file => file.toLowerCase().endsWith('.pdf')) : [];
  if (pdfs.length) errors.push(`${context}: PDF artifacts are not accepted: ${pdfs.join(', ')}`);
  let rowCount = 0;
  if (manifest.csv_path && fs.existsSync(path.join(ROOT, manifest.csv_path))) {
    const csvText = fs.readFileSync(path.join(ROOT, manifest.csv_path), 'utf8');
    const rows = parseCsv(csvText);
    rowCount = rows.length;
    if (!csvText.trim()) errors.push(`${context}: CSV is empty`);
    if (!rows.length) warnings.push(`${context}: CSV has no data rows; HTML digest will be used as fallback signal`);
  }
  let htmlBytes = 0;
  if (manifest.html_path && fs.existsSync(path.join(ROOT, manifest.html_path))) {
    const html = fs.readFileSync(path.join(ROOT, manifest.html_path), 'utf8');
    htmlBytes = Buffer.byteLength(html);
    if (htmlBytes < 100) errors.push(`${context}: HTML digest is too small to be useful`);
    if (/<script\b/i.test(html)) errors.push(`${context}: HTML digest must not include script tags`);
    if (!/<html\b|<body\b|<article\b|<main\b|<section\b/i.test(html)) warnings.push(`${context}: HTML digest has no structural HTML wrapper`);
  }
  runs.push({run_date: entry.runDate, scope: 'bhpc', status: manifest.status, csv_rows: rowCount, html_bytes: htmlBytes, manifest: entry.manifestRel});
}

const report = {schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', run_count:runs.length, runs, errors, warnings};
writeJson('artifacts/validation/bhpc-agent-run-intake.json', report);
writeJson('reports/bhpc-agent-run-intake.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-intake] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-intake] PASS: ${runs.length} run folder(s), warnings=${warnings.length}`);
