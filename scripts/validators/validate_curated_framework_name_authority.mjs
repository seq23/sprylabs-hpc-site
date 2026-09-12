#!/usr/bin/env node
// A page's named framework has ONE curation authority, and every surface that
// carries the name must agree with it.
//
// The defect this guards (Spry Content Release red on 2026-08-30, runs
// 33316711351 and 33319629000): two lists of framework names existed with no
// link between them.
//
//   data/citation/agent_page_specs.json              hand-authored, curated
//   data/citation/agent_repair_specs.generated.json  regenerated every run
//
// scripts/agent_intake/build_bhpc_agent_exact_implementation_plan.mjs built the
// generated one by writing `required_heading` - a raw search query off an
// agent-intake row - into `framework`. apply_citation_program.py loads the
// GENERATED spec after the curated one, so the query text won, and travelled:
//
//   generated spec -> data-named-framework in the HTML
//                  -> data/citation/citable_pages.json
//                  -> data/content/page_admission_registry.json
//                  -> validate:programmatic-admission  (FAIL, 7 findings)
//                  -> validate:framework-name-shape    (FAIL, 3 findings)
//
// Editing any one of those outputs was reverted by the next build. That is why
// three earlier attempts failed: each fixed an output, none fixed the link.
//
// The generator now defers to the curated spec for `framework`, `definition`
// and `h1`. This validator proves the deferral is real and still reaching every
// surface, rather than a comment over dead code.
//
// `h1` WAS NOT IN THAT LIST UNTIL 2026-09-12, and it is the same defect one
// element higher up the page. apply_citation_program.py restored `framework` and
// `definition` from the curation and left `h1` to the generated spec, so
// how-do-you-use-chatgpt-as-an-executive-coach.html - curated
// <h1>How Do You Use ChatGPT as an Executive Coach?</h1> - was rewritten by every
// build to <h1>challenge my assumptions and call out blind spots in my 30-day
// execution plan</h1>, an agent recommendation query, as the heading a reader sees
// AND as schema name/headline, which repair_schema_parity.py reads straight off the
// first h1. It also meant build:all was not a fixed point: the tree it produced
// differed from the committed one on every run, which is the
// `extraction-surface-guard: 6 governed surfaces changed` failure that took
// Validate Repo red and blocked every PR behind it.
//
// PRECEDENCE, deliberately encoded: data/content/manual_expansion_pages.json is
// merged after PRIORITY and NEW_PAGES in apply_citation_program.py, so a
// manual-expansion page legitimately outranks the curated agent spec. Those
// paths are excluded and reported, not silently skipped.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CURATED = 'data/citation/agent_page_specs.json';
const GENERATED = [
  'data/citation/agent_repair_specs.generated.json',
  'data/citation/agent_page_specs.generated.json',
  'data/citation/agent_html_report_page_specs.generated.json',
];
const MANUAL = 'data/content/manual_expansion_pages.json';
const CITABLE = 'data/citation/citable_pages.json';
const REGISTRY = 'data/content/page_admission_registry.json';

const readJson = (rel) => {
  const fp = path.join(ROOT, rel);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
};
const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unescapeAttr = (v) => String(v ?? '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const curatedPayload = readJson(CURATED);
if (!curatedPayload) {
  console.error(`[curated-framework-authority] FAIL: ${CURATED} is missing; the curation authority this guard governs does not exist.`);
  process.exit(1);
}

const curated = new Map();
for (const section of ['priority_pages', 'new_pages']) {
  for (const [p, spec] of Object.entries(curatedPayload[section] || {})) {
    if (spec && String(spec.framework || '').trim()) curated.set(p, spec);
  }
}

/**
 * The curated headings, kept separately because the framework map above requires a
 * framework: an entry that curates ONLY the heading belongs to this guard too.
 */
const curatedH1 = new Map();
for (const section of ['priority_pages', 'new_pages']) {
  for (const [p, spec] of Object.entries(curatedPayload[section] || {})) {
    if (spec && String(spec.h1 || '').trim()) curatedH1.set(p, String(spec.h1).trim());
  }
}

const generatedH1 = new Map();
for (const rel of GENERATED) {
  const payload = readJson(rel);
  if (!payload) continue;
  for (const section of ['priority_pages', 'new_pages']) {
    for (const [p, spec] of Object.entries(payload[section] || {})) {
      if (spec && String(spec.h1 || '').trim()) generatedH1.set(p, {h1: String(spec.h1).trim(), source: rel});
    }
  }
}

const manualOwned = new Set(((readJson(MANUAL) || {}).pages || []).map((p) => p && p.path).filter(Boolean));
const citable = new Map(((readJson(CITABLE) || {}).pages || []).filter((p) => p && p.path).map((p) => [p.path, p.framework]));
const registry = new Map(((readJson(REGISTRY) || {}).records || []).filter((r) => r && r.path).map((r) => [r.path, r.framework]));

const generated = new Map();
for (const rel of GENERATED) {
  const payload = readJson(rel);
  if (!payload) continue;
  for (const section of ['priority_pages', 'new_pages']) {
    for (const [p, spec] of Object.entries(payload[section] || {})) {
      if (spec && String(spec.framework || '').trim()) generated.set(p, {framework: spec.framework, source: rel});
    }
  }
}

// The same shape rules validate:framework-name-shape enforces. A curated name
// that reads like a query is not a curation; it is the defect wearing a
// different hat.
const shapeViolations = (name) => {
  const out = [];
  const v = String(name || '').trim();
  if (!v) return ['empty'];
  if (v === v.toLowerCase()) out.push('entirely lowercase, which is how a raw search query reads');
  if (v.split(/\s+/).length > 12) out.push(`${v.split(/\s+/).length} words; a named method is not a sentence`);
  if (v.endsWith('?')) out.push('ends in a question mark, so it is a question and not a name');
  return out;
};

const errors = [];
const excluded = [];
let inspected = 0;
let generatedOverlap = 0;
let surfaceChecks = 0;

for (const [p, spec] of curated) {
  if (manualOwned.has(p)) { excluded.push(p); continue; }
  inspected += 1;
  const want = spec.framework;

  const shape = shapeViolations(want);
  if (shape.length) errors.push(`${p}: the CURATED name ${JSON.stringify(want)} is itself query-shaped - ${shape.join('; ')}`);

  const gen = generated.get(p);
  if (gen) {
    generatedOverlap += 1;
    if (norm(gen.framework) !== norm(want)) {
      errors.push(`${p}: ${gen.source} carries ${JSON.stringify(gen.framework)} but the curated authority says ${JSON.stringify(want)}. The generator is fabricating a name instead of deferring - this is the exact regression that took Spry Content Release red.`);
    }
  }

  for (const [label, actual] of [['citable_pages.json', citable.get(p)], ['page_admission_registry.json', registry.get(p)]]) {
    if (actual === undefined) continue;
    surfaceChecks += 1;
    if (norm(actual) !== norm(want)) errors.push(`${p}: ${label} carries ${JSON.stringify(actual)} but the curated authority says ${JSON.stringify(want)}.`);
  }

  const fp = path.join(ROOT, p);
  if (fs.existsSync(fp)) {
    const m = fs.readFileSync(fp, 'utf8').match(/data-named-framework="([^"]*)"/);
    if (m) {
      surfaceChecks += 1;
      const actual = unescapeAttr(m[1]);
      if (norm(actual) !== norm(want)) errors.push(`${p}: the page's data-named-framework is ${JSON.stringify(actual)} but the curated authority says ${JSON.stringify(want)}.`);
    }
  }
}

