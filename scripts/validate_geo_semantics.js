const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const errors = [];
function walk(dir, acc=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','.git','_ops','scripts','templates','docs','audit','.build','releases'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.html')) acc.push(full);
  }
  return acc;
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
  if (!html.includes('data-geo-semantic="true"')) errors.push(`${rel}: supplemental geo schema missing`);
  if (!html.includes('SoftwareApplication')) errors.push(`${rel}: SoftwareApplication schema missing`);
  if (!html.includes('FAQPage')) errors.push(`${rel}: FAQPage schema missing`);
}
if (errors.length) {
  console.error('validate_geo_semantics failed:');
  for (const e of errors.slice(0,150)) console.error(' - ' + e);
  process.exit(1);
}
console.log('validate_geo_semantics: OK');
