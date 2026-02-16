const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const insightsDir = path.join(repoRoot, 'content', 'insights');
const modelsDir = path.join(repoRoot, 'models');

const modelSlugs = fs.readdirSync(modelsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort();

const insightFiles = fs.readdirSync(insightsDir)
  .filter(f => f.endsWith('.md'))
  .sort();

function extractModelLinks(md) {
  const re = /\(\/models\/([a-z0-9\-]+)\/\)/g;
  const out = new Set();
  let m;
  while ((m = re.exec(md)) !== null) out.add(m[1]);
  return out;
}

const rows = [];
for (const f of insightFiles) {
  const md = fs.readFileSync(path.join(insightsDir, f), 'utf8');
  const slugs = extractModelLinks(md);
  const row = { insight: f };
  for (const ms of modelSlugs) row[ms] = slugs.has(ms) ? '1' : '0';
  rows.push(row);
}

const header = ['insight', ...modelSlugs];
const lines = [header.join(',')];
for (const r of rows) {
  lines.push(header.map(h => r[h] ?? '').join(','));
}

const outPath = path.join(repoRoot, '_ops', 'audits', 'MODEL_COVERAGE_MATRIX.csv');
fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

// Also write counts.
const counts = {};
for (const ms of modelSlugs) counts[ms] = 0;
for (const r of rows) for (const ms of modelSlugs) counts[ms] += Number(r[ms]);
const countsSorted = Object.entries(counts).sort((a,b)=>a[1]-b[1]);
const countsLines = countsSorted.map(([k,v]) => `${k}: ${v}`).join('\n') + '\n';
fs.writeFileSync(path.join(repoRoot, '_ops', 'audits', 'MODEL_COVERAGE_COUNTS.txt'), countsLines, 'utf8');

console.log('Wrote', outPath);
console.log('Model coverage counts (ascending):');
for (const [k,v] of countsSorted) console.log(' ', k, v);
