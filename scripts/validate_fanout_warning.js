const fs = require('fs');
const path = require('path');
const { classifyPageFamily } = require('./fanout/shared');

const ROOT = process.cwd();
const warnings = [];
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
    if (['node_modules', '.git', '_ops', 'scripts', 'data', '.github', 'audit', '.build', 'releases', 'templates', 'docs'].includes(entry.name)) continue;
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
  if (!html.includes('data-fanout-query-cluster="true"')) warnings.push(`${rel}: missing fanout block`);
  const listGroups = html.match(/<ul class="fanout-list">([\s\S]*?)<\/ul>/gi) || [];
  if (listGroups.length < 2) {
    warnings.push(`${rel}: fanout block missing required lists`);
    return;
  }
  const firstList = listGroups[0];
  const variants = [...firstList.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, '').trim())).filter(Boolean);
  const intentLinks = [...(listGroups[1] || '').matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], label: decodeEntities(m[2].replace(/<[^>]+>/g, '').trim()) }));
  if (variants.length < 6) warnings.push(`${rel}: weak fanout variants`);
  if (intentLinks.length < 3) warnings.push(`${rel}: missing intent links`);
  const topicMatch = html.match(/data-fanout-topic="([^"]+)"/i);
  const topic = decodeEntities((topicMatch && topicMatch[1]) || '');
  if (!topic || topic.length < 6) warnings.push(`${rel}: weak topic`);
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
if (fs.existsSync(missingManifest) && fs.statSync(missingManifest).size === 0) warnings.push('.build/fanout_manifest.json empty');
if (fs.existsSync(missingDuplicates) && fs.statSync(missingDuplicates).size === 0) warnings.push('.build/fanout_duplicates.json empty');

console.log(`validate_fanout_warning: checked ${checked} html files`);
if (warnings.length) {
  console.log('validate_fanout_warning: WARN');
  warnings.slice(0, 120).forEach((warning) => console.log(` - ${warning}`));
} else {
  console.log('validate_fanout_warning: OK');
}
process.exit(0);
