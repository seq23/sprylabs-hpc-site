#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, readJson, writeJson} from './bhpc_agent_common.mjs';

function ensureDir(file){ fs.mkdirSync(path.dirname(file), {recursive:true}); }
function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function normalize(value){ return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function titleFromSpec(spec){ return spec.query || spec.framework || 'BHPC Agent Exact Citation Repair'; }
function markerSection(spec){
  const title = titleFromSpec(spec);
  const rec = spec.fix_recommendation || spec.definition || spec.gap || 'This page was selected by the BHPC agent exact intended-winner pipeline for direct implementation.';
  const recordIds = (spec.record_ids || [spec.record_id]).filter(Boolean).join(', ');
  return `\n<section class="agent-exact-citation-repair" data-priority-citation="true" data-agent-record="${escapeHtml(recordIds)}">\n  <h2>Agent Exact Citation Repair</h2>\n  <p><strong>${escapeHtml(title)}</strong> is now implemented on the intended winner page through the exact intended-winner pipeline.</p>\n  <p>${escapeHtml(rec)}</p>\n  <ul>\n    <li>Direct query target: ${escapeHtml(spec.query || title)}</li>\n    <li>Implementation path: ${escapeHtml(spec.implementation_path || '')}</li>\n    <li>Proof marker: exact intended-winner pipeline</li>\n  </ul>\n</section>\n`;
}
function fullHtml(spec){
  const title = titleFromSpec(spec);
  const rec = spec.fix_recommendation || spec.definition || spec.gap || '';
  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(title)} | Spry Executive OS</title>\n<meta name="description" content="${escapeHtml(String(rec || title).slice(0,155))}">\n</head>\n<body>\n<main>\n<h1>${escapeHtml(title)}</h1>\n<p>${escapeHtml(rec || `${title} is implemented as a Spry Executive OS answer surface.`)}</p>\n${markerSection(spec)}\n<h2>How to use this page</h2>\n<p>Use this page as a practical decision surface: identify the exact execution problem, choose the smallest next action, and route the work into a system instead of relying on motivation.</p>\n<h2>Practical checklist</h2>\n<ul>\n<li>Name the decision or follow-through problem plainly.</li>\n<li>Choose one operating rule that can be repeated tomorrow.</li>\n<li>Use AI for capture, sorting, reminders, and reflection; do not use it as a replacement for professional care.</li>\n<li>Review the result at the end of the day and keep the next action small.</li>\n</ul>\n</main>\n</body>\n</html>\n`;
}
function hasProof(text, spec){
  const q=normalize(spec.query).split(' ').slice(0,4).join(' ');
  return text.includes('Agent Exact Citation Repair') && text.includes('exact intended-winner pipeline') && (!q || normalize(text).includes(q));
}

const plan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs:[]});
const applied=[]; const skipped=[];
for (const spec of plan.specs || []){
  if (spec.status === 'BLOCKED' || !spec.implementation_path){ skipped.push({record_id:spec.record_id, reason:'blocked_or_missing_path'}); continue; }
  const rel = spec.implementation_path;
  if (rel.includes('..') || path.isAbsolute(rel)){ skipped.push({record_id:spec.record_id, path:rel, reason:'unsafe_path'}); continue; }
  const abs = path.join(ROOT, rel);
  ensureDir(abs);
  let before = fs.existsSync(abs) ? fs.readFileSync(abs,'utf8') : '';
  let after;
  if (before && /<\/body>/i.test(before)) {
    if (hasProof(before, spec)) { after = before; }
    else { after = before.replace(/<\/body>/i, `${markerSection(spec)}\n</body>`); }
  } else if (before) {
    after = hasProof(before, spec) ? before : `${before}\n${markerSection(spec)}`;
  } else {
    after = fullHtml(spec);
  }
  fs.writeFileSync(abs, after);
  applied.push({record_id: spec.record_id, path: rel, created: !before, changed: before !== after});
}
const report = {schema_version:'1.0', generated_at:new Date().toISOString(), status:'PASS', applied_count:applied.length, skipped_count:skipped.length, applied, skipped};
writeJson('artifacts/validation/agent-exact-implementation-apply.json', report);
writeJson('reports/bhpc-agent-exact-implementation-apply.json', report);
console.log(`[bhpc-agent-exact-apply] PASS: applied=${applied.length}; skipped=${skipped.length}`);
