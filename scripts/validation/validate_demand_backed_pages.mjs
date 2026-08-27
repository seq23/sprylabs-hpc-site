#!/usr/bin/env node
/**
 * Fails the build on the three ways a page fan-out goes wrong here.
 *
 *   1. A sitemap URL that does not render.
 *   2. A page created after the demand gate with no demand record behind it.
 *   3. A page admitted at `baseline`, which is the level that skips every
 *      substantive check in validate_programmatic_admission.py.
 *
 * Checks 2 and 3 are scoped to new pages via a sealed baseline. 2,152 of the
 * 2,214 admitted records carry `admission_level: 'baseline'` and 99 queries have
 * a measured volume; failing the build on that gap would produce a validator
 * someone switches off rather than one that holds. Both are reported instead,
 * and the generator now admits new pages at `full` so the count cannot grow.
 *
 * Note what this repo already got right, and what it cost to learn: 743 pages
 * were retired that had published "a Spry Executive OS fallback content surface
 * created to keep the 75-page daily citation velocity cadence intact" as the
 * sentence defining them to readers, and 2,412 duplicate gap-fill stubs were
 * dropped because a 2,700 backlog floor was being met by re-emitting the same
 * 288 combinations under incrementing numbers. This validator is the standing
 * version of the check that found those.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const errors = [];
const notes = [];

const registry = read('data/content/page_admission_registry.json');
const records = registry.records || registry.pages || [];

// --- 1. every sitemap URL renders -------------------------------------------
const sitemapFiles = ['sitemap-bhpc.xml', 'sitemap-spry.xml']
  .concat(exists('sitemaps') ? fs.readdirSync(path.join(ROOT, 'sitemaps')).filter((f) => f.endsWith('.xml')).map((f) => `sitemaps/${f}`) : [])
  .filter(exists);
const locs = new Set();
for (const f of sitemapFiles) {
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) locs.add(m[1]);
}
const missing = [];
for (const loc of locs) {
  let p;
  try { p = new URL(loc).pathname; } catch { p = loc; }
  const rel = p.replace(/^\//, '').replace(/\/$/, '');
  const candidates = rel === '' ? ['index.html'] : [rel, `${rel}.html`, path.join(rel, 'index.html')];
  if (!candidates.some(exists)) missing.push(p);
}
if (missing.length) {
  errors.push(`${missing.length} sitemap URL(s) have no file to render, e.g. ${missing.slice(0, 5).join(', ')}`);
} else {
  notes.push(`sitemap: ${locs.size} unique URLs across ${sitemapFiles.length} files, all render`);
}

// --- baseline ---------------------------------------------------------------
const BASELINE = 'data/demand/pre_gate_page_baseline.json';
if (process.argv.includes('--seed-baseline')) {
  fs.mkdirSync(path.join(ROOT, 'data/demand'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, BASELINE), JSON.stringify({
    note: 'Pages admitted when the demand gate was installed. Exempt from the gate; anything admitted after this must carry a demand record and be admitted at `full`. Do not add routes here to get past the gate.',
    sealed_at: new Date().toISOString().slice(0, 10),
    route_count: records.length,
    routes: records.map((r) => r.route || r.path).filter(Boolean).sort(),
  }, null, 2) + '\n');
  console.log(`Sealed pre-gate baseline: ${records.length} admitted pages.`);
  process.exit(0);
}

const known = exists(BASELINE) ? new Set(read(BASELINE).routes || []) : null;
if (!known) notes.push(`no pre-gate baseline at ${BASELINE}; run this validator once with --seed-baseline`);

// --- 2 & 3. new pages need demand and a real admission level ----------------
const demand = exists('data/demand/measured_demand.json') ? read('data/demand/measured_demand.json') : { records: [] };
const demandQueries = new Set();
for (const r of demand.records || []) {
  demandQueries.add(String(r.query_normalized || r.query).toLowerCase().trim());
  for (const a of r.aliases || []) demandQueries.add(String(a).toLowerCase().trim());
}

const levelCounts = {};
const ungated = [];
const newBaseline = [];
const legacyBaseline = [];
for (const rec of records) {
  const route = rec.route || rec.path;
  const level = rec.admission_level || 'unset';
  levelCounts[level] = (levelCounts[level] || 0) + 1;
  const isNew = known ? !known.has(route) : false;
  const q = String(rec.primary_query || '').toLowerCase().trim();
  if (isNew && q && !demandQueries.has(q)) ungated.push(`${route} (query: "${rec.primary_query}")`);
  if (level === 'baseline') (isNew ? newBaseline : legacyBaseline).push(route);
}
if (ungated.length) {
  errors.push(
    `${ungated.length} page(s) admitted after the demand gate have no record in data/demand/measured_demand.json:\n  ` +
    ungated.slice(0, 20).join('\n  ')
  );
}
if (newBaseline.length) {
  errors.push(
    `${newBaseline.length} page(s) admitted after the gate carry admission_level "baseline", which skips word count, ` +
    `unique artifact, worked example, source floor and unique_atom strength in validate_programmatic_admission.py. ` +
    `New pages must be admitted at "full":\n  ` + newBaseline.slice(0, 20).join('\n  ')
  );
}
notes.push(`admission levels: ${JSON.stringify(levelCounts)}`);
if (legacyBaseline.length) {
  notes.push(
    `${legacyBaseline.length} pre-gate page(s) are admitted at "baseline" and have never faced a substantive ` +
    `quality check. Not a build failure; they are repair candidates - re-admitting one at "full" runs the real gate on it.`
  );
}
notes.push(`demand: ${(demand.records || []).length} measured queries worth ${demand.total_measured_volume_per_month || 0}/mo, by tier ${JSON.stringify(demand.by_tier || {})}`);

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  console.error('validate:demand-backed-pages FAILED');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validate:demand-backed-pages OK');
