#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readCapturedScope} from './page_scope.mjs';

const ROOT = process.cwd();
const mode = process.argv.includes('--full') || process.env.VALIDATION_CACHE_MODE === 'full' ? 'full' : 'incremental';
const approvedHosts = new Set(['spryexecutiveos.com', 'billionairehighperformancecoach.com']);
const forbiddenPublicPatterns = [
  /Agent recommendation implementation/i,
  /Agent-directed implementation/i,
  /Agent source instruction/i,
  /Source FIX instruction/i,
  /Required acceptance strings/i,
  /BHPC Agent Acceptance Framework/i,
  /visible semantic proof/i,
  /route-specific implementation/i
];

function readJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; }
}
function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git', 'node_modules', '.validation-runtime'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
function count(re, text) { return [...String(text).matchAll(re)].length; }
function stripTags(value = '') { return String(value).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim(); }
function metaContent(html, name) {
  const re = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>|<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const m = html.match(re); return (m?.[1] || m?.[2] || '').trim();
}
function canonicalHref(html) {
  const m = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  return (m?.[1] || m?.[2] || '').trim();
}
function jsonLdErrors(html) {
  const errors = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; let i = 0;
  while ((m = re.exec(html))) {
    i += 1;
    try { JSON.parse(m[1].trim()); } catch (error) { errors.push(`invalid_json_ld_${i}:${error.message}`); }
  }
  return errors;
}
function pathToRel(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }
function activePlanSpecs() {
  const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
  return (plan.specs || []).filter(x => x.status !== 'BLOCKED' && x.implementation_path);
}
function citablePagePaths() {
  const registry = readJson('data/citation/citable_pages.json', {pages: []});
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
  const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
  const activeIds = activeAcceptanceIds();
  const map = new Map();
  for (const entry of manifest.entries || []) {
    const rel = String(entry.implementation_path || '').replace(/^\/+/, '');
    const recordId = String(entry.record_id || entry.id || '');
    if (!rel || entry.acceptance_status === 'NO_ACTION') continue;
    if (!activeIds.has(recordId)) continue;
    if (!map.has(rel)) map.set(rel, []);
    map.get(rel).push(entry);
  }
  return map;
}

const active = activePaths();
const acceptance = acceptanceByPath();
const scopedPaths = mode === 'full'
  ? citablePagePaths()
  : process.env.VALIDATION_PAGE_SCOPE_FILE
    ? readCapturedScope(process.env.VALIDATION_PAGE_SCOPE_FILE).paths
    : [...active];
const files = scopedPaths.map(rel => path.join(ROOT, rel)).filter(fs.existsSync);
const failures = [];
const warnings = [];
const checked = [];

for (const abs of files) {
  const rel = pathToRel(abs);
  const html = fs.readFileSync(abs, 'utf8');
  const titleCount = count(/<title\b[^>]*>[\s\S]*?<\/title>/gi, html);
  const h1Count = count(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi, html);
  const canonicalCount = count(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, html);
  if (titleCount !== 1) failures.push({path: rel, code: 'TITLE_COUNT', detail: titleCount});
  if (h1Count !== 1) failures.push({path: rel, code: 'H1_COUNT', detail: h1Count});
  if (canonicalCount !== 1) failures.push({path: rel, code: 'CANONICAL_COUNT', detail: canonicalCount});
  const canonical = canonicalHref(html);
  if (canonical) {
    try {
      const u = new URL(canonical);
      if (!approvedHosts.has(u.hostname)) failures.push({path: rel, code: 'CANONICAL_HOST', detail: u.hostname});
    } catch { failures.push({path: rel, code: 'CANONICAL_INVALID', detail: canonical}); }
  }
  for (const detail of jsonLdErrors(html)) failures.push({path: rel, code: 'JSON_LD', detail});
  if (/\{\{[^}]+\}\}|%%[A-Z0-9_:.-]+%%|\[TODO\]|\bTODO:\b/i.test(html)) failures.push({path: rel, code: 'UNRESOLVED_TOKEN'});
  for (const re of forbiddenPublicPatterns) if (re.test(html)) failures.push({path: rel, code: 'PUBLIC_OPERATIONAL_SCAFFOLDING', detail: re.source});

  for (const entry of acceptance.get(rel) || []) {
    const marker = `data-bhpc-agent-record="${entry.record_id}"`;
    if (!html.includes(marker)) failures.push({path: rel, code: 'MISSING_RECORD_MARKER', detail: entry.record_id});
    const heading = stripTags(entry.required_heading || '');
    if (heading && !stripTags(html).toLowerCase().includes(heading.toLowerCase())) failures.push({path: rel, code: 'MISSING_REQUIRED_HEADING', detail: heading});
    for (const link of entry.required_internal_links || []) {
      if (!link?.to_url) continue;
      let pathname = '';
      try { pathname = new URL(link.to_url, 'https://billionairehighperformancecoach.com').pathname; } catch { pathname = String(link.to_url); }
      // A link action whose to_url resolves to this same page is a self-link. The
      // apply step cannot render it as a related-page link, so requiring its anchor
      // text here can never be satisfied. Skip it and record it as a data warning
      // against the emitting record rather than blocking every downstream deploy.
      if (pathname.replace(/^\/+/, '') === rel) {
        warnings.push({path: rel, code: 'SELF_REFERENTIAL_LINK_ACTION', detail: pathname, record_id: entry.record_id});
        continue;
      }
      if (!html.includes(`href="${pathname}"`) && !html.includes(`href='${pathname}'`)) failures.push({path: rel, code: 'MISSING_REQUIRED_LINK', detail: pathname});
      // Link presence is an invariant; exact anchor wording is a recommendation.
      if (link.anchor_text && !stripTags(html).toLowerCase().includes(String(link.anchor_text).toLowerCase())) warnings.push({path: rel, code: 'ANCHOR_TEXT_MISMATCH', detail: link.anchor_text, record_id: entry.record_id});
    }
  }

  const title = stripTags((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const description = metaContent(html, 'description');
  if (title.length && (title.length < 20 || title.length > 70)) warnings.push({path: rel, code: 'TITLE_LENGTH', detail: title.length});
  if (description.length && (description.length < 70 || description.length > 180)) warnings.push({path: rel, code: 'META_DESCRIPTION_LENGTH', detail: description.length});
  if (active.has(rel) && !/data-bhpc-agent-block=["']direct_answer["']/i.test(html)) warnings.push({path: rel, code: 'NO_DIRECT_ANSWER_BLOCK'});
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
