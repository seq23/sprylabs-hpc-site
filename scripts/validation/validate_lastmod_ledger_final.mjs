#!/usr/bin/env node
/**
 * The sitemap lastmod ledger must describe the tree it ships with.
 *
 * The defect this exists for: the ledger was derived from the tree part-way
 * through a release, later stages rewrote the pages it had just hashed, and the
 * ledger was committed alongside the pages it no longer described. At
 * 6aac79a2e that was 1,900 of 2,223 URLs. Nothing failed at the point the bad
 * ledger was produced. What failed, days later, was an 8-URL sample inside
 * `sitemap:lastmod:self-test` on whatever branch happened to run next - which
 * is why several branches each spent time on a defect none of them introduced.
 *
 * Three things are asserted, all HARD_FAIL:
 *
 *  A. Published truth. The ledger AS COMMITTED at HEAD must hash every page AS
 *     COMMITTED at HEAD. The committed tree is what is deployed, so this is the
 *     statement the sitemap actually makes to a crawler. It is independent of
 *     whatever a build has done to the working tree, so it is neither vacuous
 *     nor noisy, and it reproduces the 6aac79a2e failure exactly.
 *
 *  B. Derivation ordering. If the ledger on disk differs from the one at HEAD -
 *     i.e. this run re-derived it - then it must match the working tree exactly.
 *     A freshly derived ledger that already disagrees with the tree can only
 *     mean the derivation ran before a stage that mutates page HTML. That is
 *     the ordering defect, caught at the moment it is produced.
 *
 *  C. Lane ordering. In the content-release lane every mode ends by deriving the
 *     ledger. If a stage is ever appended after it, the ledger goes back to
 *     being stale-by-construction, so the topology is checked statically.
 *
 * Rule 0: examining zero pages is a failure, not a pass. An empty ledger, a
 * ledger whose records carry no source_file, or a tree with no sitemaps would
 * otherwise sail through every loop above.
 *
 * TWO SCOPES, because arm A judges a commit and a pre-commit gate has not made
 * one yet.
 *
 *   LASTMOD_LEDGER_SCOPE=committed (default) - the post-commit gate. Every arm
 *     as described above. This is what Validate Repo runs, and it is unchanged.
 *
 *   LASTMOD_LEDGER_SCOPE=pending - the pre-commit gate, used by
 *     .github/scripts/converge_tree_before_commit.sh. Here HEAD is the commit
 *     being REPLACED, so arm A read literally would fail every lane that is in
 *     the middle of repairing a stale ledger - it would block the one commit
 *     that fixes main. Rather than skip it, arm A is sharpened: a page the
 *     committed ledger misdescribes is acceptable ONLY if this run is rewriting
 *     that page, i.e. the commit about to be made repairs it. A page the
 *     committed ledger misdescribes that this run does NOT touch is a stale
 *     record this commit would carry forward untouched, and stays a hard error.
 *     That is strictly stronger than skipping arm A, and it is why this mode is
 *     not a loosened gate. Pending mode additionally REQUIRES arm B to have run:
 *     a pre-commit check that did not re-derive the ledger has proved nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, LEDGER_PATH, contentHash, parseSitemaps, fileForLoc } from '../lib/sitemap_ledger.mjs';

const LANE_FILE = 'data/workflows/workflow_topology.json';
const LANE = 'spry-content-release';
const DERIVE_STAGE = 'sitemap:lastmod:content';
const OUT = process.env.LASTMOD_LEDGER_FINAL_OUT || 'artifacts/validation/lastmod-ledger-final.json';
const SCOPE = process.env.LASTMOD_LEDGER_SCOPE === 'pending' ? 'pending' : 'committed';

const errors = [];
const notes = [];

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 * 512, ...opts });
}
const inGitRepo = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' }).status === 0;

/** Visible-text hash of every requested `HEAD:<file>` blob, in one batch read. */
function hashAtHead(files) {
  const out = new Map();
  if (!files.length) return out;
  const res = spawnSync('git', ['cat-file', '--batch'], {
    cwd: ROOT, input: files.map((f) => `HEAD:${f}`).join('\n') + '\n', maxBuffer: 1024 * 1024 * 512,
  });
  if (res.status !== 0 || !res.stdout) return out;
  const buf = res.stdout;
  let off = 0;
  for (const f of files) {
    const nl = buf.indexOf(0x0a, off);
    if (nl < 0) break;
    const header = buf.subarray(off, nl).toString('utf8');
    const size = Number(header.split(' ')[2]);
    if (!Number.isFinite(size)) { out.set(f, null); off = nl + 1; continue; }
    out.set(f, contentHash(buf.subarray(nl + 1, nl + 1 + size).toString('utf8')));
    off = nl + 1 + size + 1;
  }
  return out;
}

