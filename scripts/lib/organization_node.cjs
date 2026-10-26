'use strict';
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

/** The organization's canonical home. /spry-labs is a BHPC-owned route. */
const ORG_HOST = 'https://billionairehighperformancecoach.com';
const ORG_NAME = 'Spry Labs';
const ORG_URL = `${ORG_HOST}/spry-labs`;

/** assets/spry-logo.png, the logo the repo already uses, read as 420x96. */
const LOGO_PATH = '/assets/spry-logo.png';
const LOGO_WIDTH = 420;
const LOGO_HEIGHT = 96;

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
const SAME_AS = Object.freeze([
  'https://spryexecutiveos.com/',
  'https://sprylabs.gumroad.com/',
  'https://www.sequoiataylor.com',
]);

const LOGO = Object.freeze({
  '@type': 'ImageObject',
  url: `${ORG_HOST}${LOGO_PATH}`,
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
 * Complete one node in place. Returns the fields it filled in.
 * An existing value is never overwritten except a logo given as a bare string,
 * which becomes the ImageObject the rest of the tree already uses, and a name
 * that is absent.
 */
function completeOrganization(node) {
  const filled = [];
  const want = organizationFields();
  for (const key of ['name', 'url', 'logo', 'sameAs']) {
    const v = node[key];
    const absent = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (absent) { node[key] = want[key]; filled.push(key); continue; }
    if (key === 'logo' && typeof v === 'string') { node.logo = want.logo; filled.push('logo'); }
  }
  return filled;
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
