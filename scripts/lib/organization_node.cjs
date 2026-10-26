'use strict';
const fs = require('fs');
const path = require('path');
/**
 * One definition of the publisher Organization every published page declares.
 *
 * Search Readiness checklist item c1 wants an Organization (or subtype) with
 * name, url, logo and sameAs on every page, and says why: "This is how AI
 * engines decide what entity a page belongs to. Consistent naming across every
 * page is what makes the site citable as one thing."
 *
 * On 25 Oct 2026 the committed tree had 3,480 Organization nodes across 2,265
 * indexable pages. Every one of them named Spry Labs - and not one carried
 * sameAs. 2,404 had name+url, 721 name+url+logo, 66 name+logo and 289 the name
 * alone, because ten generators each wrote their own partial set:
 * build_insights.js, render_comparison.js, render_synthesis.js,
 * content_contract.js, phase4_page_composer.mjs, build_manual_expansion_pages.mjs,
 * generate_aplayer_phase_expansion.mjs, pipeline_lib.mjs,
 * build_navigation_structure.mjs and the citation program's repair_schema_parity.py.
 * That is the same defect shape item b6 had, and it gets the same answer: one
 * definition here, one repair that runs last, one validator.
 *
 * The truth boundary in data/entities/authority_signal_manifest.json governs
 * sameAs: "Only actually-known author, publisher, source, sameAs ... signals are
 * claimed." So sameAs holds only the organization's own verifiable web presence -
 * its other front door, its sibling property, its storefront and its founder's
 * site. Every one answered 200 on 25 Oct 2026. No press, podcast, Wikidata or
 * academic link is claimed; those are tracked as roadmap signals in that
 * manifest and stay unclaimed until they are real.
 *
 * ONE entity, so ONE url and ONE logo on both hosts. The organization's home is
 * /spry-labs, a route billionairehighperformancecoach.com owns in
 * scripts/lib/dual_domain_policy.cjs, and it keeps that address on every page of
 * both hosts. Giving each host its own Organization url is how one publisher
 * becomes two entities that each earn half the citations.
 *
 * Applied by scripts/repair/complete_organization_node.cjs, guarded by
 * scripts/validators/validate_organization_node.mjs.
 */

/**
 * The values live in config/organization.json, NOT here: the citation program
 * (Python) writes author and publisher on every governed page too, and a
 * constant in this file is invisible to it. On 25 Oct 2026 that is exactly what
 * happened - this repair completed 2,264 pages and repair_schema_parity.py,
 * which runs later in container-prepush, rewrote 66 of them from its own dict
 * with name and logo only. Two writers of one node is the defect; one config
 * both languages read is the fix, the same shape config/site_hosts.json already
 * uses for each host's og_image.
 */
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config/organization.json'), 'utf8'));

const ORG_NAME = CONFIG.name;
const ORG_URL = CONFIG.url;
const ORG_HOST = new URL(ORG_URL).origin;

const LOGO_PATH = new URL(CONFIG.logo.url).pathname;
const LOGO_WIDTH = CONFIG.logo.width;
const LOGO_HEIGHT = CONFIG.logo.height;

/**
 * The organization's own verifiable web presence. Each one answers 200 and each
 * one is Spry Labs: nothing here is a claim about reach, press or endorsement.
 *
 * aplayermode.com is deliberately NOT here, though it is ours. The repo holds an
 * index-exclusion contract - config/index_exclusions.json, proven by
 * scripts/validators/validate_aplayermode_landing.mjs - that aplayermode/ and
 * amazon/ never enter the shared sites' indexes, and that validator reads the
 * guides hubs for the string. A sameAs on 2,264 pages would have walked that
 * property into every one of them, so the contract wins and the link stays off.
 */
const SAME_AS = Object.freeze([...CONFIG.sameAs]);