// ------------------------------------------------------------------ load state

const ledgerFile = path.join(ROOT, LEDGER_PATH);
const ledgerTextOnDisk = (() => { try { return fs.readFileSync(ledgerFile, 'utf8'); } catch { return null; } })();
const ledgerOnDisk = (() => { try { return JSON.parse(ledgerTextOnDisk); } catch { return null; } })();
if (!ledgerOnDisk) errors.push(`no readable ledger at ${LEDGER_PATH}; run \`npm run sitemap:lastmod:content\``);

const ledgerTextAtHead = (() => {
  if (!inGitRepo) return null;
  try { return git(['show', `HEAD:${LEDGER_PATH}`]); } catch { return null; }
})();

// ------------------------------------------------ A. the committed ledger vs HEAD

let armA = { ran: false, pages_examined: 0, mismatched: 0, examples: [] };
if (inGitRepo && ledgerTextAtHead) {
  let committed = null;
  try { committed = JSON.parse(ledgerTextAtHead); } catch { errors.push('the ledger committed at HEAD is not valid JSON'); }
  if (committed) {
    const records = (committed.urls || []).filter((u) => u.source_file && u.content_sha256);
    const hashes = hashAtHead(records.map((r) => r.source_file));
    const bad = [];
    let examined = 0;
    for (const r of records) {
      const got = hashes.get(r.source_file);
      if (got == null) continue;   // page absent from HEAD; the coverage arm speaks to that
      examined += 1;
      if (got !== r.content_sha256) bad.push({ file: r.source_file, ledger: r.content_sha256, head: got, lastmod: r.lastmod });
    }
    armA = { ran: true, scope: SCOPE, pages_examined: examined, mismatched: bad.length, examples: bad.slice(0, 10) };
    if (bad.length && SCOPE === 'committed') {
      errors.push(
        `${bad.length} of ${examined} committed page(s) do not match the ledger committed alongside them. `
        + 'The ledger was derived before a stage that rewrote these pages. Re-derive with '
        + '`npm run sitemap:lastmod:content` AFTER the last stage that mutates page HTML, and commit the result with the pages.',
      );
    } else if (bad.length) {
      // Pending scope. HEAD is the commit being replaced. A misdescribed page
      // this run is rewriting will be correct in the commit about to be made;
      // one it is NOT rewriting is a stale record this commit carries forward.
      const pending = (() => {
        try {
          return new Set(
            git(['status', '--porcelain', '--untracked-files=all'])
              .split('\n').filter(Boolean)
              .map((l) => l.slice(3).replace(/.* -> /, '')),
          );
        } catch { return null; }
      })();
      if (!pending) {
        errors.push('pending scope could not read the pending change set, so it could not tell a repaired stale record from one being carried forward');
      } else {
        const carried = bad.filter((b) => !pending.has(b.file));
        armA.repaired_by_this_run = bad.length - carried.length;
        armA.carried_forward = carried.length;
        armA.examples = carried.slice(0, 10);
        if (carried.length) {
          errors.push(
            `${carried.length} of ${bad.length} page(s) the committed ledger misdescribes are NOT being rewritten by this run, `
            + 'so the commit about to be made carries those stale records forward. Re-derive with '
            + '`npm run sitemap:lastmod:content` AFTER the last stage that mutates page HTML.',
          );
        } else {
          notes.push(`arm A (pending scope): all ${bad.length} page(s) the committed ledger misdescribes are rewritten by this run, so this commit repairs them`);
        }
      }
    }
    if (records.length && examined === 0) {
      errors.push('the ledger committed at HEAD names pages that HEAD does not contain; nothing was verified');
    }
  }
} else {
  notes.push('arm A skipped: no ledger at HEAD (new file, or not a git checkout)');
}

