#!/usr/bin/env node
/**
 * validate:demand-families - each host's measured demand families are fresh,
 * applied, and every page carries at most one FAQPage.
 *
 * Reads data/search_intelligence/<host>/demand_families.json for every host in
 * config/site_hosts.json and fails when:
 *   - a file is missing, measures zero families, or strengthens anything but
 *     exactly 8 (hard-fail on zero: a pass that strengthens nothing is inert);
 *   - totals do not add up to the families' measured impressions, or an FAQ
 *     question's source query is not one of that family's measured queries
 *     (targets are measured-only);
 *   - a strengthened family's title is over 65 characters or does not lead with
 *     the family's measured words; its definition is outside 40-60 words;
 *   - FRESHNESS: the primary page does not carry the section for the CURRENT
 *     content (data-demand-hash must equal the hash of the family's content),
 *     its <title> differs, its CTA lacks the ref, it has fewer than 3 question
 *     H2s, or its FAQ lacks a question from the file. A file edited without
 *     the applier running, or a page some later pass rewrote, both fail here;
 *   - the homepage does not link every strengthened page;
 *   - ANY page in the tree carries more than one FAQPage node, or a strengthened
 *     page's FAQPage does not hold every FAQ question from the file.
 * Measurement age is reported (re-pull due after 45 days) but never fails by
 * itself: a date rollover must not turn main red.
 * Negative proof each run: a page with two FAQPage nodes is counted as two, and
 * a tampered content hash is detected.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const fail = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const hosts = Object.keys(JSON.parse(read('config/site_hosts.json')).hosts);
const faqCount = (h) => (String(h).match(/"@type"\s*:\s*"FAQPage"/g) || []).length;
// Same hash as apply_demand_families.py: sha256 of json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":"))[:16].
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const hashOf = (c) => crypto.createHash('sha256').update(JSON.stringify(sortKeys(c)), 'utf8').digest('hex').slice(0, 16);
const decode = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'for', 'what', 'how', 'is', 'a', 'an', 'to', 'of', 'vs', 'with', 'in', 'on', 'it', 'are', 'does', 'do', 'i', 'my']);
const words = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));

const home = read('index.html');
let strengthenedTotal = 0;
let oldest = null;
for (const host of hosts) {
  const rel = `data/search_intelligence/${host}/demand_families.json`;
  if (!fs.existsSync(path.join(ROOT, rel))) { fail.push(`${rel} missing`); continue; }
  const d = JSON.parse(read(rel));
  const fams = d.families || [];
  if (!fams.length) { fail.push(`${rel}: zero families`); continue; }
  const sum = fams.reduce((a, f) => a + f.impressions_90d, 0);
  if (sum !== d.totals?.impressions_90d) fail.push(`${rel}: totals.impressions_90d ${d.totals?.impressions_90d} != families sum ${sum}`);
  for (const f of fams) {
    const qsum = f.queries.reduce((a, q) => a + q.impressions_90d, 0);
    if (qsum !== f.impressions_90d) fail.push(`${rel} ${f.id}: query impressions ${qsum} != family ${f.impressions_90d}`);
  }
  const end = d.source?.window?.end;
  if (end && (!oldest || end < oldest)) oldest = end;
  const strong = fams.filter((f) => f.strengthened);
  strengthenedTotal += strong.length;
  if (strong.length !== 8) fail.push(`${rel}: strengthens ${strong.length} families; the demand pass strengthens the top 8`);
  for (const f of strong) {
    const c = f.content || {};
    const tag = `${host} ${f.id}`;
    const measured = new Set(f.queries.map((q) => q.query));
    for (const q of c.faq || []) if (!measured.has(q.source_query)) fail.push(`${tag}: FAQ source query "${q.source_query}" is not a measured query of this family`);
    if (!c.title || c.title.length > 65) fail.push(`${tag}: title "${c.title}" is ${c.title?.length} chars (max 65)`);
    const lead = words(String(c.title).split(/[:|—-]/)[0]);
    const qwords = new Set(f.queries.slice(0, 5).flatMap((q) => words(q.query)));
    if (!lead.some((w) => qwords.has(w))) fail.push(`${tag}: title does not lead with the family's measured words`);
    const dw = String(c.definition || '').split(/\s+/).filter(Boolean).length;
    if (dw < 40 || dw > 60) fail.push(`${tag}: definition is ${dw} words (40-60)`);
    if ((c.question_sections || []).length < 3) fail.push(`${tag}: fewer than 3 question sections`);
    if (!/[?&]ref=/.test(c.cta?.href || '')) fail.push(`${tag}: CTA has no ref`);
    const file = f.primary_page?.file;
    if (!file || !fs.existsSync(path.join(ROOT, file))) { fail.push(`${tag}: primary page ${file} missing`); continue; }
    const h = read(file);
    const sec = h.match(new RegExp(`<section\\b[^>]*data-demand-family="${f.id}"[^>]*>[\\s\\S]*?</section>`));
    if (!sec) { fail.push(`${tag}: ${file} has no demand section (applier not run)`); continue; }
    const hash = (sec[0].match(/data-demand-hash="([0-9a-f]+)"/) || [])[1];
    if (hash !== hashOf(c)) fail.push(`${tag}: ${file} carries content hash ${hash}, file content is ${hashOf(c)} (stale page)`);
    const title = decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    if (title !== c.title) fail.push(`${tag}: ${file} <title> "${title}" != "${c.title}"`);
    const qh2 = (sec[0].match(/<h2>[^<]*\?<\/h2>/g) || []).length;
    if (qh2 < 3) fail.push(`${tag}: ${file} has ${qh2} question H2s in the section`);
    if (!sec[0].includes(`ref=`)) fail.push(`${tag}: ${file} CTA without ref`);
    if (h.indexOf(sec[0]) > h.length * 0.6) fail.push(`${tag}: ${file} demand section is not near the top of the page`);
    const n = faqCount(h);
    if (n !== 1) fail.push(`${tag}: ${file} carries ${n} FAQPage nodes (exactly one)`);
    let schemaQs = [];
    try { const g = JSON.parse((h.match(/<script id="CITATION_PAGE_SCHEMA"[^>]*>([\s\S]*?)<\/script>/) || [])[1] || '{}')['@graph'] || []; schemaQs = (g.find((x) => x['@type'] === 'FAQPage')?.mainEntity || []).map((q) => q.name); } catch { fail.push(`${tag}: ${file} CITATION_PAGE_SCHEMA unparseable`); }
    for (const q of c.faq || []) {
      if (!schemaQs.includes(q.question)) fail.push(`${tag}: FAQPage lacks "${q.question}"`);
      if (!decode(h).includes(q.question)) fail.push(`${tag}: visible FAQ lacks "${q.question}"`);
    }
    const href = '/' + String(f.primary_page.url).replace(/^https:\/\/[^/]+\//, '');
    if (!new RegExp(`data-demand-hub="true"[\\s\\S]*?href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(home)) fail.push(`${tag}: homepage hub does not link ${href}`);
  }
}
if (strengthenedTotal === 0) fail.push('no family strengthened on any host');

// Site-wide: one FAQPage per page.
const SKIP = /^(node_modules|\.git|\.claude|\.pages-output|\.build|artifacts|data|reports|content|fixtures|test-results|templates|docs|scripts|functions|config)(\/|$)/;
let pages = 0;
const multi = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.html')) { pages++; const n = faqCount(fs.readFileSync(path.join(ROOT, rel), 'utf8')); if (n > 1) multi.push(`${rel} (${n})`); }
  }
};
walk('');
if (pages < 100) fail.push(`walked only ${pages} pages`);
if (multi.length) fail.push(`${multi.length} page(s) carry more than one FAQPage: ${multi.slice(0, 10).join(', ')}`);

// Negative proofs.
if (faqCount('{"@type":"FAQPage"}<script>{"@type": "FAQPage"}</script>') !== 2) fail.push('negative proof: FAQPage counter cannot see two nodes');
if (hashOf({ a: 1, b: ['x'] }) === hashOf({ a: 2, b: ['x'] })) fail.push('negative proof: content hash does not change with content');
if (hashOf({ b: 'é', a: [1, { c: true }] }) !== hashOf({ a: [1, { c: true }], b: 'é' })) fail.push('negative proof: hash depends on key order');

const age = oldest ? Math.round((Date.now() - Date.parse(oldest)) / 86400000) : null;
if (fail.length) { console.error(`[validate:demand-families] FAIL (${fail.length})`); for (const f of fail.slice(0, 60)) console.error('  - ' + f); process.exit(1); }
console.log(`[validate:demand-families] PASS: ${hosts.length} hosts, ${strengthenedTotal} strengthened families applied at their current content hash; ${pages} pages, none with more than one FAQPage; measurement window ends ${oldest} (${age} days ago${age > 45 ? ' - NAMED STOP: re-pull Search Console and rebuild the families' : ''})`);
