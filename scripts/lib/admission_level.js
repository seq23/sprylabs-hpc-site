/**
 * ONE derivation of `admission_level` for a new admission-registry record.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 *
 * `baseline` is a HISTORICAL FACT: it means the page predates the demand gate,
 * and it exempts that page from every substantive check in
 * validate_programmatic_admission.py. data/demand/pre_gate_page_baseline.json is
 * the sealed record of which routes those are.
 *
 * Two writers minted NEW records with `admission_level: 'baseline'` HARDCODED:
 *
 *   scripts/content/repair_programmatic_registry_owners.mjs
 *   scripts/citation/apply_citation_program.py
 *
 * So a page created minutes ago was admitted claiming to predate the gate, and
 * skipped the gate on that claim. On 2026-09-12 all three pages the weekly bhpc
 * artifact created - the pages this whole release exists to publish - were
 * admitted that way, and validate:authority-admission-honesty caught all three.
 *
 * The exemption has to be READ from the sealed list, never asserted by whoever
 * happens to be writing the row.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASELINE = 'data/demand/pre_gate_page_baseline.json';

/**
 * The route string to ask the seal about.
 *
 * THE RECORD'S OWN `route` IS THE QUESTION, because that is what
 * validate_authority_admission_honesty.mjs looks up:
 * `rec.route || (rec.path ? `/${rec.path}` : null)`. The seal is not
 * consistently shaped - it holds both `/ai-executive-coach` and
 * `/what-is-an-ai-executive-coach.html` - so a writer that invents its own
 * route form asks a different question than the validator and gets a different
 * answer. Same expression, same result.
 */
function routeFor(pagePath, recordRoute) {
  return recordRoute || (pagePath ? `/${pagePath}` : null);
}

/** The sealed pre-gate routes. Empty is NOT "nothing is pre-gate" - it is a fault. */
function sealedRoutes(root = process.cwd()) {
  const doc = JSON.parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'));
  const routes = Array.isArray(doc.routes) ? doc.routes : [];
  if (!routes.length) {
    throw new Error(
      `${BASELINE} lists no routes. Deriving admission_level from an empty seal would make "baseline" legal `
      + 'for every page, which is the exemption this file exists to stop anyone asserting.');
  }
  return new Set(routes);
}

/**
 * `baseline` only for a route the seal actually names; `full` for everything else.
 * A page created after the gate must be admitted at `full` and face the gate.
 */
function admissionLevelFor(pagePath, sealed, recordRoute) {
  return sealed.has(routeFor(pagePath, recordRoute)) ? 'baseline' : 'full';
}

module.exports = { admissionLevelFor, sealedRoutes, routeFor, BASELINE };
