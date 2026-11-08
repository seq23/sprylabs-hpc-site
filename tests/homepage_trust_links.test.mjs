// The live homepage links its trust pages (About, author, methodology). The
// writer and the build pipeline that re-added them were retired with the
// in-repo content engine (7 Nov 2026); the committed homepage is what ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requiredHomepageTrustLinks, linksRoute } from '../scripts/lib/homepage_trust_links.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const author = JSON.parse(read('data/entities/author_profile.json'));
const links = requiredHomepageTrustLinks(author);

test('the About, author and methodology pages are all defined', () => {
  assert.equal(links.length, 3);
  assert.deepEqual(links.map((l) => l.route), ['/about', author.canonical_author_page || '/author', author.methodology_url || '/citation-methodology']);
});

// The approved redesign (8 Nov 2026) keeps three footer links (About, Legal, Privacy & Terms):
// the homepage links /about, and /about links the author page, the methodology, Spry Labs and
// S. L. Taylor, so every trust page is one click from the homepage's About link.
test('every trust page is reachable from the homepage: directly, or through its About page', () => {
  const home = read('index.html');
  const about = read('about.html');
  assert.ok(linksRoute(home, '/about'), 'index.html does not link /about');
  const abs = (r) => [r, `https://billionairehighperformancecoach.com${r}`];
  for (const l of links) assert.ok(abs(l.route).some((r) => linksRoute(home, r) || linksRoute(about, r)), `neither index.html nor /about links ${l.route}`);
  for (const r of ['/spry-labs', '/sequoia-taylor']) assert.ok(abs(r).some((x) => linksRoute(about, x)), `/about does not link ${r}`);
});
