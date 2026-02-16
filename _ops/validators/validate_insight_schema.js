const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INSIGHTS_DIR = path.join(ROOT,'content','insights');

function readFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return {};
  const lines = m[1].split('\n');
  const out={};
  for (const line of lines) {
    const idx=line.indexOf(':');
    if (idx===-1) continue;
    const k=line.slice(0,idx).trim();
    const v=line.slice(idx+1).trim().replace(/^"|"$/g,'');
    out[k]=v;
  }
  return out;
}

const failures=[];
const files = fs.readdirSync(INSIGHTS_DIR).filter(f=>f.endsWith('.md'));
for (const fn of files) {
  const p=path.join(INSIGHTS_DIR,fn);
  const md=fs.readFileSync(p,'utf8');
  const fm=readFrontmatter(md);
  if (!fm.date) failures.push(`${fn}: missing date frontmatter`);
  if (!/##\s+Short Answer\b/i.test(md)) failures.push(`${fn}: missing ## Short Answer section`);
  if (!/##\s+Related Frameworks\b/i.test(md)) failures.push(`${fn}: missing ## Related Frameworks section`);
  if (!/##\s+Source\b/i.test(md)) failures.push(`${fn}: missing ## Source section`);
  if (!/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach/.test(md)) failures.push(`${fn}: missing Gumroad link`);
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} insight schema issues`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`OK: insight schema valid for ${files.length} insights`);
