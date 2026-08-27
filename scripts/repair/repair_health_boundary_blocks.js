#!/usr/bin/env node
'use strict';
/**
 * Put the health boundary block on every health-adjacent page, durably.
 *
 * WHY A REPAIR AND NOT AN EDIT
 *
 * 94 health-adjacent pages carry no boundary block. Someone already tried to fix
 * this by hand and 63 of 77 blocks were erased on the next build, because
 * insights/, answers/, vs/, guides/, methods/, glossary/, use-cases/,
 * case-studies/ and agent/ are generated artifacts: build:generated-content
 * rewrites them from data every run. Only the 14 under pillars/ and the root
 * survived. No generator emits the block at all - all 42 pages that currently
 * have one got it by hand, which is why the count keeps decaying.
 *
 * The fix that holds is the one that runs last, and "last" has to be measured
 * rather than assumed. repair:dual-domain-metadata sits at step 5 of build:all
 * and its canonicals survive, because nothing after it rewrites a canonical.
 * Placing this repair beside it was not enough: build_navigation_structure and
 * build:visible-faq run afterwards and rewrite page bodies, and a build with the
 * repair at step 6 still ended with 36 pages missing the boundary and 39 missing
 * the professional-help condition. So it runs at the END of build:all, after
 * build:visible-faq, which is the last step that touches a page body.
 *
 * Being genuinely last is the whole mechanism. It is idempotent, so a rerun is
 * free, and it cannot decay: whatever a generator overwrites, this puts back in
 * the same run.
 *
 * WHAT COUNTS AS HEALTH-ADJACENT
 *
 * Deliberately the same test scripts/validation/validate_programmatic_admission.py
 * applies, so the repair and the gate cannot disagree: the record is flagged
 * health_adjacent, or the page's visible text mentions adhd, therapist, therapy,
 * burnout, brain fog, mental health or mental-health. Matching the validator's
 * own keyword list rather than inventing a second one is the point - a page this
 * script skips is a page that validator would not have asked about either.
 *
 * WHAT IT WRITES
 *
 * The block already used on the 42 pages that have one, byte-for-byte. Nothing
 * here is newly authored: the language, the 988 reference and the rel="noopener"
 * link are the repo's existing wording, and 988lifeline.org is already an
 * approved_source_domain in data/citation/health_adjacent_content_contract.json.
 * It satisfies both conditions that validator checks - the non-diagnostic
 * boundary and the professional-help condition - because it is the text those
 * checks were written against.
 *
 * It is inserted after </main> as an <aside>, matching where the existing 42
 * carry it. A page that already has one is left completely alone.
 *
 * download.html is never touched: its bytes are frozen at a known hash.
 *
 * Usage: node scripts/repair/repair_health_boundary_blocks.js [--check]
 *   --check reports what it would do and exits non-zero if anything is missing,
 *           without writing. Useful for proving the repair is idempotent.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CHECK = process.argv.includes('--check');
const REGISTRY = path.join(ROOT, 'data/content/page_admission_registry.json');
const EVIDENCE = path.join(ROOT, 'artifacts/validation/health-boundary-repair.json');

// The revenue surface is frozen at a known sha256; never rewrite it.
const PROTECTED = new Set(['download.html']);

// Same keyword list as validate_programmatic_admission.py, deliberately.
const HEALTH_TERMS = ['adhd', 'therapist', 'therapy', 'burnout', 'brain fog', 'mental health', 'mental-health'];
// Either of these satisfies the validator's boundary condition.
const BOUNDARY_TERMS = ['not a diagnosis', 'does not diagnose', 'non-clinical', 'not treatment', 'does not treat', 'educational and organizational'];
// The validator applies a SECOND health condition that is easy to miss: the page
// must also point at a person. 27 pages satisfied the boundary test and failed
// this one - they said what the page is not, and never said who to ask instead,
// which is the half that actually helps a reader. The block below satisfies both,
// so a page failing either test gets it.
const PROFESSIONAL_TERMS = ['professional', 'clinician', 'qualified', 'medical', 'mental-health', 'therapist'];

const MARKER = 'data-content-contract="health-boundary"';
const BLOCK = '<aside class="card health-boundary" data-content-contract="health-boundary">'
  + '<h2>Scope and boundaries</h2>'
  + '<p>This page is educational and organizational content about planning, attention, and execution habits. '
  + 'It is not a diagnosis, not treatment, and not a substitute for care from a qualified clinician or a licensed '
  + 'mental-health professional. Nothing on this page diagnoses, treats, or cures any condition, and no system '
  + 'described here is a replacement for professional assessment.</p>'
  + '<p>If a pattern described here is persistent, is getting worse, or is interfering with your health, work, or '
  + 'relationships, that is a reason to speak with a clinician rather than to keep adjusting a productivity system. '
  + 'If you are in crisis or thinking about harming yourself, in the United States you can call or text '
  + '<strong>988</strong> to reach the <a href="https://988lifeline.org/" rel="noopener">988 Suicide &amp; Crisis '
  + 'Lifeline</a>, which is free, confidential, and available 24/7.</p></aside>';

/** Visible text only, so a keyword inside JSON-LD or a comment does not count. */
function visibleText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const records = registry.records || [];

const changed = [];
const alreadyOk = [];
const skippedNoMain = [];
let healthPages = 0;

for (const record of records) {
  const rel = String(record.path || '').replace(/^\/+/, '');
  if (!rel || PROTECTED.has(rel)) continue;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs) || !abs.endsWith('.html')) continue;

  const html = fs.readFileSync(abs, 'utf8');
  const text = visibleText(html);
  const isHealth = Boolean(record.health_adjacent) || HEALTH_TERMS.some((t) => text.includes(t));
  if (!isHealth) continue;
  healthPages += 1;

  const hasBoundary = html.includes(MARKER) || BOUNDARY_TERMS.some((t) => text.includes(t));
  const hasProfessional = PROFESSIONAL_TERMS.some((t) => text.includes(t));
  if (hasBoundary && hasProfessional) { alreadyOk.push(rel); continue; }

  const idx = html.lastIndexOf('</main>');
  if (idx === -1) { skippedNoMain.push(rel); continue; }

  if (!CHECK) {
    const out = `${html.slice(0, idx + '</main>'.length)}\n${BLOCK}${html.slice(idx + '</main>'.length)}`;
    fs.writeFileSync(abs, out);
  }
  changed.push(rel);
}

const report = {
  schema_version: '1.0',
  repair: 'health-boundary-blocks',
  mode: CHECK ? 'check' : 'apply',
  health_adjacent_pages: healthPages,
  already_compliant: alreadyOk.length,
  repaired: changed.length,
  skipped_no_main_element: skippedNoMain.length,
  skipped_paths: skippedNoMain.slice(0, 50),
  repaired_paths: changed.slice(0, 200),
};
fs.mkdirSync(path.dirname(EVIDENCE), { recursive: true });
fs.writeFileSync(EVIDENCE, `${JSON.stringify(report, null, 2)}\n`);

console.log(`[repair:health-boundary] ${CHECK ? 'CHECK' : 'PASS'}: ${healthPages} health-adjacent page(s); `
  + `${alreadyOk.length} already compliant; ${changed.length} ${CHECK ? 'would be repaired' : 'repaired'}; `
  + `${skippedNoMain.length} skipped (no </main>)`);

if (skippedNoMain.length) {
  console.log(`  no </main> to anchor to, left for a human: ${skippedNoMain.slice(0, 5).join(', ')}`);
}
if (CHECK && changed.length) process.exit(1);