/*
 * THE HEADING ARM. Same authority, same failure, different element. The page's
 * FIRST h1 is what is checked because that is the one repair_schema_parity.py
 * reads into schema `name` and `headline`.
 */
let h1Inspected = 0;
let h1SurfaceChecks = 0;
for (const [p, want] of curatedH1) {
  if (manualOwned.has(p)) continue;
  h1Inspected += 1;

  const gen = generatedH1.get(p);
  if (gen && norm(gen.h1) !== norm(want)) {
    errors.push(`${p}: ${gen.source} carries the heading ${JSON.stringify(gen.h1)} but the curated authority says ${JSON.stringify(want)}. A generated heading that wins here becomes the h1 a reader sees and the schema name an answer engine quotes.`);
  }

  const fp = path.join(ROOT, p);
  if (!fs.existsSync(fp)) continue;
  const m = fs.readFileSync(fp, 'utf8').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) continue;
  h1SurfaceChecks += 1;
  const actual = unescapeAttr(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  if (norm(actual) !== norm(want)) {
    errors.push(`${p}: the page's first h1 is ${JSON.stringify(actual)} but the curated authority says ${JSON.stringify(want)}. This is the heading a reader sees, and repair_schema_parity.py copies it into schema name and headline.`);
  }
}

// Rule 0 for the heading arm, stated separately: the framework arm passing says
// nothing about whether any heading was reachable.
if (curatedH1.size > 0 && h1SurfaceChecks === 0) {
  console.error(`[curated-framework-authority] FAIL: ${curatedH1.size} curated heading(s) exist but no page HTML carried an h1 to compare, so the heading deferral is unobservable.`);
  process.exit(1);
}

// Rule 0: this guard may never pass on an empty loop. If curation is gone, or
// nothing generated overlaps it, or no surface was reachable, the link it exists
// to protect is unobservable and that is a failure, not a pass.
if (inspected === 0) {
  console.error(`[curated-framework-authority] FAIL: no curated framework name is in scope (${curated.size} curated, ${excluded.length} owned by ${MANUAL}); this check cannot reach what it governs.`);
  process.exit(1);
}
if (generatedOverlap === 0) {
  console.error(`[curated-framework-authority] FAIL: ${inspected} curated name(s) inspected but NONE appears in any generated spec. The generator no longer reads the curation authority, so the deferral this guard proves is inert.`);
  process.exit(1);
}
if (surfaceChecks === 0) {
  console.error('[curated-framework-authority] FAIL: no published surface (citable_pages, page_admission_registry, page HTML) carried any curated name; the propagation this guard proves is unobservable.');
  process.exit(1);
}

if (errors.length) {
  console.error(`[curated-framework-authority] FAIL: ${errors.length} framework name(s) disagree with their curation authority:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`[curated-framework-authority] PASS: ${inspected} curated name(s); ${generatedOverlap} honoured by a generated spec; ${surfaceChecks} published surface(s) agree; ${excluded.length} path(s) legitimately outranked by ${MANUAL}${excluded.length ? ` (${excluded.join(', ')})` : ''}`);
