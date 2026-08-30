#!/usr/bin/env node
// A named framework must read like a named method, not like the search query the
// page was built from.
//
// Commit e700a92fc regenerated pages on 2026-08-29 and wrote query text into
// data-named-framework while leaving data/content/page_admission_registry.json
// holding the real names. Seven pages then failed validate_programmatic_admission
// and took Spry Content Release red. Those seven are repaired and authored.
//
// This guards the CLASS, not the instance: query text leaking into a framework
// name. It is a RATCHET, deliberately. 234 pages already carry over-long names
// and one is entirely lowercase - a real debt, but rewriting 234 published
// framework names to satisfy a new rule would be a far larger content change
// than the defect it fixes. So the existing set is recorded as a baseline and
// only NEW violations fail. The debt is printed on every run so it stays visible
// rather than becoming a silent allowance.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY = 'data/content/page_admission_registry.json';
const BASELINE = 'data/content/framework_name_shape_baseline.json';
const MAX_WORDS = 12;

const violations = (name) => {
  const out = [];
  const v = String(name || '').trim();
  if (!v) return out;
  if (v === v.toLowerCase()) out.push('entirely lowercase, which is how a raw search query reads');
  if (v.split(/\s+/).length > MAX_WORDS) out.push(`${v.split(/\s+/).length} words; a named method is not a sentence`);
  if (v.endsWith('?')) out.push('ends in a question mark, so it is a question and not a name');
  if (/[—–-]\s*(vs|versus)\s/i.test(v)) out.push('carries a comparison suffix, so it is a page title and not a name');
  return out;
};

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8'));
const inspected = (registry.records || []).filter((r) => r.admission_level === 'full' && (r.framework || '').trim());
if (inspected.length === 0) {
  console.error('[framework-name-shape] FAIL: no fully-admitted page carries a framework name; this check no longer reaches what it governs.');
  process.exit(1);
}

const current = new Map();
for (const r of inspected) {
  const v = violations(r.framework);
  if (v.length) current.set(r.path, {framework: r.framework, reasons: v});
}

const baselineExists = fs.existsSync(path.join(ROOT, BASELINE));
const baseline = baselineExists ? JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE), 'utf8')) : null;
if (!baseline) {
  fs.writeFileSync(path.join(ROOT, BASELINE), `${JSON.stringify({
    _why: 'Framework names that already read like queries when this guard was introduced. New violations fail; this set is recorded debt, never an allowance. Shrink it by authoring real names; it may never grow.',
    recorded_at: new Date().toISOString().slice(0, 10),
    count: current.size,
    paths: [...current.keys()].sort(),
  }, null, 2)}\n`);
  console.log(`[framework-name-shape] BASELINE RECORDED: ${current.size} pre-existing violation(s) of ${inspected.length} inspected. Re-run to enforce.`);
  process.exit(0);
}

const known = new Set(baseline.paths || []);
const regressions = [...current.entries()].filter(([p]) => !known.has(p));
const fixed = [...known].filter((p) => !current.has(p));

console.log(`[framework-name-shape] inspected=${inspected.length} debt=${current.size} (baseline ${baseline.count}) fixed_since_baseline=${fixed.length}`);
if (regressions.length) {
  console.error(`[framework-name-shape] FAIL: ${regressions.length} framework name(s) newly read like a query rather than a named method:`);
  for (const [p, info] of regressions) console.error(`  ${p}\n    ${JSON.stringify(info.framework)}\n    ${info.reasons.join('; ')}`);
  process.exit(1);
}
if (current.size > (baseline.count || 0)) {
  console.error(`[framework-name-shape] FAIL: the recorded debt grew from ${baseline.count} to ${current.size}; this baseline may shrink, never grow.`);
  process.exit(1);
}
console.log('[framework-name-shape] PASS: no new query-shaped framework name');
