#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, VALID_STATUSES, findAgentManifests, writeJson, parseCsv, safeScope, digestManifest} from './bhpc_agent_common.mjs';

const errors = [];
const warnings = [];
const runs = [];
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const allowedFields = new Set(['source','run_date','scope','bucket','vertical','artifact_shape','csv_path','html_path','json_path','status','created_at','absorbed_at','absorbed_record_count','normalized_path','social_run_path','notes','exact_implementation_policy']);

for (const entry of findAgentManifests()) {
  const manifest = entry.manifest || {};
  const context = entry.manifestRel;
  const scope = safeScope(manifest.scope || manifest.bucket || manifest.vertical || entry.scopeDirName || entry.scope || 'bhpc');
  if (!dateRe.test(entry.runDate)) errors.push(`${context}: parent folder must be YYYY-MM-DD`);
  if (manifest.run_date !== entry.runDate) errors.push(`${context}: run_date must match folder ${entry.runDate}`);
  if (!scope || !/^[a-z0-9][a-z0-9-]*$/.test(scope)) errors.push(`${context}: scope must be a safe slug`);
  if (manifest.scope && safeScope(manifest.scope) !== safeScope(entry.scopeDirName)) warnings.push(`${context}: scope ${manifest.scope} differs from folder ${entry.scopeDirName}; folder remains the source location`);
  if (!manifest.source || !/^twin_agent|ai_agent|citation_velocity_monitor$/i.test(String(manifest.source))) warnings.push(`${context}: source should identify Twin/Citation Velocity Monitor`);
  if (!VALID_STATUSES.has(manifest.status)) errors.push(`${context}: status must be one of ${Array.from(VALID_STATUSES).join(', ')}`);
  for (const key of Object.keys(manifest)) if (!allowedFields.has(key)) warnings.push(`${context}: unexpected manifest field ${key}`);
  if ('pdf_path' in manifest) errors.push(`${context}: pdf_path is retired; use html_path`);
  for (const key of ['csv_path','html_path','json_path']) {
    const rel = manifest[key];
    if (!rel) continue;
    if (rel.includes('..') || path.isAbsolute(rel)) errors.push(`${context}: unsafe artifact path ${rel}`);
    if (!rel.startsWith(`${entry.dirRel}/`)) errors.push(`${context}: ${key} must stay inside ${entry.dirRel}/`);
    else if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`${context}: missing artifact ${rel}`);
  }
  const pdfs = fs.existsSync(path.join(ROOT, entry.dirRel)) ? fs.readdirSync(path.join(ROOT, entry.dirRel)).filter(file => file.toLowerCase().endsWith('.pdf')) : [];
  if (pdfs.length) errors.push(`${context}: PDF artifacts are not accepted: ${pdfs.join(', ')}`);
  const digest = digestManifest(entry);
  let rowCount = 0;
  if (digest.csvRel && fs.existsSync(path.join(ROOT, digest.csvRel))) {
    const csvText = fs.readFileSync(path.join(ROOT, digest.csvRel), 'utf8');
    const rows = parseCsv(csvText);
    rowCount = rows.length;
    if (!csvText.trim()) errors.push(`${context}: CSV is empty`);
    if (!rows.length) warnings.push(`${context}: CSV has no data rows; JSON/HTML digest will be used as fallback signal`);
  }
  let htmlBytes = 0;
  if (digest.htmlRel && fs.existsSync(path.join(ROOT, digest.htmlRel))) {
    const html = fs.readFileSync(path.join(ROOT, digest.htmlRel), 'utf8');
    htmlBytes = Buffer.byteLength(html);
    if (htmlBytes < 100) errors.push(`${context}: HTML digest is too small to be useful`);
    if (/<script\b/i.test(html)) errors.push(`${context}: HTML digest must not include script tags`);
    if (!/<html\b|<body\b|<article\b|<main\b|<section\b/i.test(html)) warnings.push(`${context}: HTML digest has no structural HTML wrapper`);
  }
  if (digest.jsonRel && fs.existsSync(path.join(ROOT, digest.jsonRel))) {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, digest.jsonRel), 'utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) errors.push(`${context}: JSON artifact must be an object`);
    if (json?.scoreboard && typeof json.scoreboard.total !== 'number') warnings.push(`${context}: JSON scoreboard exists but total is not numeric`);
    if (json?.pages_to_build && !Array.isArray(json.pages_to_build)) errors.push(`${context}: JSON pages_to_build must be an array when present`);
  }
  if (!digest.csvRel && !digest.jsonRel && !digest.htmlRel) errors.push(`${context}: expected at least one CSV, JSON, or HTML artifact`);
  runs.push({
    run_date: entry.runDate,
    scope,
    status: manifest.status,
    csv_path: digest.csvRel || null,
    json_path: digest.jsonRel || null,
    html_path: digest.htmlRel || null,
    csv_rows: rowCount,
    json_fix_rows: digest.json_fix_row_count,
    json_pages_to_build: digest.json_pages_to_build_count,
    json_scoreboard_total: digest.json_scoreboard_total,
    parsed_records: digest.rows.length,
    html_bytes: htmlBytes,
    manifest: entry.manifestRel,
  });
}

const report = {schema_version:'1.1', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', run_count:runs.length, runs, errors, warnings};
writeJson('artifacts/validation/bhpc-agent-run-intake.json', report);
writeJson('reports/bhpc-agent-run-intake.json', report);
if (errors.length) {
  console.error(`[bhpc-agent-intake] FAIL: ${errors.length} issue(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[bhpc-agent-intake] PASS: ${runs.length} run folder(s), warnings=${warnings.length}`);
