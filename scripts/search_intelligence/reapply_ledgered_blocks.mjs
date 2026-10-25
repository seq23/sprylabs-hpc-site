#!/usr/bin/env node
// Put ledgered search-intelligence repair blocks back after a full page rebuild.
//
// WHY THIS STEP EXISTS
// The committed HTML of a generated page is builder output PLUS a chain of
// post-build content layers (citation program, agent blocks, health boundary,
// visible FAQ, dual-domain metadata, product offers). build:all:uncached runs
// the generators first - scripts/content/build_manual_expansion_pages.mjs
// rewrites all 66 manual-expansion pages wholesale from
// data/content/manual_expansion_pages.json - and then re-applies each of those
// layers, which is why they survive.
//
// Search-intelligence repairs were the one layer missing from that chain. The
// block is minted during the measurement cycle (npm run search:repair:apply),
// committed to the page, and recorded APPLIED in
// data/search_intelligence/repair_ledger.json. On main at f98275dfe the
// committed page carried the block and the validator passed on the checked-out
// tree, but CI validates the BUILT tree: the manual-expansion generator dropped
// repair_33aa17ad8add19d4 out of executive-coach-cost/index.html and nothing put
// it back, so VAL-SEARCH-INTELLIGENCE failed on a ledger row that was perfectly
// truthful about the committed content. Re-running the whole measurement cycle
// in a content build is the wrong cure (it mutates the ledger and depends on
// Search Console), so this step restores exactly what the ledger already claims
// and changes no ledger state at all.
//
// It never mints a new repair and never touches a page owned by a paid agent.
import fs from 'node:fs';
import path from 'node:path';
import { buildTimestamp } from '../lib/build_clock.cjs';
import { repairMarker, repairBlockHtml, insertRepairBlock } from './lib/repair_block.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const rootArg = args.indexOf('--root');
const ROOT = path.resolve(rootArg === -1 ? process.cwd() : args[rootArg + 1]);
const LEDGER = path.join(ROOT, 'data/search_intelligence/repair_ledger.json');
const OWNERSHIP = path.join(ROOT, 'data/content_ownership_registry.json');
const RECEIPT = path.join(ROOT, 'artifacts/validation/search-intelligence-block-reapply.json');

function fail(message) {
  console.error(`[repair:search-intelligence-blocks] STOP: ${message}`);
  process.exit(1);
}

// Rule 0: a step that cannot read the ledger has nothing to govern and must not
// exit 0 having done nothing.
if (!fs.existsSync(LEDGER)) fail(`repair ledger not found at ${path.relative(ROOT, LEDGER)}`);
let ledger;
try { ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (error) { fail(`repair ledger is not readable JSON: ${error.message}`); }
if (!Array.isArray(ledger.repairs)) fail('repair ledger has no repairs array');

const owners = new Map();
if (fs.existsSync(OWNERSHIP)) {
  const registry = JSON.parse(fs.readFileSync(OWNERSHIP, 'utf8'));
  for (const route of registry.routes || []) owners.set(route.source_file, route);
}

// Same mapping as scripts/search_intelligence/lib/core.mjs, resolved against
// --root so this can be exercised against a fixture tree.
function routeToFile(route) {
  let r = String(route || '/').replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  if (r === '/' || !r) return 'index.html';
  if (r.endsWith('/')) return `${r.slice(1)}index.html`;
  return r.slice(1);
}

const results = [];
let reapplied = 0;
const unanchored = [];
for (const row of ledger.repairs) {
  if (row.status !== 'APPLIED') continue;
  const rel = routeToFile(row.owned_route || row.owned_file);
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) fail(`ledger row ${row.repair_id} resolves outside the site root`);
  if (!fs.existsSync(file)) { results.push({ repair_id: row.repair_id, file: rel, status: 'SKIPPED_MISSING_PAGE' }); continue; }
  const owner = owners.get(rel);
  if (owner?.owner === 'paid_agent' || owner?.protected === true) {
    results.push({ repair_id: row.repair_id, file: rel, status: 'SKIPPED_AGENT_OWNED' });
    continue;
  }
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes(repairMarker(row.repair_id))) { results.push({ repair_id: row.repair_id, file: rel, status: 'PRESENT' }); continue; }
  const after = insertRepairBlock(before, repairBlockHtml(row));
  if (after === before) {
    results.push({ repair_id: row.repair_id, file: rel, status: 'FAILED_NO_ANCHOR' });
    unanchored.push(`${row.repair_id} -> ${rel}`);
    continue;
  }
  if (write) fs.writeFileSync(file, after, 'utf8');
  reapplied += 1;
  results.push({ repair_id: row.repair_id, file: rel, status: write ? 'REAPPLIED' : 'WOULD_REAPPLY' });
}

fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
fs.writeFileSync(RECEIPT, `${JSON.stringify({
  schema_version: '1.0',
  generated_at: buildTimestamp(),
  mode: write ? 'WRITE' : 'DRY_RUN',
  applied_ledger_rows: results.length,
  reapplied,
  results,
}, null, 2)}\n`, 'utf8');

const counts = results.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
console.log(`[repair:search-intelligence-blocks] mode=${write ? 'WRITE' : 'DRY_RUN'} applied_rows=${results.length} ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
// A page with neither </main> nor </body> can never carry the block the ledger
// claims, so the validator would fail later with no explanation of why. Say it here.
if (unanchored.length) fail(`no </main> or </body> anchor to carry the block: ${unanchored.join(', ')}`);
