// aplayermode.com/questions/ (27 Nov 2026, her yes: "yes turn those searches into pages"): the Search
// Loop engine writes aplayermode/questions/<slug>/index.html from search-loop.aplayermode.config.json.
// These prove the Worker serves them at the apex (a slug with no page is the apex 404, a merged page its
// 301, never an outside host), that the index and the sitemap list exactly the committed pages, that
// their canonical stays on aplayermode.com, and that the config names the same site as the sitemap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import worker, { route, originPath, CONTENT_PAGES, questionRedirectTarget } from '../../workers/aplayermode-com/src/index.js';
import { questionEntries, render, HEADER_HTML, FOOTER_HTML, OUT } from '../../scripts/aplayermode/build_questions_index.mjs';
import { questionPages, ORIGIN as SITEMAP_ORIGIN } from '../../scripts/aplayermode_sitemap_lastmod.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const { canonicalUrlFor, routeFor } = require('../../scripts/lib/dual_domain_policy.cjs');
const cfg = JSON.parse(read('search-loop.aplayermode.config.json'));

test('/questions/ and /questions/<slug>/ are served from aplayermode/questions/; other forms 301 or 404', () => {
  assert.deepEqual(route('/questions/'), { kind: 'asset', upstream: '/aplayermode/questions/index.html', content: true, missing: 'notfound' });
  assert.deepEqual(route('/questions/ai-planner-app/'), { kind: 'asset', upstream: '/aplayermode/questions/ai-planner-app/index.html', content: true, missing: 'notfound' });
  for (const p of ['/questions', '/questions/index.html']) assert.deepEqual(route(p), { kind: 'redirect', location: '/questions/', keepQuery: true }, p);
  for (const p of ['/questions/ai-planner-app', '/questions/ai-planner-app/index.html']) assert.deepEqual(route(p), { kind: 'redirect', location: '/questions/ai-planner-app/', keepQuery: true }, p);
  for (const p of ['/questions/AI-Planner/', '/questions/a/b/', '/questions/../admin/', '/questions/-x/', '/questions/x--/']) assert.equal(route(p).kind, 'notfound', p);
  // The hand-built page keeps its committed file.
  assert.deepEqual(route('/questions/what-does-a-chief-of-staff-do/'), { kind: 'asset', upstream: CONTENT_PAGES['/questions/what-does-a-chief-of-staff-do/'], content: true });
});

test('a directory page is fetched at its slash URL; .html files keep their extensionless URL', () => {
  assert.equal(originPath('/aplayermode/questions/ai-planner-app/index.html'), '/aplayermode/questions/ai-planner-app/');
  assert.equal(originPath('/aplayermode/questions/index.html'), '/aplayermode/questions/');
  assert.equal(originPath('/aplayermode/about.html'), '/aplayermode/about');
  assert.equal(originPath('/aplayermode/'), '/aplayermode/');
});

// The Worker against a stand-in Pages origin.
async function serve(pathname, origin) {
  const realFetch = globalThis.fetch; const realCaches = globalThis.caches;
  const asked = [];
  globalThis.caches = undefined;
  globalThis.fetch = async (input) => { const u = new URL(typeof input === 'string' ? input : input.url); asked.push(u.pathname); return origin(u.pathname); };
  try {
    const res = await worker.fetch(new Request(`https://aplayermode.com${pathname}`), {}, {});
    return { status: res.status, location: res.headers.get('location'), body: await res.text(), asked };
  } finally { globalThis.fetch = realFetch; globalThis.caches = realCaches; }
}
const APEX_404 = '<html><title>Page not found | A Player Mode</title></html>';
const PAGES_404 = '<html><title>Not found | Billionaire High Performance Coach</title></html>';
const html = (s, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html' } });
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });

test('a committed question page is answered 200 from the origin', async () => {
  const r = await serve('/questions/ai-planner-app/', (p) => (p === '/aplayermode/questions/ai-planner-app/' ? html('<h1>AI planner app</h1>') : p === '/build-id.txt' ? html('', 404) : html(PAGES_404, 404)));
  assert.equal(r.status, 200);
  assert.match(r.body, /AI planner app/);
});

test('a slug with no page is the apex 404, never the Pages project\'s own 404 page', async () => {
  const r = await serve('/questions/no-such-question/', (p) => (p === '/aplayermode/404' ? html(APEX_404) : html(PAGES_404, 404)));
  assert.equal(r.status, 404);
  assert.match(r.body, /A Player Mode/);
  assert.doesNotMatch(r.body, /Billionaire High Performance Coach/);
});

test('a page the engine merged answers 301 to its target on the apex', async () => {
  const redirects = { redirects: [{ source: '/questions/old-question/', target: '/questions/new-question/' }] };
  const r = await serve('/questions/old-question/', (p) => (p === '/aplayermode/questions/redirects.json' ? json(redirects) : p === '/aplayermode/404' ? html(APEX_404) : html(PAGES_404, 404)));
  assert.equal(r.status, 301);
  assert.equal(r.location, 'https://aplayermode.com/questions/new-question/');
});

