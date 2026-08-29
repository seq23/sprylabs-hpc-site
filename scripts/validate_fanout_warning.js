const fs = require('fs');
const path = require('path');
const { classifyPageFamily } = require('./fanout/shared');

const ROOT = process.cwd();
const findings = [];
let checked = 0;
const variantToOwners = new Map();

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.pages-output', 'node_modules', '.git', '_ops', 'scripts', 'data', '.github', 'audit', '.build', 'releases', 'templates', 'docs'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) checkFile(full);
  }
}

function checkFile(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const family = classifyPageFamily(rel);
  if (family === 'ignore' || family === 'coverage') return;
  checked += 1;
  const html = fs.readFileSync(file, 'utf8');
  if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html) || /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html)) return;
  if (!html.includes('data-fanout-query-cluster="true"')) findings.push(`${rel}: missing fanout block`);
  const listGroups = html.match(/<ul class="fanout-list">([\s\S]*?)<\/ul>/gi) || [];
  if (listGroups.length < 2) {
    findings.push(`${rel}: fanout block missing required lists`);
    return;
  }
  const firstList = listGroups[0];
  const variants = [...firstList.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '').trim())).filter(Boolean);
  const intentLinks = [...(listGroups[1] || '').matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], label: decodeEntities(m[2].replace(/<[^>]+>/g, '').trim()) }));
  if (variants.length < 6) findings.push(`${rel}: weak fanout variants`);
  if (intentLinks.length < 3) findings.push(`${rel}: missing intent links`);
  const topicMatch = html.match(/data-fanout-topic="([^"]+)"/i);
  const topic = decodeEntities((topicMatch && topicMatch[1]) || '');
  if (!topic || topic.length < 6) findings.push(`${rel}: weak topic`);
  for (const variant of variants) {
    const key = String(variant).toLowerCase();
    const owners = variantToOwners.get(key) || [];
    owners.push(rel);
    variantToOwners.set(key, owners);
  }
}

walk(ROOT);



const missingManifest = path.join(ROOT, '.build', 'fanout_manifest.json');
const missingDuplicates = path.join(ROOT, '.build', 'fanout_duplicates.json');
if (fs.existsSync(missingManifest) && fs.statSync(missingManifest).size === 0) findings.push('.build/fanout_manifest.json empty');
if (fs.existsSync(missingDuplicates) && fs.statSync(missingDuplicates).size === 0) findings.push('.build/fanout_duplicates.json empty');

console.log(`validate_fanout_warning: checked ${checked} html files`);
// status and warning_count used to be hardcoded 'PASS'/0 no matter what was found,
// so 3,110 findings were attested as release evidence under a green PASS. Report
// what was actually found. Findings stay informational (this is a warning lane,
// not a gate), but the count is now the real one and a zero-work run is a failure.
const report = { schema_version: '2.0', status: findings.length ? 'INFORMATIONAL_FINDINGS' : 'PASS', checked, warning_count: 0, informational_count: findings.length, findings };
fs.mkdirSync(path.join(ROOT, 'reports'), {recursive:true});
fs.writeFileSync(path.join(ROOT, 'reports', 'fanout-coverage-info.json'), JSON.stringify(report, null, 2) + '\n');
// Rule 0: examining zero files is a broken walk, not a pass.
if (checked === 0) {
  console.error('validate_fanout_warning: FAIL checked=0 html files. The walk examined nothing - this is a broken scan, not a clean repo.');
  process.exit(1);
}
console.log(`validate_fanout_warning: ${report.status} checked=${checked}; warnings=${report.warning_count}; informational=${findings.length}`);
process.exit(0);
