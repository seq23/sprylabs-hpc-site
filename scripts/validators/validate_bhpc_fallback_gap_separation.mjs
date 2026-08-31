#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
function readJson(rel, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } }
function writeJson(rel, payload) { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, `${JSON.stringify(payload,null,2)}\n`); }
const SPECS_PATH = 'data/citation/agent_html_report_page_specs.generated.json';
// This is an absence assertion, so an empty new_pages map is the expected healthy
// result and must keep passing. What could not be told apart from it was a deleted,
// renamed or corrupt spec file: the {new_pages:{}} fallback made "the generator
// produced no fallback pages" and "I could not read what the generator produced"
// print the same PASS line. Read it strictly and let the empty-but-present case pass.
if (!fs.existsSync(path.join(ROOT, SPECS_PATH))) {
  console.error(`[validate:bhpc-fallback-gap-separation] FAIL: ${SPECS_PATH} is missing. This validator asserts that the generator emitted no fallback gap-fill pages, and it can only assert that by reading that file's new_pages map; with no file there is no evidence either way.`);
  process.exit(1);
}
const htmlSpecs = readJson(SPECS_PATH);
if (!htmlSpecs || typeof htmlSpecs.new_pages !== 'object' || htmlSpecs.new_pages === null || Array.isArray(htmlSpecs.new_pages)) {
  console.error(`[validate:bhpc-fallback-gap-separation] FAIL: ${SPECS_PATH} could not be parsed or carries no new_pages object. The fallback-page check reads that map, so an unreadable or restructured spec file would report "0 fallback pages" without inspecting one.`);
  process.exit(1);
}
const exactPlan = readJson('artifacts/validation/agent-exact-implementation-plan.json', {specs:[]});
const exactPaths = new Set((exactPlan.specs || []).filter(s => s.status !== 'BLOCKED').flatMap(s => [s.implementation_path]));
// This validator used to police the wording of fallback pages: it failed with
// `fallback_without_visible_definition_label` unless a fallback page's visible
// definition contained the word "fallback". That made internal operator jargon
// a contract requirement on a public page, and it is why 743 pages published
// "a Spry Executive OS fallback content surface created to keep the 75-page
// daily citation velocity cadence intact" as the sentence defining them to
// readers.
//
// The cadence gate no longer synthesises fallback pages, so there is no wording
// left to police. What this validator asserts now is that none are produced:
// a fallback spec appearing here means the quota-driven branch is back.
const errors=[]; const fallback=[];
for (const [rel, spec] of Object.entries(htmlSpecs.new_pages || {})) {
  const isFallback = String(spec.source || '').includes('gap-fill')
    || String(spec.page_family || '') === 'fallback_gap_fill';
  if (isFallback) {
    fallback.push(rel);
    errors.push(`${rel}:fallback_gap_page_generated`);
    if (exactPaths.has(rel)) errors.push(`${rel}:fallback_gap_page_counted_as_exact_agent_fix`);
  }
}
const report={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', fallback_gap_pages:fallback.length, exact_plan_paths:exactPaths.size, fallback, errors};
writeJson('artifacts/validation/bhpc-fallback-gap-separation.json', report);
if(errors.length){console.error(`[validate:bhpc-fallback-gap-separation] FAIL: ${errors.length} issue(s)`); for(const e of errors) console.error(` - ${e}`); process.exit(1);}
console.log(`[validate:bhpc-fallback-gap-separation] PASS: fallback_gap_pages=${fallback.length} (expected 0)`);
