/**
 * The Spry Labs entity graph is what config/entity.json says it is.
 *
 * Authority audit, 30 Oct 2026: the three Spry sites listed one of their own
 * hosts (spryexecutiveos.com) as a sameAs profile, listed the founder's personal
 * site - whose Person works for a West Peek company, tying Spry Labs to West Peek
 * in the knowledge graph - and declared Spry Labs under four different @ids, so
 * nothing could point parentOrganization at one entity. config/entity.json is now
 * the one definition and /spry-labs is the entity home every side business
 * points at. This proves:
 *
 *   1. entity.json itself: an @id on the entity home, a name, logo and
 *      description; every sameAs absolute https, never one of this repo's own
 *      hosts (self-reference), never a forbidden host (the founder's personal
 *      site, anything West Peek), never also pending; every site entity's
 *      parentOrganization is the Spry Labs @id.
 *   2. The entity home (spry-labs.html): its Organization node carries exactly
 *      that @id, description and sameAs, its brands are exactly this repo's
 *      sites and its subOrganizations exactly the members, and the visible page
 *      links every member (the graph claims nothing the reader cannot see).
 *   3. aplayermode.com (aplayermode/index.html, outside the shared sites'
 *      indexes so validate:organization-node never reads it): the same
 *      Organization node, every reference to it on the one @id, and the app's
 *      sameAs equal to its entity.
 *   4. Every published page: no JSON-LD block names a forbidden host, and no
 *      Organization node lists one of this repo's own hosts as sameAs.
 *
 * Name, url, logo, sameAs and @id equality on every page is
 * validate:organization-node's job; this does not repeat it.
 *
 * Rule 0: zero pages, zero sameAs URLs or zero members examined is a failure.
 *
 * Run: npm run validate:entity-graph
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const O = require_('../lib/organization_node.cjs');
const { listIndexablePages } = require_('../lib/site_pages.js');
const B = require_('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();
const LABEL = '[validate:entity-graph]';
const LD_RE = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
const ENTITY_HOME = 'spry-labs.html';
const APM_PAGE = 'aplayermode/index.html';
const WEST_PEEK_RE = /west\s*peek/i;

const failures = [];
const fail = (m) => failures.push(m);
const C = O.CONFIG;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const onHost = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ldNodes = (html, rel) => {
  const out = [];
  for (const m of html.matchAll(LD_RE)) {
    const src = m[1].trim();
    if (!src) continue;
    try { O.eachNode(JSON.parse(src), (n) => out.push(n)); } catch (e) { fail(`${rel}: JSON-LD does not parse (${e.message})`); }
  }
  return out;
};

// ------------------------------------------------------------ 1. entity.json
const OWN = C.own_hosts || [];
const FORBIDDEN = C.forbidden_same_as_hosts || [];
if (!OWN.length) fail('config/entity.json: own_hosts is empty; self-reference cannot be checked');
if (!FORBIDDEN.length) fail('config/entity.json: forbidden_same_as_hosts is empty; the Spry/West Peek separation cannot be checked');
for (const k of ['@id', 'name', 'url', 'description']) if (!String(C[k] ?? '').trim()) fail(`config/entity.json: ${k} is empty`);
if (!String(C['@id']).startsWith(`${C.url}#`)) fail(`config/entity.json: @id ${C['@id']} is not on the entity home ${C.url}`);
if (!C.logo?.url) fail('config/entity.json: logo.url is empty');

let sameAsChecked = 0;
function checkSameAs(owner, list, pending) {
  if (!Array.isArray(list)) { fail(`${owner}: sameAs is not a list`); return; }
  if (new Set(list).size !== list.length) fail(`${owner}: sameAs has duplicates`);
  const pendingUrls = new Set((pending || []).map((p) => p.url).filter(Boolean));
  for (const u of list) {
    sameAsChecked += 1;
    const host = hostOf(u);
    if (!/^https:\/\//.test(u) || !host) { fail(`${owner}: sameAs ${u} is not an absolute https URL`); continue; }
    if (onHost(host, OWN)) fail(`${owner}: sameAs ${u} is one of this repo's own hosts - a site is not its own external profile`);
    if (onHost(host, FORBIDDEN)) fail(`${owner}: sameAs ${u} is a forbidden host (founder's personal site or West Peek) - Spry/West Peek separation`);
    if (pendingUrls.has(u)) fail(`${owner}: ${u} is both in sameAs and in profiles_pending`);
  }
  for (const p of pending || []) {
    if (!p.platform || !p.owner_action) fail(`${owner}: a profiles_pending entry lacks platform or owner_action`);
    if (p.url && !/^https:\/\//.test(p.url)) fail(`${owner}: pending ${p.platform} url ${p.url} is not https`);
  }
}
checkSameAs('config/entity.json', C.sameAs, C.profiles_pending);
for (const h of OWN) {
  const s = C.sites?.[h];
  if (!s) { fail(`config/entity.json: no sites entry for own host ${h}`); continue; }
  if (s.parentOrganization !== C['@id']) fail(`config/entity.json sites.${h}: parentOrganization is ${s.parentOrganization}, not ${C['@id']}`);
  if (hostOf(s.url) !== h) fail(`config/entity.json sites.${h}: url ${s.url} is not on ${h}`);
  if (!s.name || !s.description) fail(`config/entity.json sites.${h}: name or description is empty`);
  checkSameAs(`config/entity.json sites.${h}`, s.sameAs, s.profiles_pending);
}
const members = C.members || [];
for (const m of members) {
  const host = hostOf(m.url);
  if (!m.name || !m.description || !host) { fail(`config/entity.json members: ${JSON.stringify(m.name)} lacks name, description or url`); continue; }
  if (onHost(host, OWN)) fail(`config/entity.json members: ${m.name} is on one of this repo's own hosts; it belongs in sites`);
  if (onHost(host, FORBIDDEN) || WEST_PEEK_RE.test(`${m.name} ${m.description}`)) fail(`config/entity.json members: ${m.name} names West Peek or a forbidden host`);
}
if (WEST_PEEK_RE.test(`${C.name} ${C.description}`)) fail('config/entity.json: the Spry Labs entity names West Peek');

// ------------------------------------------------------- 2. the entity home
const homeRel = new URL(C.url).pathname.replace(/^\//, '') + '.html';
if (homeRel !== ENTITY_HOME) fail(`config/entity.json url ${C.url} is not served by ${ENTITY_HOME}`);
const homeAbs = path.join(ROOT, ENTITY_HOME);
if (!fs.existsSync(homeAbs)) fail(`${ENTITY_HOME} does not exist`);
else {
  const html = fs.readFileSync(homeAbs, 'utf8');
  const canon = (html.match(/<link\b[^>]*href="([^"]+)"[^>]*rel="canonical"/i) || html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || [])[1];
  if (canon !== C.url) fail(`${ENTITY_HOME}: canonical is ${canon}; the entity home is ${C.url}`);
  const home = ldNodes(html, ENTITY_HOME).find((n) => O.isOrganizationNode(n) && n['@id'] === C['@id'] && n.description);
  if (!home) fail(`${ENTITY_HOME}: no Organization node with @id ${C['@id']} and a description`);
  else {
    if (home.description !== C.description) fail(`${ENTITY_HOME}: Organization description differs from config/entity.json`);
    if (!same(home.sameAs, C.sameAs)) fail(`${ENTITY_HOME}: Organization sameAs ${JSON.stringify(home.sameAs)}; config/entity.json says ${JSON.stringify(C.sameAs)}`);
    const brands = [].concat(home.brand || []).map((b) => [b.name, b.url]);
    const wantBrands = OWN.map((h) => [C.sites[h].name, C.sites[h].url]);
    if (!same(brands, wantBrands)) fail(`${ENTITY_HOME}: brand is ${JSON.stringify(brands)}; config/entity.json sites say ${JSON.stringify(wantBrands)}`);
    const subs = [].concat(home.subOrganization || []).map((b) => [b.name, b.url]);
    const wantSubs = members.map((m) => [m.name, m.url]);
    if (!same(subs, wantSubs)) fail(`${ENTITY_HOME}: subOrganization is ${JSON.stringify(subs)}; config/entity.json members say ${JSON.stringify(wantSubs)}`);
  }
  const hrefs = new Set([...html.replace(LD_RE, '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  for (const m of members) for (const u of [m.url, ...(m.sites || [])]) if (!hrefs.has(u)) fail(`${ENTITY_HOME}: the visible page does not link member ${m.name} at ${u}`);
  for (const h of hrefs) { const host = hostOf(h); if (host && onHost(host, FORBIDDEN)) fail(`${ENTITY_HOME}: links forbidden host ${h}`); }
  if (WEST_PEEK_RE.test(html)) fail(`${ENTITY_HOME}: names West Peek - Spry/West Peek separation`);
}

// ------------------------------------------------------- 3. aplayermode.com
const apmAbs = path.join(ROOT, APM_PAGE);
if (!fs.existsSync(apmAbs)) fail(`${APM_PAGE} does not exist`);
else {
  const html = fs.readFileSync(apmAbs, 'utf8');
  const nodes = ldNodes(html, APM_PAGE);
  const orgs = nodes.filter((n) => O.isOwnOrganization(n) && Object.keys(n).length > 1);
  if (orgs.length !== 1) fail(`${APM_PAGE}: expected one Spry Labs Organization node, found ${orgs.length}`);
  for (const org of orgs) for (const k of O.FIELD_KEYS) if (!same(org[k], O.organizationFields()[k])) fail(`${APM_PAGE}: Organization ${k} is ${JSON.stringify(org[k])}; config/entity.json says ${JSON.stringify(O.organizationFields()[k])}`);
  const site = C.sites?.['aplayermode.com'] || {};
  const app = nodes.find((n) => n['@id'] === site['@id']);
  if (!app) fail(`${APM_PAGE}: no node with @id ${site['@id']}`);
  else if (!same(app.sameAs || [], site.sameAs || [])) fail(`${APM_PAGE}: ${site['@id']} sameAs ${JSON.stringify(app.sameAs)}; config/entity.json says ${JSON.stringify(site.sameAs)}`);
  for (const m of html.matchAll(/"@id"\s*:\s*"([^"]+#organization)"/g)) if (m[1] !== O.ORG_ID) fail(`${APM_PAGE}: references ${m[1]}; the one Spry Labs @id is ${O.ORG_ID}`);
}

// ------------------------------------------------------ 4. published pages
const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
let blocks = 0;
const FORBIDDEN_RE = new RegExp(FORBIDDEN.map((h) => h.replace(/\./g, '\\.')).join('|'), 'i');
for (const rel of [...pages, APM_PAGE]) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const html = fs.readFileSync(abs, 'utf8');
  for (const m of html.matchAll(LD_RE)) {
    blocks += 1;
    if (FORBIDDEN.length && FORBIDDEN_RE.test(m[1])) fail(`${rel}: JSON-LD names a forbidden host (${m[1].match(FORBIDDEN_RE)[0]}) - Spry/West Peek separation`);
  }
  for (const n of ldNodes(html, rel)) {
    if (!O.isOrganizationNode(n)) continue;
    for (const u of [].concat(n.sameAs || [])) { const host = hostOf(u); if (host && onHost(host, OWN)) fail(`${rel}: Organization ${n.name} lists its own host ${u} as sameAs`); }
  }
}

if (!pages.length) fail('Rule 0: 0 published pages examined');
if (!blocks) fail('Rule 0: 0 JSON-LD blocks examined');
if (!sameAsChecked) fail('Rule 0: 0 sameAs URLs examined - the entity has no external profile at all');
if (!members.length) fail('Rule 0: 0 members - nothing points parentOrganization at the entity home');

for (const m of failures.slice(0, 25)) console.error(`${LABEL} FAIL ${m}`);
if (failures.length > 25) console.error(`${LABEL} FAIL ... and ${failures.length - 25} more`);
if (failures.length) { console.error(`${LABEL} FAIL (${failures.length})`); process.exit(1); }
console.log(`${LABEL} PASS - ${pages.length + 1} pages, ${blocks} JSON-LD blocks, ${sameAsChecked} sameAs URLs, ${OWN.length} sites, ${members.length} members, entity home ${C.url}`);
