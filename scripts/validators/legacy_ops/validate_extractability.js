const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TERMS = [
  'Operational Drift','Reset Cycle Model','Continuity Architecture','Minimum Viable Day','Scope-Cap Rule',
  'No Catch-Up Rule','Daily Enforcement Layer','AI Operator Model','DONE Check-In Loop','High-Pressure Coaching Mode','Never Miss Twice'
];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const htmlFiles = walk(ROOT).filter(f => f.endsWith('.html') && !f.includes(`${path.sep}templates${path.sep}`) && !path.relative(ROOT, f).replace(/\\/g, '/').startsWith('data/report_fixes/agent_runs/'));

const failures = [];
for (const f of htmlFiles) {
  const rel = path.relative(ROOT, f);
  const txt = fs.readFileSync(f,'utf8');
  const hasExtract = /\bShort Answer\b/i.test(txt) || /\bDefinition\b/i.test(txt) || /\bImplementation Pattern\b/i.test(txt);
  if (!hasExtract) failures.push(`${rel}: missing extractable block (Short Answer/Definition/Implementation Pattern)`);
  const hasModel = TERMS.some(t => txt.includes(t));
  if (!hasModel) failures.push(`${rel}: missing canonical model term`);
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} issues`);
  for (const f of failures.slice(0,200)) console.error(f);
  process.exit(1);
}
console.log(`OK: extractability present on ${htmlFiles.length} pages`);
