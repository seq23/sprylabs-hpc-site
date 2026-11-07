import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { spryRescueResponse } from '../functions/_lib/spry_rescue.js';
import { SPRY_RESCUE_REDIRECTS } from '../functions/_lib/spry_rescue_table.js';
import { consolidationResponse } from '../functions/_lib/host_consolidation.js';
const require = createRequire(import.meta.url);
const { renderSchemaScript } = require('../scripts/lib/citation_page_schema.cjs');
const { admittedEnginePages, enginePages, content, HOST, keepers, isRetiredFile, isRetiredRoute } = require('../scripts/lib/spry_rescue.cjs');
const { build, render, fileFor, partsFor } = require('../scripts/content/build_spry_rescue.cjs');
const { sharedSentences } = require('../scripts/lib/spry_say_once.cjs');
const pageParts = g => partsFor(g).parts;
const ledger = JSON.parse(fs.readFileSync('data/seo/spry_rescue_redirects.json'));

test('publisher trust rejects broken attribution, invisible bylines and wrong conversion destinations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spry-publisher-trust-'));
  try {
    for (const file of ['data/entities/author_profile.json', 'data/entities/org_profile.json', 'data/entities/entity_registry.json', 'scripts/citation/conversion_links.py', 'author.html', 'download.html']) {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true});
      fs.copyFileSync(file, path.join(root, file));
    }
    const original = fs.readFileSync('about.html', 'utf8');
    const validator = path.resolve('scripts/validators/validate_author_trust.js');
    const check = html => {
      fs.writeFileSync(path.join(root, 'about.html'), html);
      return () => execFileSync(process.execPath, [validator], {cwd:root,stdio:'pipe'});
    };
    assert.doesNotThrow(check(original));
    const schema = JSON.parse(original.match(/<script id="CITATION_PAGE_SCHEMA" type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    const broken = structuredClone(schema);
    broken['@graph'].find(n => n['@type'] === 'Article').author = {'@id':'https://example.com/invented-author'};
    assert.throws(check(original.replace(JSON.stringify(schema), JSON.stringify(broken))));
    assert.throws(check(original.replace('rel="author"', 'rel="nofollow"')));
    assert.throws(check(original.replaceAll('https://billionairehighperformancecoach.com/download.html?', 'https://example.com/download.html?')));
    assert.throws(check(''));
  } finally {
    fs.rmSync(root, {recursive:true,force:true});
  }
});

test('manual link normalization preserves historical rescue sources and edge keys', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spry-redirect-history-'));
  const source = '/insights/retired-planning';
  const target = '/guides/planning/';
  const protectedFiles = ['data/seo/spry_rescue_redirects.json', 'data/seo/spry_rescue_selection.json', 'data/seo/spry_rescue_guides.json', 'functions/_lib/spry_rescue_table.js'];
  try {
    fs.mkdirSync(path.join(root, 'data/content'), {recursive:true});
    fs.writeFileSync(path.join(root, 'data/content/manual_redirects.json'), JSON.stringify({redirects:[{source_path:source.slice(1)+'.html',target}]}));
    for (const file of protectedFiles) {
      fs.mkdirSync(path.dirname(path.join(root,file)), {recursive:true});
      fs.writeFileSync(path.join(root,file), JSON.stringify({from:source,to:target}));
    }
    fs.writeFileSync(path.join(root,'article.html'), `<a href="${source}">Continue</a>`);
    execFileSync(process.execPath, [path.resolve('scripts/content/apply_redirect_map.mjs')], {cwd:root,stdio:'pipe'});
    assert.equal(fs.readFileSync(path.join(root,'article.html'),'utf8'), `<a href="${target}">Continue</a>`);
    for (const file of protectedFiles) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,file))), {from:source,to:target}, file);
  } finally {
    fs.rmSync(root, {recursive:true,force:true});
  }
});

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
  assert.equal(JSON.parse(fs.readFileSync('search-loop.config.json')).mode,'slow');
});

