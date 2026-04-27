const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const errors = [];

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '_ops', 'scripts', 'templates', 'docs', 'audit', '.build', 'releases'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
}

function collectTypes(node, acc = new Set()) {
  if (!node || typeof node !== 'object') return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, acc);
    return acc;
  }
  const typeValue = node['@type'];
  if (Array.isArray(typeValue)) {
    for (const item of typeValue) if (typeof item === 'string') acc.add(item);
  } else if (typeof typeValue === 'string') {
    acc.add(typeValue);
  }
  if (Array.isArray(node['@graph'])) collectTypes(node['@graph'], acc);
  for (const value of Object.values(node)) collectTypes(value, acc);
  return acc;
}

function getSchemaInfo(html) {
  const scriptRe = /<script([^>]*)type=["']application\/ld\+json["']([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  const allTypes = new Set();
  let supplementalTagged = false;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = `${m[1]} ${m[2]}`;
    if (/data-geo-semantic\s*=\s*["']true["']/i.test(attrs)) supplementalTagged = true;
    const raw = m[3].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      collectTypes(parsed, allTypes);
    } catch (_) {
      // Ignore malformed JSON-LD here.
    }
  }
  return { supplementalTagged, allTypes };
}

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes('class="fanout-payload"')) errors.push(`${rel}: hidden fanout payload still present`);
  if (html.includes('data-fanout-query-cluster="true"')) {
    if (!html.includes('Related search intents')) errors.push(`${rel}: fanout heading not upgraded`);
    if (!html.includes('Close variants')) errors.push(`${rel}: fanout variants heading missing`);
    if (!html.includes('Adjacent decision paths')) errors.push(`${rel}: fanout intent heading missing`);
  }
  const { supplementalTagged, allTypes } = getSchemaInfo(html);
  if (!supplementalTagged) errors.push(`${rel}: supplemental geo schema missing`);
  if (!allTypes.has('SoftwareApplication')) errors.push(`${rel}: SoftwareApplication schema missing`);
  if (!allTypes.has('FAQPage')) errors.push(`${rel}: FAQPage schema missing`);
}

if (errors.length) {
  console.error('validate_geo_semantics failed:');
  for (const e of errors.slice(0, 150)) console.error(' - ' + e);
  process.exit(1);
}
console.log('validate_geo_semantics: OK');

process.exit(0);
