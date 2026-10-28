// The homepage trust links (About, author, methodology) are build OUTPUT, and no
// main-writing lane can push a tree without them. Validate Repo run 40347544796
// (26 Oct 2026) went red on main because authority:scale:restore reverted
// index.html to a frozen blob that predated the hand-added links, nothing
// regenerated them, and the lane pushed without running the check.
// Run: npm run validate:homepage-trust-links
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { applyHomepageTrustLinks, requiredHomepageTrustLinks, linksRoute } from '../scripts/lib/homepage_trust_links.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const author = JSON.parse(read('data/entities/author_profile.json'));
const links = requiredHomepageTrustLinks(author);
const stripTrustLinks = (html) => links.reduce((h, l) => h.replace(new RegExp(`<a href="${l.route}/?"[^>]*>[^<]*</a>\\n?`, 'g'), ''), html);

test('the About, author and methodology pages are all defined', () => {
  assert.equal(links.length, 3);
  assert.deepEqual(links.map((l) => l.route), ['/about', author.canonical_author_page || '/author', author.methodology_url || '/citation-methodology']);
});

test('the committed homepage links every trust page', () => {
  const home = read('index.html');
  for (const l of links) assert.ok(linksRoute(home, l.route), `index.html does not link ${l.route}`);
});

test('the writer restores links stripped from the homepage, and is idempotent', () => {
  const stripped = stripTrustLinks(read('index.html'));
  for (const l of links) assert.ok(!linksRoute(stripped, l.route), `fixture still links ${l.route}`);
  const once = applyHomepageTrustLinks(stripped, links);
  assert.deepEqual(once.added, links.map((l) => l.route));
  for (const l of links) assert.ok(linksRoute(once.html, l.route), `writer did not add ${l.route}`);
  const twice = applyHomepageTrustLinks(once.html, links);
  assert.deepEqual(twice.added, []);
  assert.equal(twice.html, once.html);
});

test('the writer repairs the frozen homepage blob authority:scale:restore writes back', () => {
  const reg = JSON.parse(read('data/release/frozen_output_registry.json'));
  const rec = reg.records['/'];
  assert.ok(rec && rec.blob, 'the frozen registry has no record for /');
  const frozen = zlib.gunzipSync(fs.readFileSync(rec.blob)).toString('utf8');
  const out = applyHomepageTrustLinks(frozen, links);
  for (const l of links) assert.ok(linksRoute(out.html, l.route), `restored homepage still lacks ${l.route}`);
});

test('the writer refuses a homepage with no footer nav rather than write nothing', () => {
  assert.throws(() => applyHomepageTrustLinks('<html><body><footer></footer></body></html>', links), /HOMEPAGE_FOOTER_NAV_MISSING/);
  assert.throws(() => applyHomepageTrustLinks(read('index.html'), []), /HOMEPAGE_TRUST_LINKS_EMPTY/);
});

test('build:postprocess runs the writer, before build_404.js copies the footer', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['repair:homepage-trust-links'], 'node scripts/repair/homepage_trust_links.mjs --apply');
  const steps = scripts['build:postprocess'].split('&&').map((s) => s.trim());
  const writer = steps.indexOf('npm run repair:homepage-trust-links');
  const notFound = steps.indexOf('node scripts/build_404.js');
  assert.ok(writer >= 0, 'build:postprocess does not run repair:homepage-trust-links');
  assert.ok(notFound > writer, 'build_404.js must run after the writer so the 404 footer carries the links');
  assert.ok(scripts['build:all:uncached'].includes('npm run build:postprocess'), 'build:all no longer runs build:postprocess');
});

test('every main-writing lane validates the converged tree before it commits', () => {
  const sh = read('.github/scripts/commit_and_push_if_changed.sh');
  const fn = sh.slice(sh.indexOf('commit_generated_changes() {'));
  const converge = fn.indexOf('converge_before_commit');
  const validate = fn.search(/for pre_push_validator in [^;]*\bvalidate:citation-strategy\b[^;]*; do/);
  const stage = fn.indexOf('git add -A --');
  assert.ok(converge >= 0 && validate > converge, 'validate:citation-strategy must run after convergence');
  assert.ok(stage > validate, 'validate:citation-strategy must run before the tree is staged');
  assert.match(fn.slice(validate, stage), /if ! npm run "\$pre_push_validator"; then[\s\S]*?exit 1/);
});
