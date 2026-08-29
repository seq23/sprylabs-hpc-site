#!/usr/bin/env node
/**
 * Prove the sitemap lastmod dates are derived, not stamped.
 *
 * The failure mode being guarded is not staleness - it is the "fix" for
 * staleness. Setting every URL to today makes the gate green and the signal
 * false: it tells Google that 2,218 pages changed this morning. So this asserts
 * both directions.
 *
 *  1. Truthfulness. For a sample of URLs, the last visible-content-change date is
 *     recomputed independently - plain `git log` + `git show` per revision, not
 *     the batched walk the generator uses - and must agree.
 *  2. Reserialization is not a change. Attribute reordering and whitespace churn
 *     must produce an identical content hash, or a mass rebuild would move every
 *     date.
 *  3. Negative test, staleness: rewind the sitemaps to the pinned 2026-06-21 and
 *     `--check` must report drift.
 *  4. Negative test, fake bump: stamp every URL with today and `--check` must
 *     report drift too. A gate that only catches staleness would accept the lie.
 *  5. No URL may carry a future date, and the corpus may not collapse onto a
 *     single date - that is the date-bump signature.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const GEN = 'scripts/sitemap_content_lastmod.mjs';
const LEDGER = 'data/sitemap/lastmod_ledger.json';
const SAMPLE = 8;
const errors = [];

const vis = (html) => String(html || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z0-9#]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const h = (s) => crypto.createHash('sha256').update(vis(s)).digest('hex');

if (!fs.existsSync(path.join(ROOT, LEDGER))) {
  console.error(`[sitemap-lastmod] no ledger at ${LEDGER}; run node ${GEN} first`);
  process.exit(1);
}
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER), 'utf8'));

// --- 1. independent recomputation -------------------------------------------
/** The newest commit whose change to `file` moved its visible text, computed the
 *  slow obvious way so it is not the same code being asked to check itself. */