// ------------------------------- B. a ledger re-derived in this run must fit the tree

let armB = { ran: false, pages_examined: 0, mismatched: 0, examples: [] };
if (ledgerOnDisk && ledgerTextOnDisk !== null && ledgerTextAtHead !== null && ledgerTextOnDisk !== ledgerTextAtHead) {
  const records = (ledgerOnDisk.urls || []).filter((u) => u.source_file && u.content_sha256);
  const bad = [];
  let examined = 0;
  for (const r of records) {
    let text;
    try { text = fs.readFileSync(path.join(ROOT, r.source_file), 'utf8'); } catch { continue; }
    examined += 1;
    if (contentHash(text) !== r.content_sha256) bad.push({ file: r.source_file, ledger: r.content_sha256, disk: contentHash(text) });
  }
  armB = { ran: true, pages_examined: examined, mismatched: bad.length, examples: bad.slice(0, 10) };
  if (bad.length) {
    errors.push(
      `the ledger was re-derived in this run yet already disagrees with the working tree on ${bad.length} of ${examined} page(s). `
      + 'A stage that mutates page HTML ran after the derivation; move the derivation after it.',
    );
  }
  if (examined === 0) errors.push('the ledger was re-derived but describes no readable page; nothing was verified');
} else {
  notes.push('arm B skipped: the ledger on disk is the one committed at HEAD (nothing re-derived in this run)');
}

// --------------------------------------------- coverage: sitemaps vs ledger

// Coverage is judged against the SAME reference as the record check above, or it
// reports a defect that does not exist. When nothing was re-derived, the ledger
// on disk is the committed one and it must be judged against the committed
// sitemaps and the committed page set - a build that has since added nine pages
// to the working tree's sitemap says nothing about what shipped. When the ledger
// WAS re-derived in this run, the working tree is the thing it claims to
// describe, so that is what it is measured against.
const coverage = { reference: null, sitemap_urls: 0, resolvable: 0, missing_from_ledger: 0, lastmod_disagreements: 0, examples: [] };

