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

test('the committed homepage links every trust page', () => {
  const home = read('index.html');
  for (const l of links) assert.ok(linksRoute(home, l.route), `index.html does not link ${l.route}`);
});