test('engine admission preserves retirement and requires a live, sourced publication record', () => {
  const page = { route:'/questions/a-distinct-question/', rel:'questions/a-distinct-question/index.html', url:HOST+'/questions/a-distinct-question/', status:'live', published_at:'2026-11-04', hash:'a'.repeat(64), facts:['https://one.example/research','https://two.example/research'] };
  assert.deepEqual(admittedEnginePages({pages:[page]}, []), [page]);
  assert.deepEqual(admittedEnginePages({pages:[page]}, [{from:page.route}]), []);
  for (const patch of [{status:'pending_approval'}, {status:'merged'}, {facts:[]}, {hash:''}, {published_at:null}, {rel:'../download.html'}, {url:'https://other.example'+page.route}, {route:'/insights/variant'}]) {
    assert.deepEqual(admittedEnginePages({pages:[{...page,...patch}]}, []), [], JSON.stringify(patch));
  }
  assert.deepEqual(admittedEnginePages({pages:[]}, []), []);
});

// The 3 Nov rescue (#202) retired the engine's first three question pages before #207 restored
// engine admission, so they 301ed and sat outside sitemap-spry.xml while the engine counted them
// live. Every page Search Loop lists live with its file present is in the spry sitemap and 200s.
test('every live Search Loop question page is admitted, in sitemap-spry.xml and not redirected', () => {
  const book = JSON.parse(fs.readFileSync('data/search-loop/pages.json'));
  const live = book.pages.filter(p => p.status === 'live' && fs.existsSync(p.rel));
  assert.ok(live.length > 0, 'the engine ledger lists no live page with its file: nothing to check');
  const sitemap = fs.readFileSync('sitemap-spry.xml', 'utf8');
  for (const p of live) {
    assert.ok(enginePages.some(e => e.route === p.route), `${p.route}: live in the engine but not admitted`);
    assert.ok(sitemap.includes(`<loc>${HOST}${p.route}</loc>`), `${p.route}: missing from sitemap-spry.xml`);
    assert.ok(!ledger.redirects.some(r => r.from === p.route), `${p.route}: live in the engine but retired by the rescue ledger`);
    assert.ok(!SPRY_RESCUE_REDIRECTS.has(p.route), `${p.route}: 301s at the edge`);
  }
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

test('a new gated engine page survives the final renderer and deploy assembly', () => {
  const bookFile = 'data/search-loop/pages.json';
  const original = fs.readFileSync(bookFile, 'utf8');
  const snapshots = new Map(['data/seo/spry_rescue_redirects.json','functions/_lib/spry_rescue_table.js','sitemap-spry.xml'].map(f=>[f,fs.readFileSync(f)]));
  const route = '/questions/fixture-distinct-planning-question/';
  const rel = fileFor(route);
  try {
    fs.mkdirSync(path.dirname(rel), {recursive:true});
    fs.writeFileSync(rel, render({...content.guides[0], route}));
    const book = JSON.parse(original);
    book.pages.push({route,rel,url:HOST+route,status:'live',query:'Fixture distinct planning question',published_at:'2026-11-04',hash:'a'.repeat(64),facts:['https://one.example/research','https://two.example/research']});
    fs.writeFileSync(bookFile, JSON.stringify(book));
    execFileSync(process.execPath, ['scripts/assemble_pages_output.js'], {stdio:'pipe'});
    assert.ok(fs.existsSync('.pages-output/'+rel));
    assert.ok(fs.readFileSync('.pages-output/sitemap-spry.xml','utf8').includes(HOST+route));
    assert.ok(fs.readFileSync('.pages-output/knowledge-map/index.html','utf8').includes(route));
    assert.ok(!JSON.parse(fs.readFileSync('data/seo/spry_rescue_redirects.json')).redirects.some(r=>r.from===route));
  } finally {
    fs.writeFileSync(bookFile, original);
    fs.rmSync(path.dirname(rel), {recursive:true,force:true});
    for (const [file, bytes] of snapshots) fs.writeFileSync(file, bytes);
    execFileSync(process.execPath, ['scripts/content/build_spry_rescue.cjs'], {stdio:'pipe'});
  }
});

test('rendered FAQ and article metadata agree with the editorial data without duplicate schema', () => {
  for (const g of content.guides) {
    const html = render(g);
    assert.equal((html.match(/<h1\b/g)||[]).length,1);
    const schema = JSON.parse(html.match(/<script id="CITATION_PAGE_SCHEMA" type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.ok(html.includes(renderSchemaScript(schema)), 'schema serialization differs from the shared authority');
    const graph = schema['@graph'];
    // The FAQ prints only answers the page has not already given (spry_say_once):
    // schema, visible questions and the kept list agree exactly, and no FAQ means no FAQPage.
    const kept = pageParts(g).faq;
    const faqs = graph.filter(n=>n['@type']==='FAQPage');
    assert.equal(faqs.length, kept.length ? 1 : 0);
    if (kept.length) assert.deepEqual(faqs[0].mainEntity.map(q=>q.name), kept.map(f=>f.question));
    assert.equal((html.match(/<h3>/g)||[]).length,kept.length);
    assert.equal(html.includes('id="faq"'), kept.length > 0);
    const speak = graph.find(n=>n['@type']==='WebPage').speakable.cssSelector;
    assert.equal(speak.includes('#faq'), kept.length > 0);
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
  assert.deepEqual(selection.kept.map(p => p.route).sort(), [...keepers].filter(r=>!enginePages.some(p=>p.route===r)).sort());
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
    for (const faq of pageParts(g).faq) assert.ok(visible.includes(faq.question.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')));
  }
});

test('required internal links follow finite consolidations without accepting absent or unrelated links', () => {
  const {hasInternalDestination} = require('../scripts/lib/internal_link_destination.cjs');
  const row = ledger.redirects.find(r => r.from.startsWith('/pillars/'));
  assert.ok(row, 'no pillar redirect examined');
  assert.ok(hasInternalDestination(`<a href="${row.to}?ref=guide">Continue</a>`, row.from));
  assert.equal(hasInternalDestination('', row.from), false);
  assert.equal(hasInternalDestination('<a href="https://example.com'+new URL(row.to).pathname+'">Wrong host</a>',row.from),false);
  assert.equal(hasInternalDestination('<a href="/never-published-rescue-test">Unknown</a>',row.from),false);
});

// Search Readiness a8: Google retained a repeated-slash alias of a retired page.
test('repeated slashes on retired routes 301 directly to the retained guide', () => {
  const route = '/accountability-system/enforce-rules-on-yourself/';
  const target = SPRY_RESCUE_REDIRECTS.get(route);
  assert.ok(target);
  for (const host of ['spryexecutiveos.com', 'billionairehighperformancecoach.com']) {
    const response = spryRescueResponse(new Request(`https://${host}${route}/?source=search`));
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), `${target}?source=search`);
    assert.equal(spryRescueResponse(new Request(`https://${host}/unknown//`)), null);
    assert.equal(spryRescueResponse(new Request(`${target}?source=search`)), null);
  }
  assert.equal(spryRescueResponse(new Request(`https://preview.pages.dev${route}/`)), null);
});

// Search Readiness q1 (7 Nov 2026): 39 of 48 guides printed one sentence up to six
// times and shared ten stock sentences with 39 other guides. The checklist's own
// rule: an 8-word phrase more than three times in one body is template filler.
function fillerPhrases(html) {
  const body = (html.match(/<main\b[\s\S]*?<\/main>/) || [html])[0].replace(/<script\b[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ').replace(/&#39;|&amp;|&quot;/g,' ');
  const w = body.toLowerCase().match(/[a-z0-9][\w'’-]*/g) || [];
  const seen = new Map();
  for (let i = 0; i + 8 <= w.length; i++) { const k = w.slice(i, i + 8).join(' '); seen.set(k, (seen.get(k) || 0) + 1); }
  return [...seen].filter(([, n]) => n > 3);
}
test('no rescue guide repeats a phrase more than three times, and stock sentences are not printed', () => {
  assert.ok(content.guides.length >= 40, 'too few guides examined');
  const shared = sharedSentences(content.guides);
  assert.ok(shared.size > 0, 'the stock-sentence detector found nothing to prove itself on');
  for (const g of content.guides) {
    const html = render(g);
    assert.deepEqual(fillerPhrases(html), [], g.route);
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const s of shared) assert.ok(!text.toLowerCase().replace(/[^a-z0-9]+/g,' ').includes(' ' + s + ' '), `${g.route} prints a stock sentence: ${s}`);
  }
  // Negative proof: the detector catches the old shape, one step printed six times.
  const step = content.guides.find(g => g.best_for.startsWith('readers who need')).steps[0];
  assert.ok(fillerPhrases('<main>' + Array(6).fill(`<p>${step}</p>`).join('') + '</main>').length > 0);
});
