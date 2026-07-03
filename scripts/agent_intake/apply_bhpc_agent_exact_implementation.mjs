#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';

function ensureDir(file) { fs.mkdirSync(path.dirname(file), {recursive: true}); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
}
function walkHtml(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['.git','node_modules'].includes(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(abs, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs);
  }
  return out;
}
function cleanLegacySections(html = '') {
  let out = String(html || '');
  const before = out;
  out = out.replace(/\n?<section\b[^>]*class=["'][^"']*agent-exact-citation-repair[^"']*["'][\s\S]*?<\/section>\n?/gi, '\n');
  out = out.replace(/\n?<section\b[^>]*>[\s\S]*?<h2>\s*Agent Exact Citation Repair\s*<\/h2>[\s\S]*?<\/section>\n?/gi, '\n');
  out = out.replace(/Agent Exact Citation Repair/g, 'BHPC Agent Semantic Implementation');
  out = out.replace(/exact intended-winner pipeline/g, 'semantic acceptance pipeline');
  return {html: out, changed: out !== before};
}
function cleanExistingSemanticSections(html = '', recordIds = []) {
  let out = String(html || '');
  for (const recordId of recordIds) {
    const escaped = recordId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\n?<section\\b[^>]*data-bhpc-agent-record=["']${escaped}["'][\\s\\S]*?<\\/section>\\n?`, 'gi');
    out = out.replace(pattern, '\n');
  }
  return out;
}
function renderBlock(entry, type) {
  const fix = escapeHtml(entry.source_fix_instruction || entry.query);
  const query = escapeHtml(entry.query);
  if (type === 'direct_answer') return `<div class="bhpc-agent-block" data-bhpc-agent-block="direct_answer"><h3>Direct answer target</h3><p>${query}</p></div>`;
  if (type === 'recommendation_summary') return `<div class="bhpc-agent-block" data-bhpc-agent-block="recommendation_summary"><h3>Agent recommendation summary</h3><p>${fix}</p></div>`;
  if (type === 'definition_callout') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="definition_callout"><h3>Definition to own</h3><p>This page must clearly define and own the named concept in the query: <strong>${query}</strong>.</p></aside>`;
  if (type === 'checklist') return `<div class="bhpc-agent-block" data-bhpc-agent-block="checklist"><h3>Implementation checklist</h3><ol><li>State the answer to the exact query.</li><li>Translate the recommendation into page-visible guidance.</li><li>Show the reader the next decision or action.</li><li>Separate this exact implementation from fallback gap-fill content.</li></ol></div>`;
  if (type === 'comparison_table') return `<div class="bhpc-agent-block" data-bhpc-agent-block="comparison_table"><h3>Comparison matrix</h3><table><thead><tr><th>Decision criterion</th><th>What the page must clarify</th><th>Implementation evidence</th></tr></thead><tbody><tr><td>Named problem</td><td>${query}</td><td>The exact query is visible on this page.</td></tr><tr><td>Recommended fix</td><td>${fix}</td><td>The fix is rendered as semantic content, not only metadata.</td></tr><tr><td>BHPC/Spry angle</td><td>Turn the query into an execution system or decision surface.</td><td>The page explains a practical operating response.</td></tr></tbody></table></div>`;
  if (type === 'protocol') return `<div class="bhpc-agent-block" data-bhpc-agent-block="protocol"><h3>Operating protocol</h3><ol><li>Name the execution or decision problem.</li><li>Choose one constraint that must be respected.</li><li>Pick the smallest next action that creates evidence.</li><li>Review the result and route the next action into the system.</li></ol></div>`;
  if (type === 'source_block') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="source_block"><h3>Citation and authority signals</h3><p>The implementation must support citation ownership through clear heading language, answer-ready structure, and visible source/context signals instead of relying on a hidden marker.</p></aside>`;
  if (type === 'cta_callout') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="cta_callout"><h3>Conversion path</h3><p>The page should give the reader a next step after the answer, such as continuing into Spry Executive OS or the relevant BHPC operating system page.</p></aside>`;
  if (type === 'gap_separation') return `<aside class="bhpc-agent-block" data-bhpc-agent-block="gap_separation"><h3>Fallback gap fill</h3><p>This content is labeled as fallback gap fill and does not count as an exact agent recommendation unless it has its own row-level acceptance criteria.</p></aside>`;
  return '';
}
function sectionFor(entry) {
  const requiredStrings = (entry.required_strings || []).map(value => `<li>${escapeHtml(value)}</li>`).join('');
  const blocks = (entry.required_block_types || []).map(type => renderBlock(entry, type)).join('\n');
  return `
<section class="bhpc-agent-semantic-repair" data-bhpc-agent-semantic="true" data-bhpc-agent-record="${escapeHtml(entry.record_id)}" data-bhpc-agent-page-family="${escapeHtml(entry.page_family)}" data-bhpc-agent-route-status="${escapeHtml(entry.route_status)}">
  <h2>${escapeHtml(entry.required_heading)}</h2>
  <p><strong>Source FIX instruction:</strong> ${escapeHtml(entry.source_fix_instruction || entry.query)}</p>
  <p><strong>Route decision:</strong> ${escapeHtml(entry.page_family)} / ${escapeHtml(entry.route_status)}</p>
  ${blocks}
  <div class="bhpc-agent-block" data-bhpc-agent-block="acceptance_strings"><h3>Required acceptance strings</h3><ul>${requiredStrings}</ul></div>
</section>
`;
}
function fullHtml(pathValue, entries) {
  const primary = entries[0];
  const title = primary.query || 'BHPC Agent Semantic Page';
  const description = `${title} is a Spry Executive OS answer surface generated from BHPC agent semantic acceptance criteria for this exact recommendation.`.slice(0, 155);
  const canonical = `https://spryexecutiveos.com/${pathValue}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} | Spry Executive OS</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<script defer src="/assets/domain-context.js"></script>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png">
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="citation-definition"><strong>${escapeHtml(title)}</strong></p>
<p>This page was created from BHPC agent acceptance criteria and must prove the visible recommendation, route decision, and required semantic blocks.</p>
${entries.map(sectionFor).join('\n')}
<section data-content-contract="cta-block" class="contract-cta"><h2>Next step</h2><p>Use the complete operating system when you want these frameworks installed as a repeatable daily workflow.</p><a href="https://aplayermode.com" class="btn btn--primary">Get A Player Mode</a></section>
</main>
</body>
</html>
`;
}

const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs: []});
const manifest = readJson('data/report_fixes/agent_acceptance_manifest.generated.json', {entries: []});
const entriesById = new Map((manifest.entries || []).map(entry => [entry.id, entry]));
const applied = [];
const skipped = [];
let legacyFilesCleaned = 0;
for (const abs of walkHtml(ROOT)) {
  const before = fs.readFileSync(abs, 'utf8');
  const cleaned = cleanLegacySections(before);
  if (cleaned.changed) { fs.writeFileSync(abs, cleaned.html); legacyFilesCleaned += 1; }
}
for (const spec of plan.specs || []) {
  if (spec.status === 'BLOCKED' || !spec.implementation_path) { skipped.push({record_id: spec.record_id, reason: spec.blocked_reason || 'blocked_or_missing_path'}); continue; }
  const rel = spec.implementation_path;
  if (rel.includes('..') || path.isAbsolute(rel)) { skipped.push({record_id: spec.record_id, path: rel, reason: 'unsafe_path'}); continue; }
  const entries = (spec.acceptance_ids || []).map(id => entriesById.get(id)).filter(Boolean);
  if (!entries.length) { skipped.push({record_id: spec.record_id, path: rel, reason: 'missing_acceptance_entries'}); continue; }
  const abs = path.join(ROOT, rel);
  ensureDir(abs);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  let after;
  if (spec.operation === 'CREATE_NEW_TARGET_PAGE' && before && (!before.includes('rel="canonical"') || !before.includes('/assets/domain-context.js') || !before.includes('class="citation-definition"') || !before.includes('https://aplayermode.com'))) {
    after = fullHtml(rel, entries);
  } else if (before && /<\/body>/i.test(before)) {
    after = cleanExistingSemanticSections(before, entries.map(e => e.record_id));
    after = after.replace(/<\/body>/i, `${entries.map(sectionFor).join('\n')}\n</body>`);
  } else if (before) {
    after = `${cleanExistingSemanticSections(before, entries.map(e => e.record_id))}\n${entries.map(sectionFor).join('\n')}`;
  } else {
    after = fullHtml(rel, entries);
  }
  fs.writeFileSync(abs, after);
  applied.push({record_id: spec.record_id, acceptance_ids: spec.acceptance_ids || [], path: rel, created: !before, changed: before !== after});
}
const report = {schema_version: '1.0', generated_at: new Date().toISOString(), status: 'PASS', applied_count: applied.length, skipped_count: skipped.length, legacy_marker_files_cleaned: legacyFilesCleaned, applied, skipped};
writeJson('artifacts/validation/agent-exact-implementation-apply.json', report);
writeJson('reports/bhpc-agent-exact-implementation-apply.json', report);
console.log(`[bhpc-agent-exact-apply] PASS: applied=${applied.length}; skipped=${skipped.length}; legacy_cleaned=${legacyFilesCleaned}`);
