#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git','.pages-output', 'node_modules','templates','data','_ops','reports','artifacts','scripts','docs','fixtures'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(file);
  }
  return out;
}
function writeJson(rel, payload) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
}
const errors = [];
const strong_warnings = [];
let scanned = 0;
let semantic = 0;
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  scanned += 1;
  if (!/<html[\s>]/i.test(html) && !/<main[\s>]/i.test(html)) errors.push(`${rel}:missing_html_or_main`);
  if (/\{\{[^}]+\}\}|<%|%>|TODO_PLACEHOLDER/i.test(html)) errors.push(`${rel}:unresolved_template_or_placeholder`);
  if (html.includes('data-bhpc-agent-semantic="true"')) {
    semantic += 1;
    if (!/data-bhpc-agent-block="direct_answer"/.test(html)) {
      strong_warnings.push(`${rel}:semantic_agent_section_without_direct_answer_block`);
    }
  }
}
const status = errors.length ? 'FAIL' : strong_warnings.length ? 'PASS_WITH_STRONG_WARNING' : 'PASS';
const report = { schema_version: '1.1', generated_at: new Date().toISOString(), status, scanned_html_files: scanned, semantic_agent_pages: semantic, errors, strong_warnings };
writeJson('artifacts/validation/bhpc-browser-structural.json', report);
if (errors.length) {
  console.error(`[validate:bhpc-browser-structural] FAIL: ${errors.length} issue(s)`);
  for (const error of errors.slice(0, 80)) console.error(` - ${error}`);
  process.exit(1);
}
if (strong_warnings.length) {
  console.warn(`[validate:bhpc-browser-structural] STRONG WARNING: ${strong_warnings.length} quality issue(s); scanned=${scanned}; semantic_pages=${semantic}`);
  for (const warning of strong_warnings.slice(0, 80)) console.warn(` - ${warning}`);
  process.exit(0);
}
console.log(`[validate:bhpc-browser-structural] PASS: scanned=${scanned}; semantic_pages=${semantic}`);