test('a redirect list that cannot be read, or names another host, is a 404, never a redirect', async () => {
  for (const origin of [
    (p) => (p === '/aplayermode/questions/redirects.json' ? html('oops', 500) : p === '/aplayermode/404' ? html(APEX_404) : html(PAGES_404, 404)),
    (p) => { if (p === '/aplayermode/questions/redirects.json') throw new Error('network down'); return p === '/aplayermode/404' ? html(APEX_404) : html(PAGES_404, 404); },
    (p) => (p === '/aplayermode/questions/redirects.json' ? new Response('not json', { status: 200 }) : p === '/aplayermode/404' ? html(APEX_404) : html(PAGES_404, 404)),
  ]) {
    const r = await serve('/questions/old-question/', origin);
    assert.equal(r.status, 404);
  }
  for (const target of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', '', 'questions/x/', '/questions/old-question/']) {
    assert.equal(questionRedirectTarget({ redirects: [{ source: '/questions/old-question/', target }] }, '/questions/old-question/'), null, target);
  }
  assert.equal(questionRedirectTarget(null, '/questions/x/'), null);
  assert.equal(questionRedirectTarget({ redirects: [{ source: '/questions/x/', target: '/about/' }] }, '/questions/x/'), '/about/');
});

test('the committed /questions/ index is current and lists every question page', () => {
  assert.equal(read(OUT), render(questionEntries(ROOT)), `${OUT} is stale: run node scripts/aplayermode/build_questions_index.mjs`);
  const entries = questionEntries(ROOT);
  assert.ok(entries.some((e) => e.route === '/questions/what-does-a-chief-of-staff-do/'), 'the hand-built question page is listed');
  for (const e of entries) assert.ok(read(OUT).includes(`href="${e.route}"`), e.route);
});

function fakeSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apm-q-'));
  for (const f of Object.values(CONTENT_PAGES).filter((f) => f.includes('what-does'))) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); }
  const page = (slug, h1, robots = 'index,follow') => { fs.mkdirSync(path.join(dir, 'aplayermode/questions', slug), { recursive: true }); fs.writeFileSync(path.join(dir, 'aplayermode/questions', slug, 'index.html'), `<html><head><meta content="${robots}" name="robots"/></head><body><h1>${h1}</h1></body></html>`); };
  fs.mkdirSync(path.join(dir, 'aplayermode/questions'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'aplayermode/questions/index.html'), 'index');
  return { dir, page };
}

test('an engine page joins the index and the sitemap; a page the Worker would not route never does', () => {
  const { dir, page } = fakeSite();
  page('ai-planner-app', 'Is there an AI planner app that plans your whole day?');
  page('Bad_Slug', 'Bad slug');
  page('hidden-page', 'Hidden', 'noindex,follow');
  fs.mkdirSync(path.join(dir, 'aplayermode/questions/empty-dir'));
  const entries = questionEntries(dir);
  assert.deepEqual(entries.map((e) => e.route), ['/questions/what-does-a-chief-of-staff-do/', '/questions/ai-planner-app/']);
  assert.match(render(entries), /<a href="\/questions\/ai-planner-app\/">Is there an AI planner app that plans your whole day\?<\/a>/);
  const locs = questionPages(dir).map((p) => p.loc);
  assert.ok(locs.includes('https://aplayermode.com/questions/'), 'the index is in the sitemap');
  assert.ok(locs.includes('https://aplayermode.com/questions/ai-planner-app/'));
  assert.ok(!locs.some((l) => /Bad_Slug|empty-dir/.test(l)), 'only routed slugs with a page');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an engine page with no H1 stops the index instead of listing an empty link', () => {
  const { dir, page } = fakeSite();
  page('no-heading', '');
  assert.throws(() => questionEntries(dir), /has no <h1>/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('question pages keep their canonical on aplayermode.com', () => {
  const r = routeFor('aplayermode/questions/ai-planner-app/index.html');
  assert.equal(canonicalUrlFor(r), 'https://aplayermode.com/questions/ai-planner-app/');
  assert.equal(canonicalUrlFor(routeFor('aplayermode/questions/index.html')), 'https://aplayermode.com/questions/');
  assert.equal(canonicalUrlFor('/questions/x/'), 'https://billionairehighperformancecoach.com/questions/x/', 'BHPC\'s own /questions/ is unchanged');
});

test('the config names the same site as the sitemap and the index, with the shared header and footer', () => {
  assert.equal(cfg.base_url, SITEMAP_ORIGIN);
  assert.equal(cfg.site, new URL(SITEMAP_ORIGIN).host);
  assert.equal(cfg.output.dir, OUT.replace(/\/index\.html$/, ''));
  assert.equal(cfg.output.url_prefix, '/questions/');
  assert.equal(cfg.template.header_html, HEADER_HTML);
  assert.equal(cfg.template.footer_html, FOOTER_HTML);
  for (const href of ['https://app.aplayermode.com/terms', 'https://app.aplayermode.com/privacy', '/disclaimer/']) assert.ok(FOOTER_HTML.includes(`href="${href}"`), href);
  assert.ok(cfg.protected_paths.includes('aplayermode/index.html') && cfg.protected_paths.includes('aplayermode/pages'), 'the engine never edits hand-built pages');
  assert.equal(cfg.llm.routing_file, 'config/llm_routing.json');
  assert.ok(cfg.seeds.length === 5 && cfg.product.facts.length > 0);
});

test('the homepage links /questions/, so every question page is two clicks from home', () => {
  assert.ok(read('aplayermode/index.html').includes('href="/questions/"'));
});
