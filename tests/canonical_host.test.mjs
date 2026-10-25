// One canonical host per public domain (Search Readiness a1, 25 Oct 2026:
// https://www.billionairehighperformancecoach.com/ answered 200 instead of a
// 301). Run: npm run validate:canonical-host
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRedirect, canonicalHostResponse, CANONICAL_HOSTS } from '../functions/_lib/canonical_host.js';

const get = (url) => new Request(url);

test('every public domain has its www alias redirected to the apex', () => {
  assert.ok(CANONICAL_HOSTS.length >= 2);
  for (const apex of CANONICAL_HOSTS) {
    const res = canonicalHostResponse(get(`https://www.${apex}/start-here`));
    assert.equal(res.status, 301, `www.${apex} must 301`);
    assert.equal(res.headers.get('location'), `https://${apex}/start-here`);
  }
});

test('path, query and trailing slash survive the redirect exactly', () => {
  assert.equal(
    canonicalRedirect('https://www.billionairehighperformancecoach.com/answers/?utm_source=x&a=b%20c'),
    'https://billionairehighperformancecoach.com/answers/?utm_source=x&a=b%20c',
  );
  assert.equal(
    canonicalRedirect('https://www.spryexecutiveos.com/llms.txt'),
    'https://spryexecutiveos.com/llms.txt',
  );
});

test('the canonical hosts themselves are passed through, so there is no loop', () => {
  for (const apex of CANONICAL_HOSTS) {
    assert.equal(canonicalRedirect(`https://${apex}/`), null);
    assert.equal(canonicalHostResponse(get(`https://${apex}/`)), null);
  }
});

test('preview deployments and unknown hosts are never redirected', () => {
  for (const url of [
    'https://sprylabs-hpc-site.pages.dev/',
    'https://abc123.sprylabs-hpc-site.pages.dev/answers/',
    'https://aplayermode.com/',
    'https://www.aplayermode.com/',
    'https://www.example.com/billionairehighperformancecoach.com',
  ]) assert.equal(canonicalRedirect(url), null, url);
});

test('a www host is matched case-insensitively', () => {
  assert.equal(
    canonicalRedirect('https://WWW.BillionaireHighPerformanceCoach.com/faq'),
    'https://billionairehighperformancecoach.com/faq',
  );
});

test('the redirect is cacheable and carries no body', async () => {
  const res = canonicalHostResponse(get('https://www.spryexecutiveos.com/'));
  assert.match(res.headers.get('cache-control'), /max-age=\d+/);
  assert.equal(await res.text(), '');
});
