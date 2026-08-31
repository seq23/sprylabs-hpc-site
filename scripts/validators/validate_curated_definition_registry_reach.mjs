#!/usr/bin/env node
// A curated DEFINITION must reach data/citation/citable_pages.json without a build.
//
// The defect this guards (Daily Citation Intelligence red on 2026-08-31, run
// 33343698923, the first run after the framework-name authority fix merged):
//
//   insights/a-simple-knowledge-system-capture-distill-use.html
//     page  <strong>  "The Capture-Distill-Use Knowledge Framework is a
//                      three-stage system for turning raw information into
//                      reusable decisions, notes, and actions."
//     registry         "A simple knowledge system: capture -> distill -> use
//                      - Spry Executive OS vs productivity apps is addressed
//                      with a direct answer, ..."
//   -> validate:citation-contract: "visible definition/registry drift"
//
// data/citation/agent_page_specs.json is the curated authority for `framework`
// and `definition`. apply_citation_program.py restores both from it, so the
// curated definition reached the published HTML. But that script only runs
// inside build:postprocess, and repair_citation_registry_parity.py - the one
// repair that maintains citable_pages.json - read ONLY
// data/content/manual_expansion_pages.json. So the curated definition had no
// path into the registry outside a full build.
//
// Validate Repo could never catch it: build:all regenerates the registry, so
// the page and the registry always agree there. Only a lane that does NOT
// build - Daily Citation Intelligence - reads the committed drift, which is
// why the repo went green on the PR and red on the daily lane twenty minutes
// later. This guard is deliberately a no-build check for that reason.
//
// PRECEDENCE, deliberately encoded and identical to apply_citation_program.py:
// data/content/manual_expansion_pages.json is merged last and legitimately
// outranks the curated spec. Those paths are excluded BY NAME in the PASS
// line, never silently skipped.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CURATED = 'data/citation/agent_page_specs.json';
const MANUAL = 'data/content/manual_expansion_pages.json';
const CITABLE = 'data/citation/citable_pages.json';

const readJson = (rel) => {
  const fp = path.join(ROOT, rel);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
};
const tidy = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

const fail = (msg, extra = []) => {
  console.error(`[curated-definition-registry-reach] FAIL: ${msg}`);
  for (const line of extra) console.error(`  ${line}`);
  process.exit(1);
};

const curatedPayload = readJson(CURATED);
if (!curatedPayload) {
  fail(`${CURATED} is missing; the curation authority this guard governs does not exist.`);
}

// Every curated page that actually declares a definition.
const curated = new Map();
for (const section of ['priority_pages', 'new_pages']) {
  const block = curatedPayload[section];
  if (!block || typeof block !== 'object') continue;
  for (const [p, spec] of Object.entries(block)) {
    if (spec && typeof spec === 'object' && tidy(spec.definition)) {
      curated.set(p, { section, definition: tidy(spec.definition), framework: tidy(spec.framework) });
    }
  }
}

// Rule 0, first way to be inert: nothing curated carries a definition, so the
// reach this guard proves has nothing to travel.
if (curated.size === 0) {
  fail(
    `no curated definition is in scope. ${CURATED} declares no page with a "definition", so this guard cannot reach what it governs.`,
  );
}

const manualPaths = new Set(
  ((readJson(MANUAL) || {}).pages || []).map((p) => p && p.path).filter(Boolean),
);

const citablePayload = readJson(CITABLE);
if (!citablePayload) fail(`${CITABLE} is missing; the registry this guard checks does not exist.`);
const byPath = new Map();
for (const rec of citablePayload.pages || []) {
  if (rec && rec.path && !byPath.has(rec.path)) byPath.set(rec.path, rec);
}

// Rule 0, second way to be inert: the registry holds no record for any curated
// page, so a comparison over zero rows would "pass" while proving nothing.
const reachable = [...curated.keys()].filter((p) => !manualPaths.has(p) && byPath.has(p));
if (reachable.length === 0) {
  fail(
    `${curated.size} curated definition(s) inspected but NONE has a record in ${CITABLE}. ` +
      `The registry no longer carries the pages the curation authority describes, so the reach this guard proves is inert.`,
  );
}

// WHAT IS ASSERTED, and why it is not string equality.
//
// Later repairs in repair:citation-contract-surfaces legitimately re-present a
// definition - prefixing the framework name, or trimming it to a lead sentence -
// and they move the page and the registry together, so the two still agree.
// Demanding the curated string verbatim would fail four pages that are not
// drifting at all, which is trading one validator's pass for another's failure.
//
// The defect was narrower and is what is asserted here: the registry kept a
// definition derived from the OLD query-shaped name and never mentioned the
// curated framework at all. So the registry definition must NAME the curated
// framework. On the page that took the lane red it did not:
//
//   curated framework  "Capture-Distill-Use Knowledge Framework"
//   registry           "A simple knowledge system: capture -> distill -> use
//                       - Spry Executive OS vs productivity apps is addressed
//                       with a direct answer, ..."     <- names no framework
//
// `framework` is still asserted exactly, because that field has one authority
// and no repair is entitled to re-present it.
const errors = [];
const outranked = [];
let agreeing = 0;
for (const [p, spec] of curated) {
  if (manualPaths.has(p)) { outranked.push(p); continue; }
  const rec = byPath.get(p);
  if (!rec) continue;
  const got = tidy(rec.definition);
  const name = spec.framework || '';
  if (name && !got.toLowerCase().includes(name.toLowerCase())) {
    errors.push(
      `${p}: ${CITABLE} carries "${got || '(none)'}", which never names the curated framework ` +
        `"${name}". The curated definition has not reached the registry, so the no-build daily lane ` +
        `reads this as visible definition/registry drift. repair_citation_registry_parity.py must ` +
        `sync ${CURATED}.`,
    );
    continue;
  }
  if (name && tidy(rec.framework) !== name) {
    errors.push(
      `${p}: ${CITABLE} carries framework "${tidy(rec.framework) || '(none)'}" but the curated authority says "${name}".`,
    );
    continue;
  }
  agreeing++;
}

if (errors.length) {
  fail(`${errors.length} curated definition(s) have not reached ${CITABLE}:`, errors);
}

console.log(
  `[curated-definition-registry-reach] PASS: ${curated.size} curated definition(s); ` +
    `${agreeing} named by ${CITABLE}; ` +
    `${outranked.length} path(s) legitimately outranked by ${MANUAL}${outranked.length ? `: ${outranked.join(', ')}` : ''}`,
);
