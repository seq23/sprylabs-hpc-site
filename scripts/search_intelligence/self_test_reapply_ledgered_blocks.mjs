#!/usr/bin/env node
// Negative-proof self-test for scripts/search_intelligence/reapply_ledgered_blocks.mjs.
//
// The defect this pins: build:all:uncached rebuilds every manual-expansion page
// wholesale, which dropped a ledgered search-intelligence block out of
// executive-coach-cost/index.html, and VAL-SEARCH-INTELLIGENCE then failed in CI
// on a tree whose committed bytes were correct. Two things have to hold forever:
// the re-apply step must restore exactly the block the ledger claims (and must
// refuse to touch a paid-agent page), and build:all must actually run it AFTER
// the generators. Both are asserted here against a fixture tree, so this fails
// if the script is deleted, weakened, or unhooked from the build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { repairBlockHtml, repairMarker } from './lib/repair_block.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(REPO, 'scripts/search_intelligence/reapply_ledgered_blocks.mjs');
const failures = [];
const ok = (label, condition) => { console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}`); if (!condition) failures.push(label); };

const PAGE = (body) => `<!doctype html><html><body><main><h1>x</h1>${body}</main></body></html>`;
const row = (id, route, extra = {}) => ({
  repair_id: id,
  status: 'APPLIED',
  owned_route: route,
  owned_file: `${route.replace(/^\//, '').replace(/\/$/, '')}/index.html`,
  repair_type: 'snippet_alignment',
  query: 'executive coach cost',
  current_title: 'Executive Coaching Cost: Rates, Pricing Packages and Fees',
  current_description: '',
  competitor_domains: [],
  ...extra,
});

function fixture({ repairs, pages, routes = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'si-reapply-'));
  fs.mkdirSync(path.join(root, 'data/search_intelligence'), { recursive: true });
  if (repairs !== null) {
    fs.writeFileSync(path.join(root, 'data/search_intelligence/repair_ledger.json'), JSON.stringify({ schema_version: '1.1', repairs }));
  }
  fs.writeFileSync(path.join(root, 'data/content_ownership_registry.json'), JSON.stringify({ routes }));
  for (const [rel, html] of Object.entries(pages)) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), html);
  }
  return root;
}
function run(root, extra = ['--write']) {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT, '--root', root, ...extra], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}
const receipt = (root) => JSON.parse(fs.readFileSync(path.join(root, 'artifacts/validation/search-intelligence-block-reapply.json'), 'utf8'));
const statusOf = (root, id) => receipt(root).results.find((x) => x.repair_id === id)?.status;

console.log('[search:blocks:self-test] re-apply of ledgered search-intelligence blocks');

// 1. A ledgered block the rebuild dropped is restored, byte-identically, inside </main>.
{
  const r = row('repair_test_restore', '/executive-coach-cost/');
  const root = fixture({ repairs: [r], pages: { 'executive-coach-cost/index.html': PAGE('<p>rebuilt</p>') } });
  const res = run(root);
  const html = fs.readFileSync(path.join(root, 'executive-coach-cost/index.html'), 'utf8');
  ok('exits 0 on a droppable block', res.code === 0);
  ok('restores the exact ledgered block', html.includes(repairBlockHtml(r)));
  ok('places the block immediately before </main>', html.includes(`${repairBlockHtml(r)}</main>`));
  ok('receipt records REAPPLIED', statusOf(root, 'repair_test_restore') === 'REAPPLIED');
}

// 2. A block already on the page is left alone - the step is idempotent, so it
//    can run on every build without ever producing a second copy.
{
  const r = row('repair_test_present', '/executive-coach-cost/');
  const before = PAGE(`<p>built</p>${repairBlockHtml(r)}`);
  const root = fixture({ repairs: [r], pages: { 'executive-coach-cost/index.html': before } });
  const res = run(root);
  const after = fs.readFileSync(path.join(root, 'executive-coach-cost/index.html'), 'utf8');
  ok('leaves a present block byte-identical', res.code === 0 && after === before);
  ok('counts exactly one copy of the marker', after.split(repairMarker(r.repair_id)).length - 1 === 1);
  ok('receipt records PRESENT', statusOf(root, 'repair_test_present') === 'PRESENT');
}

// 3. The paid-agent execution boundary holds: a protected page is never written.
{
  const r = row('repair_test_agent', '/agent/bhpc/thing/');
  const before = PAGE('<p>agent output</p>');
  const root = fixture({
    repairs: [r],
    pages: { 'agent/bhpc/thing/index.html': before },
    routes: [{ source_file: 'agent/bhpc/thing/index.html', owner: 'paid_agent', protected: true }],
  });
  const res = run(root);
  ok('never writes a paid-agent page', res.code === 0 && fs.readFileSync(path.join(root, 'agent/bhpc/thing/index.html'), 'utf8') === before);
  ok('receipt records SKIPPED_AGENT_OWNED', statusOf(root, 'repair_test_agent') === 'SKIPPED_AGENT_OWNED');
}

// 4. A ledger row for a page that no longer exists is reported, not fatal.
{
  const root = fixture({ repairs: [row('repair_test_gone', '/retired-page/')], pages: {} });
  const res = run(root);
  ok('tolerates a retired page', res.code === 0 && statusOf(root, 'repair_test_gone') === 'SKIPPED_MISSING_PAGE');
}

// 5. A page with no anchor to carry the block fails loudly instead of exiting 0
//    having done nothing and leaving the validator to fail without a reason.
{
  const root = fixture({ repairs: [row('repair_test_anchorless', '/odd/')], pages: { 'odd/index.html': '<div>no main, no body</div>' } });
  const res = run(root);
  ok('fails on a page with no </main> or </body>', res.code !== 0 && /anchor/i.test(res.out));
}

// 6. Rule 0: an unreadable ledger means nothing to govern, never a silent pass.
{
  const root = fixture({ repairs: null, pages: {} });
  const res = run(root);
  ok('refuses to pass with no ledger', res.code !== 0 && /ledger/i.test(res.out));
}

// 7. The receipt is a function of the commit, not of the wall clock, or
//    validate:clean-rebuild-parity would fail on two fresh clones of HEAD.
{
  const r = row('repair_test_reproducible', '/executive-coach-cost/');
  const pages = { 'executive-coach-cost/index.html': PAGE('<p>rebuilt</p>') };
  const first = fixture({ repairs: [r], pages });
  run(first);
  const second = fixture({ repairs: [r], pages });
  run(second);
  const bytes = (root) => fs.readFileSync(path.join(root, 'artifacts/validation/search-intelligence-block-reapply.json'), 'utf8');
  ok('receipt bytes are identical across runs', bytes(first) === bytes(second));
}

// 8. The step is actually wired into build:all, after the generator that drops
//    the block. Without this the script could be perfect and still never run.
{
  const scripts = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts || {};
  const chain = String(scripts['build:all:uncached'] || '');
  const stepAt = chain.indexOf('repair:search-intelligence-blocks');
  const generatorAt = chain.indexOf('build:generated-content');
  ok('build:all:uncached runs repair:search-intelligence-blocks', stepAt !== -1);
  ok('it runs after the content generators', generatorAt !== -1 && stepAt > generatorAt);
  ok('the step writes (not a dry run)', /--write/.test(String(scripts['repair:search-intelligence-blocks'] || '')));
}

if (failures.length) { console.error(`[search:blocks:self-test] FAIL (${failures.length}): ${failures.join('; ')}`); process.exit(1); }
console.log('[search:blocks:self-test] OK');
