#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
function readJson(rel, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
function writeJson(rel, payload) { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, `${JSON.stringify(payload,null,2)}\n`); }
const htmlSpecs = readJson('data/citation/agent_html_report_page_specs.generated.json', {new_pages:{}, fallback_gap_pages:0});
const exactPlan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs:[]});
const exactPaths = new Set((exactPlan.specs || []).filter(s => s.status !== 'BLOCKED').flatMap(s => [s.implementation_path]));
const errors=[]; const fallback=[];
for (const [rel, spec] of Object.entries(htmlSpecs.new_pages || {})) {
  const isFallback = String(spec.source || '').includes('gap-fill') || String(spec.definition || '').includes('fallback');
  if (isFallback) {
    fallback.push(rel);
    if (exactPaths.has(rel)) errors.push(`${rel}:fallback_gap_page_counted_as_exact_agent_fix`);
    if (!String(spec.definition || '').toLowerCase().includes('fallback')) errors.push(`${rel}:fallback_without_visible_definition_label`);
  }
}
const report={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', fallback_gap_pages:fallback.length, exact_plan_paths:exactPaths.size, fallback, errors};
writeJson('artifacts/validation/bhpc-fallback-gap-separation.json', report);
if(errors.length){console.error(`[validate:bhpc-fallback-gap-separation] FAIL: ${errors.length} issue(s)`); for(const e of errors) console.error(` - ${e}`); process.exit(1);}
console.log(`[validate:bhpc-fallback-gap-separation] PASS: fallback_gap_pages=${fallback.length}`);
