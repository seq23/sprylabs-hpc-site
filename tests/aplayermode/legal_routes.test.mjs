// aplayermode.com/terms, /privacy and /disclaimer were 404s (legal check, 13 Nov 2026).
// Terms and Privacy keep ONE source (the app, app.aplayermode.com): the apex 301s there.
// The Disclaimer is a content page served from a committed file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { route, CONTENT_PAGES } from '../../workers/aplayermode-com/src/index.js';

test('/terms and /privacy, slash or not, 301 to the one copy on app.aplayermode.com', () => {
  for (const [path, target] of [['/terms', 'https://app.aplayermode.com/terms'], ['/privacy', 'https://app.aplayermode.com/privacy'], ['/privacy/consumer-health', 'https://app.aplayermode.com/privacy/consumer-health']]) {
    for (const p of [path, `${path}/`, `${path}/index.html`]) assert.deepEqual(route(p), { kind: 'redirect', location: target, keepQuery: false }, p);
  }
  assert.equal(route('/terms-of-sale').kind, 'notfound', 'only the exact legal paths redirect');
});

test('/disclaimer/ is served from a committed page; /disclaimer 301s to it', () => {
  const file = CONTENT_PAGES['/disclaimer/'];
  assert.ok(file && existsSync(new URL(`../..${file}`, import.meta.url)), 'committed');
  assert.deepEqual(route('/disclaimer/'), { kind: 'asset', upstream: file, content: true });
  assert.deepEqual(route('/disclaimer'), { kind: 'redirect', location: '/disclaimer/', keepQuery: true });
});

test('every A Player Mode page footer links Terms, Privacy and the Disclaimer', () => {
  const files = ['/aplayermode/index.html', '/aplayermode/about.html', '/aplayermode/404.html', ...Object.values(CONTENT_PAGES)];
  assert.ok(files.length >= 17, 'saw the pages');
  for (const f of files) {
    const html = readFileSync(new URL(`../..${f}`, import.meta.url), 'utf8');
    const footer = html.slice(html.lastIndexOf('<footer'), html.lastIndexOf('</footer>'));
    for (const href of ['https://app.aplayermode.com/terms', 'https://app.aplayermode.com/privacy', '/disclaimer/']) assert.ok(footer.includes(`href="${href}"`), `${f} footer links ${href}`);
  }
});
