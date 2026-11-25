// R-PRV-03 (risk brain): session recording (Microsoft Clarity) only where there is a form.
// Same rule as Dream Wedding (public/assets/clarity-loader.js): a page is recorded only when it
// carries a form marked data-session-recording. Legal check, 13 Nov 2026.
// This runs every A Player Mode page's own loader against a fake DOM and checks whether Clarity's
// tag is requested, so it proves behaviour, not wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const files = execFileSync('git', ['ls-files', 'aplayermode/*.html', 'aplayermode/pages/*.html'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

/** Runs the page's inline Clarity loader; returns the tag URLs it asked for. */
function clarityRequests(html, { readyState = 'loading' } = {}) {
  const loader = html.match(/<script data-clarity-loader>([\s\S]*?)<\/script>/)?.[1];
  if (!loader) return null;
  const hasMarkedForm = /<form\b[^>]*\bdata-session-recording\b/.test(html);
  const injected = [];
  const listeners = [];
  const document = {
    readyState,
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') listeners.push(fn); },
    querySelector: (sel) => (sel === 'form[data-session-recording]' && hasMarkedForm ? {} : null),
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (s) => injected.push(s.src) } }],
  };
  const window = { location: { hostname: 'www.aplayermode.com' } };
  vm.runInNewContext(loader, { window, document });
  for (const fn of listeners) fn();
  return injected;
}

test('Clarity loads only on A Player Mode pages with a form marked data-session-recording', () => {
  let withLoader = 0; let recorded = 0;
  for (const f of files) {
    const html = readFileSync(new URL(f, ROOT), 'utf8');
    const requests = clarityRequests(html);
    if (requests === null) {
      assert.doesNotMatch(html, /clarity\.ms/, `${f}: Clarity only through the gated loader`);
      continue;
    }
    withLoader += 1;
    const marked = /<form\b[^>]*\bdata-session-recording\b/.test(html);
    // Search Readiness e9 (24 Nov 2026): a page with no recorded form does not ship the loader
    // at all, so the clarity.ms tag never reaches a page where it could not run.
    assert.ok(marked, `${f}: no form marked data-session-recording, so the Clarity loader must not be on the page`);
    recorded += 1;
    assert.deepEqual(requests, ['https://www.clarity.ms/tag/yvtytxiv27'], `${f}: form page records`);
    assert.deepEqual(clarityRequests(html, { readyState: 'complete' }), ['https://www.clarity.ms/tag/yvtytxiv27'], `${f}: same answer after load`);
  }
  assert.ok(files.length >= 10, `saw the pages (${files.length})`);
  assert.equal(withLoader, 1, 'the loader ships only on the home page');
  assert.equal(recorded, 1, 'only the home page (launch-updates form) is recorded');
});

test('the one recorded form keeps typed input masked', () => {
  const html = readFileSync(new URL('aplayermode/index.html', ROOT), 'utf8');
  const form = html.match(/<form\b[^>]*\bdata-session-recording\b[^>]*>/)?.[0] ?? '';
  assert.match(form, /data-clarity-mask="true"/);
});
