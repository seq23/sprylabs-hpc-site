#!/usr/bin/env node
/**
 * Maintain a truthful <lastmod> for every sitemap URL, from evidence.
 *
 * The state this replaces: both child sitemaps carried `2026-06-21` on all 2,218
 * URLs, ~68 days stale, because the generators stamped build time on every entry
 * and the build had not run since. The tempting fix - stamp today - is worse than
 * the staleness. `lastmod` is a signal Google reads; bumping every URL to now
 * asserts that 2,218 pages changed today, which is false, and it is the exact
 * date-bump pattern this repo's own cadence gate exists to catch.
 *
 * So lastmod is derived, never invented:
 *
 *  1. Content identity is the page's *visible text*, not its bytes. A rebuild that
 *     reorders attributes or reserializes markup changes the bytes of thousands of
 *     files while changing nothing a reader or a crawler would see. Hashing the
 *     stripped text means that churn cannot move a date.
 *
 *  2. Seeding walks git history for each page and takes the newest commit whose
 *     change to that file altered the visible text. That is the real answer to
 *     "when did this page last change", and it is why a mass-reserialization
 *     commit does not become every page's lastmod.
 *
 *  3. Afterwards the ledger carries the hash forward. A page whose visible text is
 *     unchanged keeps its recorded date untouched; only a page whose text actually
 *     moved gets today's date.
 *
 *  4. A URL whose file cannot be located, or for which git offers no evidence,
 *     keeps whatever lastmod the sitemap already had. An unknown date is left
 *     unknown rather than guessed.
 *
 * Usage:
 *   sitemap_content_lastmod.mjs            update the ledger and rewrite sitemaps
 *   sitemap_content_lastmod.mjs --check    fail if either would change (CI/gate)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const LEDGER = process.env.SITEMAP_LASTMOD_LEDGER || 'data/sitemap/lastmod_ledger.json';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TODAY = process.env.SITEMAP_LASTMOD_TODAY || new Date().toISOString().slice(0, 10);
const MAX_HISTORY = 60;
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------- content hash

/** The visible text of a page. Markup, scripts and styles are excluded on
 *  purpose: a reserialization is not a content change. */
export function visibleText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const contentHash = (html) => crypto.createHash('sha256').update(visibleText(html)).digest('hex').slice(0, 24);

// ------------------------------------------------------------------- sitemaps

function sitemapFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (/^(node_modules|\.git|\.build|\.pages-output|dist)$/.test(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sitemapFiles(full, out);
    else if (/^sitemap.*\.xml$/i.test(e.name)) out.push(full);
  }
  return out;
}

function fileForLoc(loc) {
  const rel = String(loc).replace(/^https?:\/\/[^/]+\/?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  const candidates = rel ? [`${rel}/index.html`, `${rel}.html`, rel] : ['index.html'];
  for (const c of candidates) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return c;
  }
  return '';
}

// ------------------------------------------------------- git content-change date

let historyIndex = null;
/** path -> [{date, blob}] newest first, from one pass over history. */
function loadHistory() {
  if (historyIndex) return historyIndex;
  historyIndex = new Map();
  let out;
  try {
    out = execFileSync('git', ['log', '--no-renames', '--format=__C__ %cs', '--raw', '--diff-filter=AM', '--', '*.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 });
  } catch { return historyIndex; }
  let date = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('__C__ ')) { date = line.slice(6).trim(); continue; }
    if (!line.startsWith(':')) continue;
    // :<oldmode> <newmode> <oldsha> <newsha> <status>\t<path>
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const parts = line.slice(0, tab).split(/\s+/);
    const blob = parts[3];
    const file = line.slice(tab + 1);
    if (!DATE.test(date) || !blob || /^0+$/.test(blob)) continue;
    const list = historyIndex.get(file);
    if (list) { if (list.length < MAX_HISTORY) list.push({ date, blob }); }
    else historyIndex.set(file, [{ date, blob }]);
  }
  return historyIndex;
}

const blobHashCache = new Map();
function hashBlobs(oids) {
  const need = [...new Set(oids)].filter((o) => !blobHashCache.has(o));
  for (let i = 0; i < need.length; i += 400) {
    const chunk = need.slice(i, i + 400);
    const buf = execFileSync('git', ['cat-file', '--batch'], { cwd: ROOT, input: chunk.join('\n') + '\n', maxBuffer: 1024 * 1024 * 512 });
    let off = 0;
    for (const oid of chunk) {
      const nl = buf.indexOf(0x0a, off);
      const header = buf.subarray(off, nl).toString('utf8');
      const size = Number(header.split(' ')[2]);
      if (!Number.isFinite(size)) { blobHashCache.set(oid, null); off = nl + 1; continue; }
      const body = buf.subarray(nl + 1, nl + 1 + size).toString('utf8');
      blobHashCache.set(oid, contentHash(body));
      off = nl + 1 + size + 1;
    }
  }
  return blobHashCache;
}