/** Paths tracked at HEAD, for resolving a <loc> without touching the working tree. */
function headPaths() {
  try { return new Set(git(['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter(Boolean)); } catch { return null; }
}
function fileForLocIn(paths, loc) {
  const rel = String(loc).replace(/^https?:\/\/[^/]+\/?/, '').replace(/[?#].*$/, '').replace(/\/$/, '');
  for (const c of (rel ? [`${rel}/index.html`, `${rel}.html`, rel] : ['index.html'])) if (paths.has(c)) return c;
  return '';
}
/** Sitemaps as committed at HEAD, parsed the same way parseSitemaps() parses disk. */
function parseSitemapsAtHead(paths) {
  const files = [...paths].filter((f) => /(^|\/)sitemap[^/]*\.xml$/i.test(f) && !/^(node_modules|\.build|\.pages-output|dist)\//.test(f));
  const out = [];
  for (const f of files) {
    let text;
    try { text = git(['show', `HEAD:${f}`]); } catch { continue; }
    const entries = [...text.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
      loc: (m[1].match(/<loc>(.*?)<\/loc>/) || [])[1] || '',
      lastmod: (m[1].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null,
    })).filter((e) => e.loc);
    out.push({ rel: f, entries });
  }
  return out;
}

{
  const useHead = !armB.ran && inGitRepo && ledgerTextAtHead;
  const paths = useHead ? headPaths() : null;
  const ledgerForCoverage = useHead ? JSON.parse(ledgerTextAtHead) : ledgerOnDisk;
  const maps = useHead && paths ? parseSitemapsAtHead(paths) : (ledgerOnDisk ? parseSitemaps() : []);
  const resolve = useHead && paths ? ((loc) => fileForLocIn(paths, loc)) : fileForLoc;
  coverage.reference = useHead && paths ? 'the tree at HEAD' : 'the working tree';
  if (ledgerForCoverage) {
    const byUrl = new Map((ledgerForCoverage.urls || []).map((u) => [u.url, u]));
    const seen = new Set();
    const missing = [];
    const disagree = [];
    for (const sm of maps) {
      for (const e of sm.entries) {
        if (seen.has(e.loc)) continue;
        seen.add(e.loc);
        coverage.sitemap_urls += 1;
        if (!resolve(e.loc)) continue;   // no file to derive from; the generator leaves these alone
        coverage.resolvable += 1;
        const rec = byUrl.get(e.loc);
        if (!rec) { missing.push(e.loc); continue; }
        if (rec.lastmod && e.lastmod && rec.lastmod !== e.lastmod) disagree.push({ loc: e.loc, sitemap: e.lastmod, ledger: rec.lastmod });
      }
    }
    coverage.missing_from_ledger = missing.length;
    coverage.lastmod_disagreements = disagree.length;
    coverage.examples = [...missing.slice(0, 5).map((loc) => ({ loc, problem: 'absent from the ledger' })), ...disagree.slice(0, 5)];
    if (missing.length) errors.push(`${missing.length} sitemap URL(s) in the ${coverage.reference} resolve to a page but have no ledger record; the ledger was derived from a smaller tree than the one it describes`);
    if (disagree.length) errors.push(`${disagree.length} sitemap URL(s) in the ${coverage.reference} publish a lastmod the ledger contradicts`);
  }
}

// ---------------------------------------------------- C. the release lane derives last

let laneOrdering = { ran: false, modes_checked: 0, offenders: [] };
try {
  const topo = JSON.parse(fs.readFileSync(path.join(ROOT, LANE_FILE), 'utf8'));
  const lane = topo.canonical_lanes?.[LANE];
  if (lane?.stages_by_mode) {
    const offenders = [];
    let n = 0;
    for (const [mode, stages] of Object.entries(lane.stages_by_mode)) {
      n += 1;
      const labels = stages.map((s) => s.label);
      const idx = labels.lastIndexOf(DERIVE_STAGE);
      if (idx < 0) offenders.push({ mode, problem: 'does not derive the ledger; it ships whatever the previous release left behind' });
      else if (idx !== labels.length - 1) offenders.push({ mode, problem: `derives the ledger at stage ${idx + 1} of ${labels.length}; ${labels.slice(idx + 1).join(', ')} run after it and can rewrite the pages it just hashed` });
    }
    laneOrdering = { ran: true, modes_checked: n, offenders };
    if (!n) errors.push(`${LANE_FILE}: lane ${LANE} declares no modes; the ordering check verified nothing`);
    for (const o of offenders) errors.push(`${LANE}/${o.mode}: ${o.problem}`);
  } else {
    errors.push(`${LANE_FILE}: lane ${LANE} has no stages_by_mode; the ordering check verified nothing`);
  }
} catch (e) {
  errors.push(`${LANE_FILE}: unreadable (${e.message}); the ordering check verified nothing`);
}

// ------------------------------------------------------------------ Rule 0

const pagesExamined = armA.pages_examined + armB.pages_examined;
if (pagesExamined === 0) errors.push('no page was examined against the ledger; this validator refuses to pass on an empty loop (Rule 0)');
// A pre-commit run that did not re-derive the ledger proved nothing: arm A is
// deliberately forgiving in this scope, so arm B is the arm doing the work.
if (SCOPE === 'pending' && !armB.ran) {
  errors.push('pending scope ran without re-deriving the ledger (arm B did not run), so the only arm that judges the tree about to be committed verified nothing (Rule 0)');
}
if (coverage.resolvable === 0) errors.push('no sitemap URL resolved to a page on disk; the coverage check verified nothing (Rule 0)');

// ------------------------------------------------------------------- report

const report = {
  schema_version: '1.0',
  status: errors.length ? 'FAIL' : 'PASS',
  scope: SCOPE,
  ledger: LEDGER_PATH,
  pages_examined: pagesExamined,
  committed_ledger_vs_committed_tree: armA,
  rederived_ledger_vs_working_tree: armB,
  sitemap_coverage: coverage,
  lane_derivation_ordering: laneOrdering,
  notes,
  errors,
};
fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error(`[validate:lastmod-ledger-final] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 20)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[validate:lastmod-ledger-final] PASS (${SCOPE} scope): ${pagesExamined} page(s) hashed against the ledger; ${coverage.resolvable} sitemap URL(s) covered; ${laneOrdering.modes_checked} release mode(s) derive the ledger last.`);
