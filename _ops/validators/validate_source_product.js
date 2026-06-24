const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DOWNLOAD = 'https://spryexecutiveos.com/download.html';

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const htmlFiles = walk(ROOT).filter(f => f.endsWith('.html') && !path.relative(ROOT, f).replace(/\\/g, '/').startsWith('data/report_fixes/agent_runs/'));
const failures = [];
for (const f of htmlFiles) {
  const rel = path.relative(ROOT, f);
  const raw = fs.readFileSync(f, 'utf8');
  const sourceMatch = raw.match(/<h2>Source<\/h2>([\s\S]{0,800})<\/section>/i);
  if (sourceMatch) {
    const source = sourceMatch[1];
    if (/gumroad\.com/i.test(source)) failures.push(`${rel}: Gumroad appears inside Source block`);
    if (!source.includes(DOWNLOAD)) failures.push(`${rel}: Source block missing download.html link`);
    if (!/Spry Executive OS framework/i.test(source)) failures.push(`${rel}: Source block missing framework text`);
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} source/product issues`);
  for (const f of failures.slice(0, 200)) console.error(f);
  process.exit(1);
}
console.log('OK: source/product framing checks passed');
