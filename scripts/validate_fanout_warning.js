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
  const payloadMatch = html.match(/<script class="fanout-payload" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!payloadMatch) {
    warnings.push(`${rel}: missing fanout payload`);
    return;
  }
  try {
    const payload = JSON.parse(decodeEntities(payloadMatch[1]));
    if (!Array.isArray(payload.variants) || payload.variants.length < 6) warnings.push(`${rel}: weak fanout variants`);
    if (!Array.isArray(payload.intent_links) || payload.intent_links.length < 3) warnings.push(`${rel}: missing intent links`);
    if (!Array.isArray(payload.intent_buckets) || payload.intent_buckets.length < 3) warnings.push(`${rel}: missing intent buckets`);
    if (!payload.topic || payload.topic.length < 6) warnings.push(`${rel}: weak topic`);
    for (const variant of payload.variants || []) {
      const key = String(variant).toLowerCase();
      const owners = variantToOwners.get(key) || [];
      owners.push(rel);
      variantToOwners.set(key, owners);
    }
  } catch (err) {
    warnings.push(`${rel}: invalid fanout payload json`);
  }
}

walk(ROOT);



const missingManifest = path.join(ROOT, '.build', 'fanout_manifest.json');
const missingDuplicates = path.join(ROOT, '.build', 'fanout_duplicates.json');
if (!fs.existsSync(missingManifest)) warnings.push('.build/fanout_manifest.json missing');
if (!fs.existsSync(missingDuplicates)) warnings.push('.build/fanout_duplicates.json missing');

console.log(`validate_fanout_warning: checked ${checked} html files`);
if (warnings.length) {
  console.log('validate_fanout_warning: WARN');
  warnings.slice(0, 120).forEach((warning) => console.log(` - ${warning}`));
} else {
  console.log('validate_fanout_warning: OK');
}
process.exit(0);
