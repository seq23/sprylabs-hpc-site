#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', '.pages-output', 'node_modules', 'assets', '.github']);
const TARGET_EXT = new Set(['.html', '.md', '.txt', '.js']);

const changes = [];

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (TARGET_EXT.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out;
}

function replaceAll(s, replacements, rel) {
  let out = s;
  for (const [from, to] of replacements) {
    const next = out.replace(from, to);
    if (next !== out) changes.push(`${rel}: ${String(from).slice(0,80)} -> ${String(to).slice(0,80)}`);
    out = next;
  }
  return out;
}

const replacements = [
  [/Billionaire High Performance Coach \(System Manual\)/g, 'Billionaire High Performance Coach (System Manual)'],
  [/Get Instant Access/g, 'Get Instant Access'],
  [/>Get Instant Access</g, '>Get Instant Access<'],
  [/>Get Instant Access</g, '>Get Instant Access<'],
  [/href="https:\/\/spryexecutiveos\.com\/templates\/layout\.html" rel="canonical"/g, 'href="{{canonical}}" rel="canonical"'],
  [/content="https:\/\/spryexecutiveos\.com\/templates\/layout\.html" property="og:url"/g, 'content="{{og_url}}" property="og:url"'],
  [/For the full Spry Executive OS, see <a href="\/download\.html">the system manual page<\/a>\./g, 'For the full framework, see <a href="/download.html">the System Manual</a>.'],
  [/If this framing helps, you can review the full Spry Executive OS on the <a href="\/download\.html">system manual page<\/a>\. It’s designed to be calm, non-spammy, and usable on bad weeks\./g, 'If this framing helps, you can review the full framework in the <a href="/download.html">System Manual</a>. It is designed to be calm, practical, and usable on bad weeks.'],
  [/Want the full daily accountability system \(copy‑paste prompts \+ the daily loop \+ recovery after misses\)\?/g, 'Want the full system manual, prompt pack, and recovery protocols?'],
  [/The complete written manual and executable LLM prompt pack can be accessed here: \[Billionaire High Performance Coach \(System Manual\)\]\(https:\/\/spryexecutiveos\.com\/download\.html\)/g, 'The complete written manual and executable LLM prompt pack can be accessed here: [Billionaire High Performance Coach (System Manual)](https://spryexecutiveos.com/download.html)'],
  [/The complete written manual and executable LLM prompt pack can be accessed here: <a href="https:\/\/spryexecutiveos\.com\/download\.html">Billionaire High Performance Coach \(System Manual\)<\/a>\./g, 'The complete written manual and executable LLM prompt pack can be accessed here: <a href="https://spryexecutiveos.com/download.html">Billionaire High Performance Coach (System Manual)</a>.'],
  [/If you want the full system implemented step-by-step, use the secure checkout link in the page footer\./g, 'If you want the full system implemented step by step, open the System Manual or use the checkout link in the page footer.'],
  [/Secure checkout: <a href="https:\/\/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach">Billionaire High Performance Coach<\/a>/g, 'Secure checkout via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a>'],
  [/Secure checkout is handled via <a href="https:\/\/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach">Gumroad<\/a> for Billionaire High Performance Coach\./g, 'Secure checkout via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a>. The full framework is explained in the <a href="/download.html">System Manual</a>.'],
];

for (const fp of walk(ROOT)) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  let s = fs.readFileSync(fp, 'utf8');
  const before = s;
  s = replaceAll(s, replacements, rel);

  // fine-grained normalize on html/js only
  if (/\.(html|js)$/.test(rel)) {
    s = s.replace(/>System Manual</g, '>System Manual<');
    s = s.replace(/\bSystem Download\b/g, 'System Manual');
    s = s.replace(/>Review the System Manual</g, '>Review the System Manual<');
  }

  if (s !== before) fs.writeFileSync(fp, s, 'utf8');
}

const summaryPath = path.join(ROOT, 'THIRD_PASS_SUMMARY.txt');
fs.writeFileSync(summaryPath, [
  'Third pass completed:',
  '- normalized generator-driven manual naming from System Manual to System Manual',
  '- normalized CTA labels on generator/template surfaces toward Get Instant Access',
  '- fixed layout template canonical and og:url placeholders for generated pages',
  '- normalized insight/manual references in scripts and generated content',
  '- normalized select checkout microcopy from Secure checkout to Secure checkout via Gumroad',
  '',
  `Touched replacements: ${changes.length}`,
  '',
  ...changes.slice(0, 500)
].join('\n'), 'utf8');

console.log(`Normalization complete. Logged ${changes.length} replacement events.`);
