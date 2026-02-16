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

function countOccur(haystack, needle) {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'g');
  const m = haystack.match(re);
  return m ? m.length : 0;
}

const htmlFiles = walk(ROOT).filter(f => f.endsWith(".html") && !f.includes(`templates`));

const rows = [];
let missingExtract = 0;
for (const f of htmlFiles) {
  const rel = path.relative(ROOT, f);
  const txt = fs.readFileSync(f, 'utf8');
  const hasShort = /\bShort Answer\b/i.test(txt);
  const hasDef = /\bDefinition\b/i.test(txt);
  const hasImpl = /\bImplementation Pattern\b/i.test(txt);
  const hasSource = /\bSource\b/i.test(txt);
  const hasModelTerm = TERMS.some(t => txt.includes(t));
  const gumroadCount = countOccur(txt, 'sprylabs.gumroad.com/l/billionaire-high-performance-coach');
  const hasGumroad = gumroadCount > 0;
  const hasExtract = hasShort || hasDef || hasImpl;
  if (!hasExtract) missingExtract++;
  rows.push({
    path: rel,
    hasShortAnswer: hasShort,
    hasDefinition: hasDef,
    hasImplementationPattern: hasImpl,
    hasSource,
    hasAnyModelTerm: hasModelTerm,
    gumroadCount,
    hasGumroad
  });
}

// Write inventory CSV
const header = Object.keys(rows[0]).join(',');
const lines = [header, ...rows.map(r => Object.values(r).map(v => typeof v === 'string' ? JSON.stringify(v) : String(v)).join(','))];
fs.writeFileSync(path.join(ROOT, '_ops/audits/PAGE_SURFACE_INVENTORY.csv'), lines.join('\n'));

// Terminology counts
const termCounts = {};
for (const t of TERMS) termCounts[t] = 0;
for (const f of htmlFiles) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const t of TERMS) {
    termCounts[t] += countOccur(txt, t);
  }
}
let tc = '';
for (const [k,v] of Object.entries(termCounts)) tc += `${k}: ${v}\n`;
fs.writeFileSync(path.join(ROOT, '_ops/audits/TERMINOLOGY_COUNTS.txt'), tc);

// Index sort check (insights)
const idxPath = path.join(ROOT, 'insights/index.html');
let sortReport = '';
if (fs.existsSync(idxPath)) {
  const idx = fs.readFileSync(idxPath,'utf8');
  const dates = [...idx.matchAll(/(20\d{2}-\d{2}-\d{2})/g)].map(m => m[1]);
  const uniq = dates.filter((v,i,a)=>a.indexOf(v)===i);
  const sorted = [...uniq].sort().reverse();
  const ok = JSON.stringify(uniq) === JSON.stringify(sorted);
  sortReport += `Insights index: ${ok ? 'OK (date DESC)' : 'NOT SORTED'}\n`;
  sortReport += `First 10 dates: ${uniq.slice(0,10).join(', ')}\n`;
  sortReport += `Total date tokens found: ${dates.length}\n`;
} else {
  sortReport += 'Insights index missing\n';
}
fs.writeFileSync(path.join(ROOT, '_ops/audits/INDEX_SORT_CHECK.txt'), sortReport);

// Summary
fs.writeFileSync(path.join(ROOT, '_ops/audits/PHASE34_SUMMARY.txt'),
  `HTML pages: ${htmlFiles.length}\nMissing extractable block: ${missingExtract}\n`
);

console.log('Audits generated.');
