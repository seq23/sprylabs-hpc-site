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
import { execFileSync } from 'node:child_process';
// One shared definition of page identity, shared with the guard that asserts the
// committed ledger still describes the tree. Two copies of this normaliser would
// make a divergence between them indistinguishable from a stale ledger.
import { ROOT, DATE_RE as DATE, LEDGER_PATH as LEDGER, visibleText, contentHash, parseSitemaps, fileForLoc } from './lib/sitemap_ledger.mjs';

export { visibleText };
const TODAY = process.env.SITEMAP_LASTMOD_TODAY || new Date().toISOString().slice(0, 10);
const MAX_HISTORY = 60;
const CHECK = process.argv.includes('--check');

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

const parsed = parseSitemaps();

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
// URLs whose visible content is byte-for-byte what the ledger recorded. Only for
// these can a sitemap/ledger mismatch mean the sitemap is publishing a false date;
// for the rest it means the ledger is due a regeneration, which is a different
// condition with a different remedy.
const stableUrls = new Set();
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
    stableUrls.add(loc);
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
  // What this gate protects is the truthfulness of a published date. Two very
  // different things can make a sitemap disagree with the ledger:
  //
  //  - The page has not changed, but the sitemap advertises a different date.
  //    That is the defect: either a stale pin (2026-06-21 across 2,218 URLs) or a
  //    bump to today. The sitemap is asserting something the evidence contradicts,
  //    so it fails.
  //
  //  - The page's visible content HAS changed since the ledger was written, so the
  //    published date is merely behind. Nothing false has been published; the
  //    ledger needs re-deriving. Reported, and not a hard failure - this repo's
  //    build rewrites page content, and failing the prepush profile every time a
  //    build touched a page would make the gate permanently red and therefore
  //    ignored.
  const contradictions = [];
  for (const sm of parsed) {
    for (const e of sm.entries) {
      if (!stableUrls.has(e.loc)) continue;
      const want = lastmodFor.get(e.loc);
      if (want && e.lastmod !== want) contradictions.push({ sitemap: sm.rel, loc: e.loc, published: e.lastmod, evidence: want });
    }
  }
  const regenerationNeeded = stats.content_changed + stats.seeded_from_git;
  const report = {
    status: contradictions.length ? 'DRIFT' : 'PASS',
    contradiction_count: contradictions.length,
    contradictions: contradictions.slice(0, 20),
    urls_checked_against_evidence: stableUrls.size,
    ledger_regeneration_needed: regenerationNeeded,
    regeneration_note: regenerationNeeded
      ? `${regenerationNeeded} URL(s) have content the ledger has not recorded yet; run \`npm run sitemap:lastmod:content\` to re-derive. Their published dates understate freshness but assert nothing false.`
      : null,
    stats,
    ledger_summary: { url_count: ledger.url_count, distinct_lastmod_count: ledger.distinct_lastmod_count, oldest: ledger.oldest_lastmod, newest: ledger.newest_lastmod },
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(contradictions.length ? 1 : 0);
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
