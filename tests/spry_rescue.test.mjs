import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { spryRescueResponse } from '../functions/_lib/spry_rescue.js';
import { SPRY_RESCUE_REDIRECTS } from '../functions/_lib/spry_rescue_table.js';
import { consolidationResponse } from '../functions/_lib/host_consolidation.js';
const require = createRequire(import.meta.url);
const { content, HOST, keepers, isRetiredFile, isRetiredRoute } = require('../scripts/lib/spry_rescue.cjs');
const { build, render, fileFor } = require('../scripts/content/build_spry_rescue.cjs');
const ledger = JSON.parse(fs.readFileSync('data/seo/spry_rescue_redirects.json'));

test('every retired source and alias permanently redirects on both hosts without a loop', () => {
  assert.ok(ledger.redirects.length > 0);
  for (const r of ledger.redirects) {
    const forms = r.from.endsWith('/') ? [r.from,r.from+'index.html'] : [r.from,r.from+'.html'];
    for (const host of ['spryexecutiveos.com','billionairehighperformancecoach.com']) {
      for (const form of forms) {
        const request = new Request(`https://${host}${form}?ref=rescue&x=1`);
        const res = consolidationResponse(request) || spryRescueResponse(request);
        assert.equal(res?.status,301,host+form);
        assert.equal(res.headers.get('location'),r.to+'?ref=rescue&x=1');
        assert.equal(spryRescueResponse(new Request(r.to)),null,`loop: ${r.to}`);
        assert.equal(consolidationResponse(new Request(r.to)),null,`old consolidation chain: ${r.to}`);
      }
    }
  }
});

test('unknown requests, preview hosts, utility surfaces and keepers pass through', () => {
  for (const p of [...keepers,'/admin','/admin/','/agency/','/404','/assets/styles.css','/never-published-rescue-test']) {
    assert.equal(spryRescueResponse(new Request(HOST+p)),null,p);
  }
  const [p] = SPRY_RESCUE_REDIRECTS.keys();
  assert.equal(spryRescueResponse(new Request('https://preview.pages.dev'+p)),null);
  for (const p of ['/admin','/agency/','/404']) assert.equal(isRetiredRoute(p),false);
});

test('finite publishing policy catches future generated variants and preserves other hosts', () => {
  assert.equal(isRetiredFile('questions/unreviewed-topic/index.html'),true);
  assert.equal(isRetiredFile('insights/unreviewed-topic.html'),true);
  assert.equal(isRetiredFile('download.html'),false);
  assert.equal(isRetiredFile('aplayermode/index.html'),false);
  for (const r of keepers) assert.equal(isRetiredFile(fileFor(r)),false,r);
  assert.equal(JSON.parse(fs.readFileSync('search-loop.config.json')).mode,'off');
});

test('deploy output contains every keeper, omits retired HTML and advertises no retired URL', () => {
  const sitemap = fs.readFileSync('.pages-output/sitemap-spry.xml','utf8');
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
  assert.deepEqual(urls.sort(),[...keepers].map(r=>HOST+r).sort());
  for (const r of keepers) assert.ok(fs.existsSync('.pages-output/'+fileFor(r)));
  for (const r of ledger.redirects) {
    assert.ok(!fs.existsSync('.pages-output/'+fileFor(r.from)),r.from);
    assert.ok(!urls.includes(HOST+r.from));
  }
});

test('rendered FAQ and article metadata agree with the editorial data without duplicate schema', () => {
  for (const g of content.guides) {
    const html = render(g);
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    const graph = JSON.parse(html.match(/<script id="CITATION_PAGE_SCHEMA" type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
    const faqs = graph.filter(n=>n['@type']==='FAQPage');
    assert.equal(faqs.length,1);
    assert.equal(faqs[0].mainEntity.length,g.faq.length);
    assert.equal((html.match(/<h3>/g)||[]).length,g.faq.length);
    const article = graph.find(n=>n['@type']==='Article');
    const org = graph.find(n=>n['@type']==='Organization');
    assert.equal(article.author['@id'],org['@id']);
    assert.equal(article.dateModified,g.updated);
    assert.equal(graph.find(n=>n['@type']==='WebPage').url,HOST+g.route);
    const cta = new URL(html.match(/href="(https:\/\/billionairehighperformancecoach.com\/download\?[^\"]+)"/)[1].replaceAll('&amp;','&'));
    assert.equal(cta.searchParams.get('page_kind'),'guide');
    assert.equal(cta.searchParams.get('slug'),g.id);
  }
});

test('rebuilding the rescue is idempotent and cannot inflate its redirect or discovery ledgers', () => {
  const files = ['data/seo/spry_rescue_redirects.json','functions/_lib/spry_rescue_table.js','data/citation/citable_pages.json','sitemap-spry.xml','llms.txt','llms-full.txt',...keepers].map(f=>f.startsWith('/')?fileFor(f):f);
  build();
  const before = files.map(f=>fs.readFileSync(f,'utf8'));
  build();
  assert.deepEqual(files.map(f=>fs.readFileSync(f,'utf8')),before);
});

// A slash alias may already be a kept route on the sibling host.
test('retired directory aliases preserve the existing BHPC destination', () => {
  assert.equal(spryRescueResponse(new Request('https://billionairehighperformancecoach.com/ai-executive-coach')),null);
  assert.equal(spryRescueResponse(new Request('https://spryexecutiveos.com/ai-executive-coach')),null);
});
