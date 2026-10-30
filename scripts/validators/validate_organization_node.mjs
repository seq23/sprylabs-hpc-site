/**
 * Every published page declares the complete publisher Organization
 * (Search Readiness checklist item c1): name, url, logo and sameAs.
 *
 * What this refuses, in the words of the checklist: "This is how AI engines
 * decide what entity a page belongs to." On 25 Oct 2026 all 3,480 Organization
 * nodes on the site named Spry Labs and not one carried sameAs, because ten
 * generators each wrote their own partial set. The fix is one definition
 * (scripts/lib/organization_node.cjs) applied by one repair
 * (scripts/repair/complete_organization_node.cjs); this proves the result on the
 * committed tree, and proves the three ways it could quietly stop being true:
 * a page with no Organization at all, a node missing one of the four fields, and
 * a sameAs that has drifted from the one definition.
 *
 * It also refuses the dishonest version of a pass: a sameAs URL that is not one
 * the one definition declares, so nobody can make this green by inventing
 * profile links.
 *
 * Rule 0: a run that examined no pages fails.
 *
 * Run: npm run validate:organization-node
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const O = require_('../lib/organization_node.cjs');
const { listIndexablePages } = require_('../lib/site_pages.js');
const B = require_('../lib/search_snippet_bounds.cjs');

const ROOT = process.cwd();
const LABEL = '[validate:organization-node]';
const LD_RE = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const failures = [];
const fail = (m) => failures.push(m);

const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
let nodes = 0;
let withSameAs = 0;

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  let found = 0;
  for (const m of html.matchAll(LD_RE)) {
    const src = m[1].trim();
    if (!src) continue;
    let payload;
    try { payload = JSON.parse(src); } catch (e) { fail(`${rel}: JSON-LD does not parse (${e.message})`); continue; }
    O.eachNode(payload, (node) => {
      if (!O.isOrganizationNode(node)) return;
      found += 1;
      nodes += 1;
      // A node naming someone else is theirs, and is not ours to complete.
      if (!O.isOwnOrganization(node)) return;
      const missing = O.missingFields(node);
      if (missing.length) { fail(`${rel}: Organization lacks ${missing.join(', ')}`); return; }
      if ([].concat(node.sameAs ?? []).length) withSameAs += 1;
      // Not just present - EQUAL to the one definition. Three writers each had
      // their own url, logo and sameAs for this one organization, and two pages
      // drifted on every build because a page built by one and repaired by
      // another ended up with a different node than the snapshot had hashed.
      // One entity, one url, one logo, one sameAs, on every page.
      const want = O.organizationFields();
      for (const key of O.FIELD_KEYS) {
        if (JSON.stringify(node[key]) !== JSON.stringify(want[key])) {
          fail(`${rel}: Organization ${key} is ${JSON.stringify(node[key])}; config/entity.json says ${JSON.stringify(want[key])}`);
        }
      }
    });
  }
  if (!found) fail(`${rel}: no Organization node at all`);
  // One entity, one @id: a reference to a legacy Spry Labs @id is an edge to a
  // node no page declares any more.
  for (const legacy of new Set([...html.matchAll(/"@id"\s*:\s*"([^"]+#organization)"/g)].map((x) => x[1]))) {
    if (legacy !== O.ORG_ID && O.isOwnOrgId(legacy)) fail(`${rel}: references the legacy Spry Labs @id ${legacy}; config/entity.json says ${O.ORG_ID}`);
  }
}

if (!pages.length) fail('Rule 0: 0 published pages found; expected the whole published surface');
if (!nodes) fail('Rule 0: 0 Organization nodes examined');

// The logo the one definition points at has to be a file this repo actually serves.
const logoRel = O.LOGO_PATH.replace(/^\//, '');
if (!fs.existsSync(path.join(ROOT, logoRel))) fail(`the one definition's logo ${O.LOGO_PATH} is not a file in the repo`);

for (const m of failures.slice(0, 20)) console.error(`${LABEL} FAIL ${m}`);
if (failures.length > 20) console.error(`${LABEL} FAIL ... and ${failures.length - 20} more`);
if (failures.length) {
  console.error(`${LABEL} FAIL (${failures.length}) - ${pages.length} pages, ${nodes} Organization nodes`);
  process.exit(1);
}
console.log(`${LABEL} PASS - ${pages.length} pages, ${nodes} Organization nodes, ${withSameAs} equal to config/entity.json (${O.SAME_AS.length} sameAs URLs)`);
