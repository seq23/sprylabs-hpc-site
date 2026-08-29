#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function stripTags(value='') { return String(value).replace(/<[^>]+>/g, ' '); }
function sentenceCount(value='') { return (stripTags(value).match(/[.!?](?:[”"']?)(?=\s|$)/g) || []).length; }
function splitLongParagraphsInHtml(html) {
  let changed = false;
  const out = html.replace(/<p([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, inner) => {
    if (sentenceCount(inner) <= 3) return match;
    if (/<\/?(a|strong|em|span|time|code|br)\b/i.test(inner)) {
      // Preserve inline markup safely by leaving complex paragraphs untouched.
      return match;
    }
    const pieces = String(inner).split(/(?<=[.!?])\s+/).filter(Boolean);
    if (pieces.length <= 3) return match;
    const groups = [];
    for (let i=0; i<pieces.length; i+=3) groups.push(pieces.slice(i,i+3).join(' '));
    changed = true;
    return groups.map(chunk => `<p${attrs}>${chunk}</p>`).join('');
  });
  return {html: out, changed};
}
function repairLongParagraphs() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content/page_admission_registry.json'), 'utf8')).records || [];
  const repaired = [];
  for (const record of registry) {
    if (!record.path) continue;
    const abs = path.join(ROOT, record.path);
    if (!fs.existsSync(abs) || !abs.endsWith('.html')) continue;
    const before = fs.readFileSync(abs, 'utf8');
    const result = splitLongParagraphsInHtml(before);
    if (result.changed) {
      fs.writeFileSync(abs, result.html);
      repaired.push(record.path);
    }
  }
  return repaired;
}

const generatedGlobs = [
  'artifacts/validation/agent-exact-implementation-apply.json',
  'data/strategy/strategy_gap_fill_release_queue.json',
  'data/strategy/strategy_gap_fill_backlog.json'
];
const errors = [];
const paragraph_repairs = repairLongParagraphs();
for (const rel of generatedGlobs) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) errors.push(`missing_generated_evidence:${rel}`);
}
const queuePath = path.join(ROOT, 'data/strategy/strategy_gap_fill_release_queue.json');
let selected = [];
if (fs.existsSync(queuePath)) selected = JSON.parse(fs.readFileSync(queuePath,'utf8')).selected || [];
for (const row of selected) {
  if (row.self_healing_required !== true || row.prevalidation_required !== true) errors.push(`gap_fill_row_missing_finish_flags:${row.id}`);
  if (row.exact_agent_content === true || row.fallback_gap_fill !== true) errors.push(`gap_fill_row_not_separated:${row.id}`);
  if (!String(row.claim_boundary || '').includes('no therapy')) errors.push(`gap_fill_row_claim_boundary_missing:${row.id}`);
}
const report = {schema_version:'1.0', validator:'bhpc-generated-content-self-heal', status:errors.length?'FAIL':'PASS', checked_gap_fill_rows:selected.length, paragraph_repairs, repaired_long_paragraph_count:paragraph_repairs.length, self_healing_status:'REPAIRED_AND_PREVALIDATION_READY', errors};
fs.mkdirSync(path.join(ROOT,'artifacts/validation'), {recursive:true});
fs.writeFileSync(path.join(ROOT,'artifacts/validation/generated-content-self-heal.json'), JSON.stringify(report,null,2)+'\n');
if (errors.length) { console.error(JSON.stringify(report,null,2)); process.exit(1); }
// A self-heal that rewrites published HTML must say so on the console. This
// reported only the gap-fill row count while silently splitting long paragraphs
// in live pages, so an operator reading the log could not tell the run had
// mutated the site at all. The count was already in the JSON artifact; the
// console line is what anybody actually reads.
if (!fs.existsSync(queuePath)) {
  console.error(`[bhpc-generated-content-self-heal] STOP: missing ${path.relative(ROOT, queuePath)} - this run examined no gap-fill rows, so PASS would be a false statement`);
  process.exit(1);
}
const repairedNames = paragraph_repairs.length
  ? ` (${paragraph_repairs.slice(0, 5).join(', ')}${paragraph_repairs.length > 5 ? `, +${paragraph_repairs.length - 5} more` : ''})`
  : '';
console.log(`[bhpc-generated-content-self-heal] PASS: checked_gap_fill_rows=${selected.length}; long_paragraph_pages_rewritten=${paragraph_repairs.length}${repairedNames}`);
