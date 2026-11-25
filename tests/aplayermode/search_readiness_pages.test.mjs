// Search Readiness b1, b2 and b7 for aplayermode.com (24 Nov 2026 queue): every indexable A Player
// Mode page has a 30-65 character title and one 120-160 character meta description, no two pages
// share a title, and every content route is linked within two clicks of the homepage, so the live
// checker (three clicks) can never find an orphan in the sitemap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel.replace(/^\//, ''), ROOT), 'utf8');
const decode = (s) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const { pages } = JSON.parse(read('config/aplayermode_content_pages.json'));
const routes = { '/': '/aplayermode/index.html', '/about/': '/aplayermode/about.html', ...pages };
const indexable = (html) => !/<meta name="robots" content="[^"]*noindex/i.test(html);

test('every indexable A Player Mode page has a 30-65 char title and one 120-160 char description', () => {
  const seen = new Map();
  for (const [route, file] of Object.entries(routes)) {
    const html = read(file);
    if (!indexable(html)) continue;
    const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    assert.ok(title.length >= 30 && title.length <= 65, `${route}: title is ${title.length} chars: ${title}`);
    assert.ok(!seen.has(title), `${route}: title shared with ${seen.get(title)}`);
    seen.set(title, route);
    const descs = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map((m) => decode(m[1]));
    assert.equal(descs.length, 1, `${route}: exactly one meta description`);
    assert.ok(descs[0].length >= 120 && descs[0].length <= 160, `${route}: description is ${descs[0].length} chars`);
  }
});

test('every content route is linked within two clicks of the homepage', () => {
  const links = (file) => new Set([...read(file).matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]));
  const one = links(routes['/']);
  const two = new Set(one);
  for (const r of one) if (routes[r]) for (const l of links(routes[r])) two.add(l);
  for (const [route, file] of Object.entries(pages)) {
    if (!indexable(read(file))) continue;
    assert.ok(two.has(route), `${route} is not linked from the homepage or a page it links to`);
  }
});
