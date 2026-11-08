import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tagHtml, addBeacon, hostFor, PRODUCT, BEACON } from '../scripts/tracking/tag_buy_links.mjs';
const require = createRequire(import.meta.url);
const { listEveryServedPage } = require('../scripts/lib/site_pages.js');

// Gumroad records a UTM link only when utm_source, utm_medium and utm_campaign are ALL present
// (antiwork/gumroad UtmLinkTracking); it rewrites anything outside a-z 0-9 - _ to "-".
const SAFE = /^[a-z0-9\-_]{1,200}$/;
const linkRe = /href=["'](https:\/\/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach[^"']*)["']/g;

test('every BHPC buy link on every served page names the page and button, and every page loads the beacon', () => {
  let links = 0;
  for (const rel of listEveryServedPage().filter((r) => r.endsWith('.html'))) {
    const html = fs.readFileSync(rel, 'utf8');
    for (const [, href] of html.matchAll(linkRe)) {
      links += 1;
      const u = new URL(href.replace(/&amp;/g, '&'));
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) assert.match(u.searchParams.get(k) || '', SAFE, `${rel}: ${k} missing or not Gumroad-safe in ${href}`);
      assert.equal(u.searchParams.get('wanted'), 'true', `${rel}: buy link does not open checkout in ${href}`);
      assert.ok(['site', 'book', 'social', 'share'].includes(u.searchParams.get('utm_medium')), `${rel}: utm_medium outside the scheme in ${href}`);
    }
    if (/<\/body>/i.test(html)) assert.ok(html.includes(`"token": "${BEACON[hostFor(rel, html)]}"`), `${rel}: no Web Analytics beacon for its host`);
  }
  assert.ok(links > 100, `only ${links} buy links found: the scan saw nothing`);
});

test('the tagger tags an untagged link, numbers repeated buttons, keeps inbound tags and is idempotent', () => {
  const page = `<section id="pricing"><a class="btn" href="${PRODUCT}">Buy</a><a href="${PRODUCT}">Buy</a></section><a href="${PRODUCT}?utm_source=kindle&amp;utm_medium=book&amp;utm_campaign=x">Book</a></body>`;
  const out = tagHtml(page, 'amazon/task-paralysis/index.html');
  const hrefs = [...out.matchAll(linkRe)].map((m) => new URL(m[1].replace(/&amp;/g, '&')));
  assert.deepEqual(hrefs.map((u) => [u.searchParams.get('utm_source'), u.searchParams.get('utm_medium'), u.searchParams.get('utm_campaign')]),
    [['billionairehighperformancecoach', 'site', 'amazon-task-paralysis-pricing'], ['billionairehighperformancecoach', 'site', 'amazon-task-paralysis-pricing-2'], ['kindle', 'book', 'x']]);
  assert.equal(tagHtml(out, 'amazon/task-paralysis/index.html'), out);
  assert.equal(new URL([...tagHtml(page, 'aplayermode/index.html').matchAll(linkRe)][0][1].replace(/&amp;/g, '&')).searchParams.get('utm_source'), 'aplayermode');
  const b = addBeacon(out, 'aplayermode.com');
  assert.ok(b.includes(BEACON['aplayermode.com']) && addBeacon(b, 'aplayermode.com') === b);
});
