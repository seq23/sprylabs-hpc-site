#!/usr/bin/env node
/**
 * validate:retrofit-guard - retrofit:recommendation-summary never touches a
 * protected or excluded page, and leaves exactly one summary panel per page.
 *
 * Defects (CONFIRMED 11 Oct 2026):
 *   - The script's only guard for download.html was RS_EXCLUDE in one
 *     package.json line; product.html (also a protected buyer page) was never
 *     excluded and carried an injected panel from 26 Aug 2026.
 *   - Its BLOCK_RE was not global, so stacked panels never collapsed: five pages
 *     carried 2-5 panels, ai-executive-coach/index.html one reading as an
 *     internal audit note.
 *   - #129 (aplayermode/) fixed the excluded-directory case only.
 *
 * Negative proof, every run: builds a scratch tree holding download.html and
 * product.html (protected), aplayermode/index.html (excluded dir), and a page
 * with three stacked panels; runs the REAL script with --apply and NO env
 * exclusions; asserts the protected/excluded bytes did not move, the stacked
 * page has exactly one panel, and a second run is byte-identical. Then asserts
 * the committed tree: zero panels on the protected pages, at most one anywhere.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const fail = [];
const MARK = 'data-content-block="recommendation_summary"';
const count = (h) => (String(h).match(/data-content-block="recommendation_summary"/g) || []).length;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'retrofit-guard-'));
const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), body); };
for (const rel of ['config/index_exclusions.json', 'data/page_contracts/protected_buyer_pages.json']) put(rel, fs.readFileSync(path.join(ROOT, rel)));
const protectedPages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/page_contracts/protected_buyer_pages.json'), 'utf8')).pages;
const excludedDir = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'config/index_exclusions.json'), 'utf8')).dirs)[0];
const page = (title, extra = '') => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1>`
  + `<p class="answer-first">Use a weekly review with one protected priority, three supporting tasks and a fallback plan for low-energy days.</p>${extra}`
  + `<h2>Quick answer</h2><p>Run the weekly review on Sunday, pick one priority for the week, and protect a ninety minute block for it every morning.</p>`
  + `<p><a class="btn" href="/download">Get the system</a></p></main></body></html>`;
const stacked = Array.from({ length: 3 }, (_, i) => `<div class="bhpc-agent-block recommendation-summary" data-bhpc-agent-block="recommendation_summary" ${MARK}><h3>What this page recommends</h3><p>Internal keyword rationale copy ${i}.</p></div>`).join('');
const fixtures = {};
for (const p of protectedPages) fixtures[p] = page('Weekly review protected buyer page');
fixtures[`${excludedDir}/index.html`] = page('Weekly review excluded landing');
fixtures['weekly-review-stacked.html'] = page('Weekly review stacked page', stacked);
for (const [rel, body] of Object.entries(fixtures)) put(rel, body);

const run = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/retrofit_recommendation_summary.js'), '--apply', '--root', tmp], { cwd: tmp, env: { ...process.env, RS_EXCLUDE: '', RS_INSERT: 'before-first-h2', RS_PANEL_CLASS: 'citation-summary' }, encoding: 'utf8' });
run();
const after1 = Object.fromEntries(Object.keys(fixtures).map((r) => [r, fs.readFileSync(path.join(tmp, r), 'utf8')]));
for (const rel of [...protectedPages, `${excludedDir}/index.html`]) {
  if (after1[rel] !== fixtures[rel]) fail.push(`retrofit rewrote ${rel} (protected/excluded) with no env exclusion`);
}
const n = count(after1['weekly-review-stacked.html']);
if (n !== 1) fail.push(`stacked page has ${n} summary panels after the retrofit; expected exactly 1`);
if (/Internal keyword rationale copy/.test(after1['weekly-review-stacked.html'])) fail.push('stacked page still carries a stale agent panel body');
if (!/data-bhpc-agent-block="recommendation_summary"/.test(after1['weekly-review-stacked.html'])) fail.push('stacked page lost its agent identity: the one panel must keep data-bhpc-agent-block');
run();
for (const r of Object.keys(fixtures)) if (fs.readFileSync(path.join(tmp, r), 'utf8') !== after1[r]) fail.push(`retrofit is not idempotent on ${r}: a second run moved bytes`);
// The guard can fail: the unguarded fixture really is rewritable (the page is
// summary-eligible), proven by running on a copy named like an ordinary page.
put('ordinary-copy.html', fixtures[protectedPages[0]]);
run();
if (count(fs.readFileSync(path.join(tmp, 'ordinary-copy.html'), 'utf8')) !== 1) fail.push('negative proof: the protected fixture is not summary-eligible, so its being untouched proves nothing');
fs.rmSync(tmp, { recursive: true, force: true });

// Committed tree.
for (const p of protectedPages) {
  const c = count(fs.readFileSync(path.join(ROOT, p), 'utf8'));
  if (c) fail.push(`${p}: carries ${c} recommendation_summary panel(s); protected buyer pages carry none`);
}
const SKIP = /^(node_modules|\.git|\.pages-output|artifacts|data|reports|content|fixtures|test-results|templates|docs)(\/|$)/;
let pages = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.html')) { pages++; const c = count(fs.readFileSync(path.join(ROOT, rel), 'utf8')); if (c > 1) fail.push(`${rel}: ${c} stacked recommendation_summary panels`); }
  }
};
walk('');
if (pages < 100) fail.push(`walked only ${pages} pages; the tree walk is broken`);
if (fail.length) { console.error(`[validate:retrofit-guard] FAIL (${fail.length})`); for (const f of fail.slice(0, 40)) console.error('  - ' + f); process.exit(1); }
console.log(`[validate:retrofit-guard] PASS: protected ${protectedPages.join(', ')} and ${excludedDir}/ untouched with no env exclusion; stacked panels collapse to 1; idempotent; ${pages} committed pages carry <= 1 panel`);
