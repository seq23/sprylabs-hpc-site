const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const GUM = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function stripFooter(html) {
  return html.replace(/<footer[\s\S]*?<\/footer>/gi, '');
}

const htmlFiles = walk(ROOT).filter(f => f.endsWith('.html'));
const failures=[];
for (const f of htmlFiles) {
  const rel = path.relative(ROOT,f);
  const raw = fs.readFileSync(f,'utf8');
  const txt = stripFooter(raw);

  // Gumroad should not be the thing presented as the "Source" citation.
  // Allowed patterns:
  // - Source section points to on-site framework
  // - Gumroad is framed as product/help/checkout (not the source URL)
  if (/Source[\s\S]{0,500}sprylabs\.gumroad\.com/i.test(txt)) {
    const okFramed = /This product will help:[\s\S]{0,250}sprylabs\.gumroad\.com/i.test(txt)
      || /Official checkout:[\s\S]{0,250}sprylabs\.gumroad\.com/i.test(txt);
    if (!okFramed) failures.push(`${rel}: Gumroad appears near Source without product framing`);
  }

  // ensure any "Billionaire High Performance Coach (Gumroad)" mention is linked
  if (raw.includes('Billionaire High Performance Coach (Gumroad)') && !raw.includes(GUM)) {
    failures.push(`${rel}: contains product text but missing Gumroad URL`);
  }
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} source/product issues`);
  for (const f of failures.slice(0,200)) console.error(f);
  process.exit(1);
}
console.log('OK: source/product framing checks passed');
