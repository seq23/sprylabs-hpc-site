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
 * claimed." So sameAs holds only real external profiles that resolve now - on
 * 30 Oct 2026 that is the Gumroad storefront alone. This repo's own hosts are
 * not profiles (self-reference), and the founder's personal site was removed
 * because its Person works for a West Peek company (Spry/West Peek separation);
 * config/entity.json lists both kinds as forbidden and validate:entity-graph
 * refuses them. No press, podcast, Wikidata or
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
 * The values live in config/entity.json, NOT here: the citation program
 * (Python) writes author and publisher on every governed page too, and a
 * constant in this file is invisible to it. On 25 Oct 2026 that is exactly what
 * happened - this repair completed 2,264 pages and repair_schema_parity.py,
 * which runs later in container-prepush, rewrote 66 of them from its own dict
 * with name and logo only. Two writers of one node is the defect; one config
 * both languages read is the fix, the same shape config/site_hosts.json already
 * uses for each host's og_image.
 */
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config/entity.json'), 'utf8'));

const ORG_ID = CONFIG['@id'];
const ORG_NAME = CONFIG.name;
const ORG_URL = CONFIG.url;
const ORG_HOST = new URL(ORG_URL).origin;

const LOGO_PATH = new URL(CONFIG.logo.url).pathname;
const LOGO_WIDTH = CONFIG.logo.width;
const LOGO_HEIGHT = CONFIG.logo.height;

/**
 * The organization's real external profiles. Each one answers 200 and each one
 * is Spry Labs: nothing here is a claim about reach, press or endorsement. The
 * weekly watch (scripts/entity/entity_backlink_watch.mjs) removes a dead one and
 * promotes a pending one (the run stops red with the exact change for review).
 *
 * aplayermode.com is deliberately NOT here, though it is ours. The repo holds an
 * index-exclusion contract - config/index_exclusions.json, proven by
 * scripts/validators/validate_aplayermode_landing.mjs - that aplayermode/ and
 * amazon/ never enter the shared sites' indexes, and that validator reads the
 * guides hubs for the string. A sameAs on 2,264 pages would have walked that
 * property into every one of them, so the contract wins and the link stays off.
 */
const SAME_AS = Object.freeze([...CONFIG.sameAs]);
const ORG_DESCRIPTION = CONFIG.description;

/**
 * Every Organization @id this repo has ever written for Spry Labs: the bare host
 * (/#organization, 215 nodes and 138 references on 30 Oct 2026), /about and the
 * entity home. They are all one entity, so every one of them is rewritten to
 * ORG_ID - a reference to an @id no node declares is a dangling edge, and two
 * @ids for one organization are two entities that each earn half the citations.
 */
const OWN_HOSTS = Object.freeze([...CONFIG.own_hosts]);
const LEGACY_ORG_ID_RE = new RegExp(`^https://(?:www\\.)?(?:${OWN_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})(?:/[a-z0-9-]*)?#organization$`);
function isOwnOrgId(id) {
  return typeof id === 'string' && (id === ORG_ID || LEGACY_ORG_ID_RE.test(id));
}

for (const href of [ORG_ID, ORG_URL, CONFIG.logo.url, ...SAME_AS]) {
  if (!/^https:\/\//.test(href)) throw new Error(`config/entity.json: ${href} must be an absolute https URL`);
}

const LOGO = Object.freeze({
  '@type': 'ImageObject',
  url: CONFIG.logo.url,
  width: LOGO_WIDTH,
  height: LOGO_HEIGHT,
});

/**
 * The four fields item c1 requires, plus the one @id, in a stable key order.
 * The @id comes last so a node that already has one keeps its key position and
 * a node that lacks one gains it at the end - the same order the Python half
 * (scripts/lib/citation_page_schema.py) writes, so both serialize to one string.
 */
const FIELD_KEYS = Object.freeze(['name', 'url', 'logo', 'sameAs', '@id']);
function organizationFields() {
  return {
    name: ORG_NAME,
    url: ORG_URL,
    logo: { ...LOGO },
    sameAs: [...SAME_AS],
    '@id': ORG_ID,
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
  for (const key of FIELD_KEYS) {
    if (JSON.stringify(node[key]) === JSON.stringify(want[key])) continue;
    node[key] = want[key];
    changed.push(key);
  }
  return changed;
}

/**
 * Point every reference to a legacy Spry Labs @id at ORG_ID, in place. A
 * reference is a node holding only an @id ({"@id": ".../#organization"}): the
 * publisher of a WebSite, the brand of a Product. Returns how many it moved.
 */
function relinkOrganizationRefs(payload) {
  let moved = 0;
  eachNode(payload, (node) => {
    const keys = Object.keys(node);
    if (keys.length !== 1 || keys[0] !== '@id') return;
    if (node['@id'] !== ORG_ID && isOwnOrgId(node['@id'])) { node['@id'] = ORG_ID; moved += 1; }
  });
  return moved;
}

/**
 * A site entity of this repo that is published as its own node (A Player Mode's
 * SoftwareApplication, @id https://aplayermode.com/#app) carries exactly the
 * sameAs config/entity.json gives it, so the weekly watch's self-heal reaches
 * the page. Returns 1 when it changed the node.
 */
const SITE_BY_ID = new Map(Object.values(CONFIG.sites || {}).filter((s) => s['@id']).map((s) => [s['@id'], s]));
function completeSiteEntity(node) {
  const site = SITE_BY_ID.get(node?.['@id']);
  if (!site || Object.keys(node).length === 1) return 0;
  if (JSON.stringify(node.sameAs || []) === JSON.stringify(site.sameAs)) return 0;
  node.sameAs = [...site.sameAs];
  return 1;
}

/**
 * The Spry/West Peek separation, applied to every node of a page: no sameAs on
 * a forbidden host (the founder's personal site carries a Person whose worksFor
 * is a West Peek company), and a Person whose url is on one points at its
 * on-site author page instead. On 30 Oct 2026, 64 committed pages carried the
 * author Person with sameAs the personal site and 2 with it as url, written by
 * generators that no longer exist - so the repair, not a writer, is the fix.
 * Returns how many fields it changed.
 */
const FORBIDDEN_HOSTS = Object.freeze([...(CONFIG.forbidden_same_as_hosts || [])]);
function onForbiddenHost(u) {
  let host = '';
  try { host = new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return false; }
  return FORBIDDEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
function separateFromForbidden(node) {
  let changed = 0;
  if (Array.isArray(node.sameAs) && node.sameAs.some(onForbiddenHost)) {
    node.sameAs = node.sameAs.filter((u) => !onForbiddenHost(u));
    if (!node.sameAs.length) delete node.sameAs;
    changed += 1;
  } else if (typeof node.sameAs === 'string' && onForbiddenHost(node.sameAs)) {
    delete node.sameAs;
    changed += 1;
  }
  if ([].concat(node['@type'] || []).includes('Person') && typeof node.url === 'string' && onForbiddenHost(node.url)) {
    node.url = CONFIG.author_page;
    changed += 1;
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
  CONFIG, ORG_ID, completeSiteEntity, separateFromForbidden, onForbiddenHost, ORG_DESCRIPTION, OWN_HOSTS, FIELD_KEYS, isOwnOrgId, relinkOrganizationRefs,
  ORG_NAME, ORG_URL, ORG_HOST, LOGO, LOGO_PATH, LOGO_WIDTH, LOGO_HEIGHT, SAME_AS,
  organizationFields, organizationNode, isOrganizationNode, isOwnOrganization,
  missingFields, completeOrganization, eachNode,
};
