#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
function walk(dir, out = []) { if (!fs.existsSync(dir)) return out; for (const entry of fs.readdirSync(dir, {withFileTypes:true})) { if (['.git','node_modules'].includes(entry.name)) continue; const abs = path.join(dir, entry.name); if (entry.isDirectory()) walk(abs,out); else if (entry.isFile() && entry.name.endsWith('.html')) out.push(abs); } return out; }
function writeJson(rel, payload) { const file = path.join(ROOT, rel); fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, `${JSON.stringify(payload,null,2)}\n`); }
const offenders = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  if (/Agent Exact Citation Repair|exact intended-winner pipeline/i.test(html)) offenders.push(rel);
}
const report = {schema_version:'1.0', generated_at:new Date().toISOString(), status: offenders.length ? 'FAIL' : 'PASS', scanned_html_files: walk(ROOT).length, offender_count: offenders.length, offenders};
writeJson('artifacts/validation/bhpc-no-marker-only-agent-pass.json', report);
if (offenders.length) { console.error(`[validate:bhpc-no-marker-only-agent-pass] FAIL: ${offenders.length} marker-only page(s)`); for (const rel of offenders.slice(0,80)) console.error(` - ${rel}`); process.exit(1); }
console.log(`[validate:bhpc-no-marker-only-agent-pass] PASS: scanned=${report.scanned_html_files}`);
