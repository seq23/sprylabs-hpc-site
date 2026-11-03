import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  execFileSync(process.execPath, ['scripts/assemble_pages_output.js'], { stdio: 'pipe' });
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
    const cta = new URL(html.match(/href="(https:\/\/billionairehighperformancecoach.com\/download\.html\?[^\"]+)"/)[1].replaceAll('&amp;','&'));
    assert.equal(cta.pathname,'/download.html');
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

test('historical GSC winners remain published, including established sibling ownership', () => {
  const selection = JSON.parse(fs.readFileSync('data/seo/spry_rescue_selection.json'));
  assert.ok(selection.measured_routes.length > 0, 'no measured routes examined');
  assert.deepEqual(selection.kept.map(p => p.route).sort(), [...keepers].sort());
  // Read the measurements, not just the editorial decision ledger. Discarded
  // provider rows, historical losses and search-loop GSC signals also count.
  const observed = new Set();
  function collect(value) {
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (!value || typeof value !== 'object') return;
    const positive = Object.entries(value).some(([key, count]) =>
      (/impression/i.test(key) || ['prev', 'cur', 'delta'].includes(key)) && typeof count === 'number' && count > 0);
    if (positive) for (const url of Object.values(value)) {
      if (typeof url === 'string' && url.startsWith(HOST + '/')) observed.add(new URL(url).pathname.replace(/\.html$/, ''));
    }
    Object.values(value).forEach(collect);
  }
  // Discover observations independently: a newly committed GSC export must not
  // disappear merely because the editorial ledger omitted its source file.
  function jsonFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const file = dir + '/' + entry.name;
      return entry.isDirectory() ? jsonFiles(file) : file.endsWith('.json') ? [file] : [];
    });
  }
  const sources = new Set(jsonFiles('data'));
  assert.ok(sources.size > 0, 'no GSC evidence files examined');
  for (const file of sources) collect(JSON.parse(fs.readFileSync(file)));
  assert.ok(observed.size > 0, 'GSC files contained zero measured pages');
  const recorded = new Set(selection.measured_routes.map(row => row.route));
  for (const route of observed) assert.ok(recorded.has(route), `${route}: observation omitted from selection`);

  for (const row of selection.measured_routes) {
    assert.ok(row.sources.length > 0, `${row.route}: no evidence`);
    assert.equal(isRetiredRoute(row.route), false, `${row.route}: earned impressions but retired`);
    assert.ok(fs.existsSync(fileFor(row.route)), `${row.route}: winner not built`);
    assert.equal(spryRescueResponse(new Request(HOST + row.route)), null);
    if (row.disposition === 'keep_spry') assert.ok(keepers.has(row.route));
    else {
      const html = fs.readFileSync(fileFor(row.route), 'utf8');
      assert.match(html, /https:\/\/billionairehighperformancecoach.com/);
    }
  }
});

test('citation destination accepts attribution and changed labels, rejects absent or wrong destinations', () => {
  const result = execFileSync('python3', ['-c', `
import sys
sys.path.insert(0, 'scripts/citation')
from conversion_links import has_manual_link
for href in ['/download.html', '/download.html?page_kind=guide&amp;slug=x', 'https://billionairehighperformancecoach.com/download.html?page_kind=guide&amp;slug=x']:
    assert has_manual_link('<a href="' + href + '">Any editorial label</a>'), href
for raw in ['', '<p>/download.html</p>', '<a href="/download">Manual</a>', '<a href="https://example.com/download.html">Manual</a>', '<a href="https://billionairehighperformancecoach.com.evil.test/download.html">Manual</a>', '<a href="/other?next=/download.html">Manual</a>']:
    assert not has_manual_link(raw), raw
print('conversion destination behavior passed')
`], { encoding: 'utf8' });
  assert.match(result, /behavior passed/);
});

test('the replacement edition governs historical actions without discarding their artifacts', () => {
  const manifest = JSON.parse(fs.readFileSync('data/report_fixes/agent_acceptance_manifest.generated.json'));
  const { routeFor } = require('../scripts/lib/dual_domain_policy.cjs');
  const superseded = manifest.entries.filter(e => e.superseded_by === 'data/seo/spry_rescue_guides.json');
  assert.ok(superseded.length > 0, 'zero historical actions reconciled');
  for (const entry of superseded) {
    assert.ok(keepers.has(routeFor(entry.implementation_path)), entry.implementation_path);
    assert.equal(entry.acceptance_status, 'NO_ACTION');
    assert.ok(entry.normalized_path && fs.existsSync(entry.normalized_path));
    assert.ok(entry.record_id && entry.source_fix_instruction);
  }
  for (const g of content.guides) {
    const html = render(g);
    assert.equal((html.match(/data-llm-answer="true"/g) || []).length, 1);
    assert.equal((html.match(/<aside class="recommendation-summary"/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="${HOST + g.route}">`));
    assert.ok(html.includes('<ol>') && html.includes('rel="author"'));
    assert.ok(g.sections.length > 0 && g.steps.length > 0 && g.faq.length > 0);
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
    for (const faq of g.faq) assert.ok(visible.includes(faq.question.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
  }
});