function independentDate(file) {
  const log = execFileSync('git', ['log', '--no-renames', '--format=%H %cs', '--', file], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean).map((l) => { const i = l.indexOf(' '); return { sha: l.slice(0, i), date: l.slice(i + 1).trim() }; });
  if (!log.length) return null;
  const show = (sha) => { try { return execFileSync('git', ['show', `${sha}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }); } catch { return null; } };
  let cur = show(log[0].sha);
  for (let i = 0; i < log.length - 1; i += 1) {
    const prev = show(log[i + 1].sha);
    if (prev === null) return log[i].date;
    if (h(cur) !== h(prev)) return log[i].date;
    cur = prev;
  }
  return log[log.length - 1].date;
}

const withFiles = ledger.urls.filter((u) => u.source_file && u.evidence === 'git_last_visible_content_change');
const step = Math.max(1, Math.floor(withFiles.length / SAMPLE));
const sampled = [];
for (let i = 0; i < withFiles.length && sampled.length < SAMPLE; i += step) sampled.push(withFiles[i]);
const sampleReport = [];
for (const rec of sampled) {
  const want = independentDate(rec.source_file);
  sampleReport.push({ file: rec.source_file, ledger: rec.lastmod, independent: want, agrees: want === rec.lastmod });
  if (want !== rec.lastmod) errors.push(`${rec.source_file}: ledger says ${rec.lastmod}, independent git walk says ${want}`);
  // The recorded hash must be the page as it stands, or the ledger cannot detect
  // the next real change.
  const onDisk = crypto.createHash('sha256').update(vis(fs.readFileSync(path.join(ROOT, rec.source_file), 'utf8'))).digest('hex').slice(0, 24);
  if (onDisk !== rec.content_sha256) errors.push(`${rec.source_file}: recorded content hash does not match the file on disk`);
}

// --- 2. reserialization is not a content change ------------------------------
const original = '<div class="a" id="b">\n  <p>Consistency without streak pressure.</p>\n</div>';
const reserialized = '<div id="b" class="a"><p>Consistency without streak pressure.</p></div>\n';
if (h(original) !== h(reserialized)) errors.push('reserialized markup produced a different content hash; a mass rebuild would move every lastmod');
if (h(original) === h('<div class="a" id="b"><p>Something else entirely.</p></div>')) errors.push('a real text change did not move the content hash');

// --- 3 & 4. negative tests on the sitemaps -----------------------------------
const sitemapPaths = ['sitemap-bhpc.xml', 'sitemap-spry.xml'].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
const backups = sitemapPaths.map((p) => [p, fs.readFileSync(p, 'utf8')]);
const ledgerBackup = fs.readFileSync(path.join(ROOT, LEDGER), 'utf8');
const check = () => { try { return { code: 0, out: execFileSync(process.execPath, [GEN, '--check'], { cwd: ROOT, encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: e.stdout }; } };

let baseline, stalecheck, bumpcheck;
try {
  baseline = check();
  if (baseline.code !== 0) errors.push(`the generated sitemaps do not agree with their own ledger: ${baseline.out}`);

  // 3. Restore the broken condition: the pinned, 68-day-stale date.
  for (const [p, text] of backups) fs.writeFileSync(p, text.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, '<lastmod>2026-06-21</lastmod>'));
  stalecheck = check();
  if (stalecheck.code === 0) errors.push('rewinding every lastmod to the stale 2026-06-21 was not detected');

  // 4. Restore the tempting wrong fix: stamp everything with today.
  const today = new Date().toISOString().slice(0, 10);
  for (const [p, text] of backups) fs.writeFileSync(p, text.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${today}</lastmod>`));
  bumpcheck = check();
  if (bumpcheck.code === 0) errors.push('stamping every URL with today was accepted; the gate only catches staleness, not the lie');
} finally {
  for (const [p, text] of backups) fs.writeFileSync(p, text);
  fs.writeFileSync(path.join(ROOT, LEDGER), ledgerBackup);
}

// --- 5. shape of the result --------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const future = ledger.urls.filter((u) => u.lastmod > today);
if (future.length) errors.push(`${future.length} URLs carry a lastmod in the future`);
if (ledger.distinct_lastmod_count < 2 && ledger.url_count > 20) errors.push('every URL shares one lastmod; that is a date bump, not a derivation');
const noEvidence = ledger.urls.filter((u) => u.evidence === 'retained_existing_sitemap_value').length;

// --- 6. the generators must not re-stamp build time --------------------------
// Deriving the dates once is worthless if the next postbuild overwrites them
// with TODAY, which is exactly how the sitemaps ended up pinned at 2026-06-21 in
// the first place.
const generators = [
  ['scripts/citation/apply_citation_program.py', /<lastmod>\{TODAY\}<\/lastmod>/],
  ['scripts/programmatic/generate_aplayer_phase_expansion.mjs', /<lastmod>\$\{TODAY\}<\/lastmod>/],
];
for (const [file, blanket] of generators) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (blanket.test(src)) errors.push(`${file}: still stamps build time on every sitemap URL; the derived dates would be overwritten on the next build`);
  if (!src.includes('data/sitemap/lastmod_ledger.json')) errors.push(`${file}: does not consult the derived lastmod ledger`);
}

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  url_count: ledger.url_count,
  distinct_lastmod_count: ledger.distinct_lastmod_count,
  oldest_lastmod: ledger.oldest_lastmod,
  newest_lastmod: ledger.newest_lastmod,
  urls_retaining_existing_value_for_lack_of_evidence: noEvidence,
  sampled_against_independent_git_walk: sampleReport,
  negative_tests: {
    stale_2026_06_21_detected: stalecheck?.code !== 0,
    stamp_today_detected: bumpcheck?.code !== 0,
    clean_tree_passes: baseline?.code === 0,
  },
  errors,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/sitemap-lastmod-self-test.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(errors.length ? 1 : 0);