/**
 * The date of the newest commit whose change to `file` moved its visible text.
 * Resolved in rounds so the blob reads stay batched: almost every page settles
 * within the first two revisions, and only pages buried under reserialization
 * commits walk further back.
 */
function seedDates(files) {
  const hist = loadHistory();
  const cursor = new Map();   // file -> index being tested
  const answer = new Map();
  for (const f of files) {
    const h = hist.get(f);
    if (!h || !h.length) { answer.set(f, null); continue; }
    if (h.length === 1) { answer.set(f, h[0].date); continue; }
    cursor.set(f, 0);
  }
  while (cursor.size) {
    const wanted = [];
    for (const [f, i] of cursor) { const h = hist.get(f); wanted.push(h[i].blob, h[i + 1].blob); }
    hashBlobs(wanted);
    for (const [f, i] of [...cursor]) {
      const h = hist.get(f);
      const a = blobHashCache.get(h[i].blob);
      const b = blobHashCache.get(h[i + 1].blob);
      if (a === null || b === null) { answer.set(f, h[i].date); cursor.delete(f); continue; }
      if (a !== b) { answer.set(f, h[i].date); cursor.delete(f); continue; }
      // Same visible text across this revision: it was churn. Keep walking back.
      const next = i + 1;
      if (next + 1 >= h.length) { answer.set(f, h[h.length - 1].date); cursor.delete(f); }
      else cursor.set(f, next);
    }
  }
  return answer;
}

// ------------------------------------------------------------------------ run

const parsed = sitemapFiles().map((sm) => {
  const text = fs.readFileSync(sm, 'utf8');
  const entries = [...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
    loc: (m[1].match(/<loc>(.*?)<\/loc>/) || [])[1] || '',
    lastmod: (m[1].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
  })).filter((e) => e.loc);
  return { file: sm, rel: path.relative(ROOT, sm), text, entries };
});

const ledgerPath = path.join(ROOT, LEDGER);
const priorLedger = (() => { try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return { urls: [] }; } })();
const priorByUrl = new Map((priorLedger.urls || []).map((u) => [u.url, u]));

const allLocs = new Map();
for (const sm of parsed) for (const e of sm.entries) if (!allLocs.has(e.loc)) allLocs.set(e.loc, e.lastmod);

const resolved = new Map();     // loc -> file
const unresolvable = [];
for (const loc of allLocs.keys()) {
  const f = fileForLoc(loc);
  if (f) resolved.set(loc, f); else unresolvable.push(loc);
}

// Which URLs still need a git-derived seed: no ledger entry at all.
const needSeed = [...resolved.entries()].filter(([loc]) => !priorByUrl.get(loc)?.lastmod).map(([, f]) => f);
const seeded = needSeed.length ? seedDates([...new Set(needSeed)]) : new Map();

