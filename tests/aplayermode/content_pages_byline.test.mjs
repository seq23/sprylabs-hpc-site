// Search Readiness c6: every A Player Mode content page shows a named author in its visible text,
// and that name matches the author in its JSON-LD (the Kindle companion shipped without one, 17 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const { pages } = JSON.parse(readFileSync(new URL('config/aplayermode_content_pages.json', ROOT), 'utf8'));
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('every content page has a visible named byline matching its schema author', () => {
  const entries = Object.entries(pages);
  assert.ok(entries.length > 0, 'config lists no content pages');
  for (const [route, file] of entries) {
    const html = readFileSync(new URL(`.${file}`, ROOT), 'utf8');
    const byline = visible(html).match(/\bBy (\p{Lu}[\p{L}.'’ -]+?) ·/u);
    assert.ok(byline, `${route}: no visible "By <Name> ·" byline`);
    const authors = [...html.matchAll(/"author":\s*\{[^}]*"name":\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(authors.length > 0, `${route}: no author in the JSON-LD`);
    assert.ok(authors.includes(byline[1].trim()), `${route}: byline "${byline[1]}" is not the schema author (${authors.join(', ')})`);
  }
});
