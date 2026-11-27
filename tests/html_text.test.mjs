// Guards for the CodeQL fixes of 25 Nov 2026 (sprylabs-hpc-site alerts #1-#17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { removeElements, stripTags, escapeRegExp } from '../scripts/lib/html_text.mjs';
import { PRODUCT, PRODUCT_HREF_RE } from '../scripts/tracking/tag_buy_links.mjs';
import { stripHtml } from '../scripts/search_intelligence/lib/core.mjs';
import { visibleText } from '../scripts/lib/sitemap_ledger.mjs';

test('removeElements catches every closing-tag form and nested re-forming', () => {
  for (const html of ['a<script>x</script>b', 'a<SCRIPT>x</SCRIPT >b', 'a<script>x</script foo="1">b', 'a<scr<script>z</script>ipt>x</script>b']) {
    assert.ok(!/<script\b/i.test(removeElements(html, 'script')), `${html} -> ${removeElements(html, 'script')}`);
  }
  assert.equal(removeElements('a<style>.x{}</style >b', 'style'), 'a b');
});

test('stripTags leaves no tag behind and matches a single pass on ordinary HTML', () => {
  assert.ok(!/<[^>]+>/.test(stripTags('<<b>b>Read <i>more</i>')));
  const plain = '<p>One <b>two</b> & three</p>';
  assert.equal(stripTags(plain), plain.replace(/<[^>]+>/g, ' '));
});

test('page-text helpers drop scripts written any way', () => {
  for (const fn of [stripHtml, visibleText]) {
    const out = fn('<p>Hi</p><script>evil()</script ><SCRIPT>evil()</SCRIPT>');
    assert.ok(!out.includes('evil'), `${fn.name}: ${out}`);
    assert.match(out, /Hi/);
  }
});

test('escapeRegExp escapes every metacharacter', () => {
  const host = 'a.b+c(d)';
  assert.ok(new RegExp(`^${escapeRegExp(host)}$`).test(host));
  assert.ok(!new RegExp(`^${escapeRegExp('www.example.com')}$`).test('wwwXexampleYcom'));
});

test('the buy-link pattern is PRODUCT, escaped, and nothing looser', () => {
  assert.ok(PRODUCT_HREF_RE.test(`href="${PRODUCT}"`));
  assert.ok(!PRODUCT_HREF_RE.test(`href="${PRODUCT.replace('sprylabs.gumroad', 'sprylabsXgumroad')}"`));
  assert.equal(PRODUCT_HREF_RE.source.includes(escapeRegExp(PRODUCT)), true);
});

test('every workflow declares least-privilege permissions', () => {
  const dir = new URL('../.github/workflows/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0, 'examined 0 workflows');
  const missing = files.filter((f) => !/^\s*permissions:/m.test(readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(missing, []);
});