for (const href of [ORG_URL, CONFIG.logo.url, ...SAME_AS]) {
  if (!/^https:\/\//.test(href)) throw new Error(`config/organization.json: ${href} must be an absolute https URL`);
}

const LOGO = Object.freeze({
  '@type': 'ImageObject',
  url: CONFIG.logo.url,
  width: LOGO_WIDTH,
  height: LOGO_HEIGHT,
});

/** The four fields item c1 requires, in a stable key order. */
function organizationFields() {
  return {
    name: ORG_NAME,
    url: ORG_URL,
    logo: { ...LOGO },
    sameAs: [...SAME_AS],
  };
}

/** The complete node, for a generator writing an Organization from scratch. */
function organizationNode(extra = {}) {
  return { '@type': 'Organization', ...organizationFields(), ...extra };
}

const ORG_TYPE_RE = /^(Organization|LocalBusiness|Corporation|NewsMediaOrganization|ProfessionalService)$/;

/** True when this JSON-LD node is an Organization-ish node. */
function isOrganizationNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return [].concat(node['@type'] || []).some((t) => ORG_TYPE_RE.test(String(t)));
}

/**
 * True when the node is OUR organization and may be completed. A node naming
 * anyone else - a competitor on a comparison page, a cited publisher - is left
 * exactly as it is: writing our sameAs onto another company's node would be a
 * false claim, which is the harm item c5 guards.
 */
function isOwnOrganization(node) {
  if (!isOrganizationNode(node)) return false;
  const name = String(node.name ?? '').trim();
  return name === '' || name.toLowerCase() === ORG_NAME.toLowerCase();
}

/** Which of the four required fields this node is missing. */
function missingFields(node) {
  return ['name', 'url', 'logo', 'sameAs'].filter((k) => {
    const v = node?.[k];
    if (v === undefined || v === null || v === '') return true;
    return Array.isArray(v) && v.length === 0;
  });
}

/**
 * Bring one node to the one definition, in place. Returns the fields it changed.
 *
 * It NORMALIZES rather than only filling gaps, and that is load-bearing. Three
 * writers in this repo each had their own idea of this node: the citation
 * program used url https://billionairehighperformancecoach.com/,
 * scripts/render/content_contract.js used https://spryexecutiveos.com/ with its
 * own one-item sameAs, and scripts/render/render_insight.js and
 * render_authority.js wrote the publisher logo as /assets/books/og/bhpc-og-black.png.
 * Filling only the gaps left all three in place, so a page built by one and
 * repaired by another ended the build with a different Organization than the
 * snapshot taken mid-chain had hashed - two pages drifted on every single build,
 * which is the non-convergence the extraction-surface guard exists to catch.
 *
 * Item c1's own reason says why normalizing is also the right answer and not
 * just the convergent one: "Consistent naming across every page is what makes
 * the site citable as one thing." One entity, one url, one logo, one sameAs.
 *
 * A node naming anyone else is never reached - see isOwnOrganization.
 */
function completeOrganization(node) {
  const changed = [];
  const want = organizationFields();
  for (const key of ['name', 'url', 'logo', 'sameAs']) {
    if (JSON.stringify(node[key]) === JSON.stringify(want[key])) continue;
    node[key] = want[key];
    changed.push(key);
  }
  return changed;
}

/** Walk every node of a parsed JSON-LD payload, deepest last. */
function eachNode(payload, visit) {
  const stack = [payload];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== 'object') continue;
    if (Array.isArray(n)) { stack.push(...n); continue; }
    visit(n);
    for (const v of Object.values(n)) if (v && typeof v === 'object') stack.push(v);
  }
}

module.exports = {
  ORG_NAME, ORG_URL, ORG_HOST, LOGO, LOGO_PATH, LOGO_WIDTH, LOGO_HEIGHT, SAME_AS,
  organizationFields, organizationNode, isOrganizationNode, isOwnOrganization,
  missingFields, completeOrganization, eachNode,
};
