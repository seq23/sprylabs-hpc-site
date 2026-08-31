const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INSIGHTS_DIR = path.join(ROOT,'content','insights');
const DOWNLOAD = 'https://spryexecutiveos.com/download.html';

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
if (!fs.existsSync(INSIGHTS_DIR)) {
  console.error(`FAIL: ${INSIGHTS_DIR} does not exist; this validator's entire examination set is that directory.`);
  process.exit(1);
}
{
  // README.md documents the directory; it is not an insight and never carried
  // frontmatter. Scanning it produced all 5 of this validator's failures while
  // the 142 real insight sources passed, which is most of why nothing ran it.
  const files = fs.readdirSync(INSIGHTS_DIR).filter(f=>f.endsWith('.md') && f.toLowerCase()!=='readme.md');
  // A renamed or emptied content/insights/ would otherwise report "schema valid"
  // over nothing.
  if (!files.length) {
    console.error(`FAIL: ${INSIGHTS_DIR} contains no .md insight sources; expected the markdown these pages are built from. Validating zero insights proves no schema holds.`);
    process.exit(1);
  }
  for (const fn of files) {
    const p=path.join(INSIGHTS_DIR,fn);
    const md=fs.readFileSync(p,'utf8');
    const fm=readFrontmatter(md);
    if (!fm.date) failures.push(`${fn}: missing date frontmatter`);
    if (!/##\s+Short Answer\b/i.test(md)) failures.push(`${fn}: missing ## Short Answer section`);
    if (!/##\s+Related Frameworks\b/i.test(md)) failures.push(`${fn}: missing ## Related Frameworks section`);
    if (!/##\s+Source\b/i.test(md)) failures.push(`${fn}: missing ## Source section`);
    if (!md.includes(DOWNLOAD)) failures.push(`${fn}: missing download.html link`);
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} insight schema issues`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log('OK: insight schema valid');
