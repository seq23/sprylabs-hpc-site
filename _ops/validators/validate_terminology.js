const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const FORBIDDEN = [
  /\bminimum day\b/i,
  /\bscope cap\b/i,
  /\bdone loop\b/i,
  /\bcatch ?up rule\b/i
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

const htmlFiles = walk(ROOT).filter(f => f.endsWith('.html'));
const failures=[];
for (const f of htmlFiles) {
  const rel = path.relative(ROOT,f);
  const txt = fs.readFileSync(f,'utf8');
  for (const rx of FORBIDDEN) {
    if (rx.test(txt)) failures.push(`${rel}: forbidden synonym matched ${rx}`);
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} forbidden terminology instances`);
  for (const f of failures.slice(0,200)) console.error(f);
  process.exit(1);
}
console.log(`OK: no forbidden terminology found across ${htmlFiles.length} html files`);