const stats = { seeded_from_git: 0, unchanged: 0, content_changed: 0, kept_existing_no_evidence: 0, unresolvable_file: unresolvable.length };
const urls = [];
for (const [loc, existing] of allLocs) {
  const file = resolved.get(loc);
  if (!file) {
    // No file to hash and nothing to derive from. Leave the sitemap's own value be.
    stats.kept_existing_no_evidence += 1;
    const was = priorByUrl.get(loc);
    if (was) urls.push(was);
    continue;
  }
  const hash = contentHash(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const was = priorByUrl.get(loc);
  if (was && was.content_sha256 === hash) {
    stats.unchanged += 1;
    urls.push(was);
    continue;
  }
  if (was) {
    // Visible text moved since the ledger recorded it. That is a real change, and
    // today is the honest date for it.
    stats.content_changed += 1;
    urls.push({ url: loc, source_file: file, content_sha256: hash, lastmod: TODAY, evidence: 'content_hash_changed', first_seen: was.first_seen || was.lastmod || TODAY });
    continue;
  }
  const gitDate = seeded.get(file) || null;
  if (!gitDate) {
    stats.kept_existing_no_evidence += 1;
    if (existing) urls.push({ url: loc, source_file: file, content_sha256: hash, lastmod: existing, evidence: 'retained_existing_sitemap_value', first_seen: existing });
    continue;
  }
  stats.seeded_from_git += 1;
  urls.push({ url: loc, source_file: file, content_sha256: hash, lastmod: gitDate, evidence: 'git_last_visible_content_change', first_seen: gitDate });
}
urls.sort((a, b) => a.url.localeCompare(b.url));

const ledger = {
  schema_version: '1.0',
  // Derived from the records alone, so an unchanged corpus rewrites identical bytes.
  url_count: urls.length,
  newest_lastmod: urls.reduce((a, u) => (u.lastmod > a ? u.lastmod : a), ''),
  oldest_lastmod: urls.reduce((a, u) => (!a || u.lastmod < a ? u.lastmod : a), ''),
  distinct_lastmod_count: new Set(urls.map((u) => u.lastmod)).size,
  urls,
};

const lastmodFor = new Map(urls.map((u) => [u.url, u.lastmod]));
const rewrites = [];
for (const sm of parsed) {
  const after = sm.text.replace(/<url>([\s\S]*?)<\/url>/g, (whole, inner) => {
    const loc = (inner.match(/<loc>(.*?)<\/loc>/) || [])[1];
    const d = loc && lastmodFor.get(loc);
    if (!d) return whole;   // no evidence: leave whatever is there
    if (/<lastmod>/.test(inner)) return whole.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${d}</lastmod>`);
    return whole.replace('</loc>', `</loc><lastmod>${d}</lastmod>`);
  });
  if (after !== sm.text) rewrites.push({ file: sm.file, rel: sm.rel, after });
}
// The sitemap index's own lastmod is the newest date inside each child, not today.
const indexFile = path.join(ROOT, 'sitemap.xml');
let indexAfter = null;
if (fs.existsSync(indexFile)) {
  const text = fs.readFileSync(indexFile, 'utf8');
  indexAfter = text.replace(/<sitemap>([\s\S]*?)<\/sitemap>/g, (whole, inner) => {
    const loc = (inner.match(/<loc>(.*?)<\/loc>/) || [])[1] || '';
    const child = path.basename(loc);
    const newest = urls.filter((u) => {
      const sm = parsed.find((p) => path.basename(p.rel) === child);
      return sm ? sm.entries.some((e) => e.loc === u.url) : false;
    }).reduce((a, u) => (u.lastmod > a ? u.lastmod : a), '');
    if (!newest) return whole;
    return /<lastmod>/.test(inner)
      ? whole.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${newest}</lastmod>`)
      : whole.replace('</loc>', `</loc><lastmod>${newest}</lastmod>`);
  });
  if (indexAfter === text) indexAfter = null;
}

const ledgerText = JSON.stringify(ledger, null, 2) + '\n';
const ledgerChanged = !fs.existsSync(ledgerPath) || fs.readFileSync(ledgerPath, 'utf8') !== ledgerText;

if (CHECK) {
  // Drift means a sitemap is publishing a lastmod that the evidence does not
  // support - stale, or bumped. The ledger merely gaining rows for URLs a build
  // just created is not drift: those pages really are new, and their date really
  // is today. Failing on that would make the gate fire on every legitimate
  // publish, and a gate that is permanently red is a gate nobody reads.
  const drift = [...rewrites.map((r) => r.rel), ...(indexAfter ? ['sitemap.xml'] : [])];
  const newLedgerRows = urls.filter((u) => !priorByUrl.has(u.url)).length;
  console.log(JSON.stringify({
    status: drift.length ? 'DRIFT' : 'PASS',
    drift,
    ledger_rows_added: newLedgerRows,
    ledger_would_change: ledgerChanged,
    stats,
    ledger_summary: { url_count: ledger.url_count, distinct_lastmod_count: ledger.distinct_lastmod_count, oldest: ledger.oldest_lastmod, newest: ledger.newest_lastmod },
  }, null, 2));
  process.exit(drift.length ? 1 : 0);
}

fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
if (ledgerChanged) fs.writeFileSync(ledgerPath, ledgerText);
for (const r of rewrites) fs.writeFileSync(r.file, r.after);
if (indexAfter) fs.writeFileSync(indexFile, indexAfter);

console.log(JSON.stringify({
  status: 'OK',
  sitemaps_rewritten: rewrites.map((r) => r.rel),
  index_rewritten: Boolean(indexAfter),
  ledger: LEDGER,
  ledger_changed: ledgerChanged,
  stats,
  distinct_lastmod_count: ledger.distinct_lastmod_count,
  oldest_lastmod: ledger.oldest_lastmod,
  newest_lastmod: ledger.newest_lastmod,
}, null, 2));
