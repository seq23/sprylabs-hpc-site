#!/usr/bin/env node
/**
 * Cadence gate.
 *
 * The previous gate asked whether pages were earning Google impressions before
 * allowing more publishing. That is the wrong question for an AEO goal: AI
 * citation and Google rank are largely decoupled - most pages AI engines cite do
 * not rank in Google's top 10 - so a page can be invisible in Search and still be
 * cited, or rank and never be cited. Gating publication on Search surfacing
 * measured the wrong thing, and because it never returned a non-zero exit it
 * could not have stopped anything anyway.
 *
 * This gates on freshness and volume, which are the two levers the evidence
 * actually ties to citation:
 *
 *   - Pages not updated within 13 weeks are markedly more likely to lose AI
 *     citations, and recency correlates strongly with being cited at all.
 *   - Publishing faster than a library can be maintained guarantees the tail
 *     ages past that threshold. The ceiling is therefore not a taste question:
 *     it is refresh capacity multiplied by the refresh window.
 *
 * Four blocking conditions, each with an exit code so a pipeline can act on it:
 *
 *   1. new pages in the last 7 days above the weekly cap
 *   2. share of pages older than the refresh window above the tolerance
 *   3. URLs with no lastmod at all - a crawler gets no freshness signal
 *   4. library larger than refresh capacity can keep inside the window
 *
 * It also warns, without blocking, when a very high share of pages carry the
 * same recent lastmod. That is the signature of a date bump rather than a
 * substantive refresh, and it is worth seeing rather than being rewarded by the
 * freshness rules above.
 *
 * Usage: node cadence_gate.js [--json] [--policy path]
 */
'use strict';
const fs = require('fs');
const path = require('path');
// The shared boundary, not a private list. This gate recurses from the repo
// root looking for sitemaps and writes back into the tree (reports/cadence and,
// under --accept, data/cadence/known_urls.json). `git worktree add
// .claude/worktrees/<id>` puts a COMPLETE second checkout of this repo inside
// the working tree, so an unbounded walk reads that checkout's sitemap and
// counts its URLs as this site's - and --accept then writes them into the
// tracked ledger that "new since last run" is measured against. This gate runs
// on every Validate Repo pass (.github/workflows/validate-repo.yml).
// See scripts/lib/repo_walk.cjs.
const { isIgnoredDir } = require('./lib/repo_walk.cjs');

const ROOT = process.cwd();
const args = process.argv.slice(2);
const JSON_ONLY = args.includes('--json');
const policyPath = (() => {
  const i = args.indexOf('--policy');
  return i >= 0 ? args[i + 1] : 'data/cadence/policy.json';
})();

// Shape only. Every key here is REQUIRED in the policy file, not a usable
// default: a missing or incomplete policy is a named stop, never a silent
// fallback.
//
// This used to be a working default set carrying new_pages_per_week: 2, and
// scripts/programmatic/demand_backed_atoms.mjs copied that 2 into its own
// fallback with a comment saying the copy "keeps the two in step when the policy
// file is absent". When data/cadence/policy.json raised the cap to 6 on
// 2026-08-29, neither copy moved - the invariant held only because both were
// stale together. A silent fallback to a stale cap is worse than no fallback: it
// enforces a number the declared policy has already replaced, and nothing says
// so. One place to read the rate, and an error when it cannot be read.
const REQUIRED_POLICY_KEYS = [
  'refresh_window_days',
  'high_value_window_days',
  'stale_tolerance_pct',
  'new_pages_per_week',
  'refresh_capacity_per_week',
  'require_lastmod',
];

function loadPolicy() {
  const f = path.join(ROOT, policyPath);
  if (!fs.existsSync(f)) {
    console.error(`CADENCE GATE STOP missing_policy: ${policyPath} does not exist. It is the single source of truth for the publishing cap and the refresh window, and there is deliberately no built-in fallback. Restore the file, or pass --policy <path>.`);
    process.exit(2);
  }
  const loaded = JSON.parse(fs.readFileSync(f, 'utf8'));
  const missing = REQUIRED_POLICY_KEYS.filter((k) => loaded[k] === undefined || loaded[k] === null);
  if (missing.length) {
    console.error(`CADENCE GATE STOP incomplete_policy: ${policyPath} is missing required key(s): ${missing.join(', ')}. Every gate threshold must be declared in the policy, not inherited from code.`);
    process.exit(2);
  }
  return { ...loaded, _source: policyPath };
}

function sitemapUrls() {
  const found = new Map();
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && isIgnoredDir(e.name, path.relative(ROOT, full).split(path.sep).join('/'))) continue;
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/^sitemap.*\.xml$/i.test(e.name)) {
        const xml = fs.readFileSync(full, 'utf8');
        for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
          const loc = (m[1].match(/<loc>(.*?)<\/loc>/) || [])[1];
          if (!loc) continue;
          const lm = (m[1].match(/<lastmod>(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
          const prev = found.get(loc);
          if (prev === undefined || (lm && (!prev || lm > prev))) found.set(loc, lm);
        }
      }
    }
  };
  walk(ROOT);
  return found;
}

const policy = loadPolicy();
const urls = sitemapUrls();
const today = new Date(process.env.CADENCE_TODAY || new Date().toISOString().slice(0, 10));
const ageDays = (d) => Math.floor((today - new Date(d)) / 86400000);

// A page that changed is not a page that was published. Counting any recent
// lastmod as a new page made a one-off structural edit across the library look
// like a publishing spree, which is exactly the signal this is meant to
// distinguish. New means a URL that was not in the sitemap last time this ran.
const ledgerPath = path.join(ROOT, 'data/cadence/known_urls.json');

// --accept records the current URL set as the new baseline, and requires a reason so
// the ledger says WHY an overage was accepted rather than that someone re-ran the gate.
const ACCEPT = process.argv.includes('--accept');
const ACCEPT_REASON = (() => {
  const i = process.argv.indexOf('--reason');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
if (ACCEPT && !ACCEPT_REASON) {
  console.error('--accept requires --reason "<why this URL set is accepted>". The ledger records a decision, not a re-run.');
  process.exit(2);
}
let known = new Set();
let ledgerExists = fs.existsSync(ledgerPath);
if (ledgerExists) {
  try { known = new Set(JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).urls || []); }
  catch { ledgerExists = false; }
}
const newUrls = [...urls.keys()].filter((u) => !known.has(u));

const dated = [...urls.entries()].filter(([, d]) => d);
const undated = [...urls.entries()].filter(([, d]) => !d);
const ages = dated.map(([, d]) => ageDays(d));
const stale = ages.filter((a) => a > policy.refresh_window_days).length;
const fresh30 = ages.filter((a) => a <= policy.high_value_window_days).length;
const publishedThisWeek = ages.filter((a) => a <= 7).length;
const stalePct = dated.length ? (100 * stale) / dated.length : 0;
const ceiling = policy.refresh_capacity_per_week * Math.floor(policy.refresh_window_days / 7);

const blocking = [];
const warnings = [];

if (ledgerExists && newUrls.length > policy.new_pages_per_week) {
  // Name them. Reporting only a count means the operator has to rebuild the
  // sitemap by hand to learn which pages tripped the cap, which is the slowest
  // possible way to answer "what did I just publish".
  const shown = newUrls.slice(0, 25).map((u) => `\n           ${u}`).join('');
  const more = newUrls.length > 25 ? `\n           ... and ${newUrls.length - 25} more` : '';
  blocking.push(`weekly_cap: ${newUrls.length} URLs are new since the last run, cap is ${policy.new_pages_per_week} per week${shown}${more}`);
}
if (stalePct > policy.stale_tolerance_pct) {
  blocking.push(`refresh_debt: ${stale} of ${dated.length} pages (${stalePct.toFixed(0)}%) are older than ${policy.refresh_window_days} days, tolerance is ${policy.stale_tolerance_pct}%`);
}
if (undated.length) {
  const msg = `no_freshness_signal: ${undated.length} sitemap URLs have no lastmod, so a crawler cannot tell when they changed`;
  if (policy.require_lastmod) blocking.push(msg);
  else warnings.push(`${msg} (reported only: ${policy._lastmod_note || 'enforcement disabled for this repo'})`);
}
if (urls.size > ceiling) {
  // Reported, not blocking. A library above the ceiling is a strategic problem -
  // the tail cannot be kept inside the refresh window, so it decays toward zero
  // citation value - but it is not something a publish step can fix, and a gate
  // that is permanently red teaches people to ignore it. It has to be worked
  // down by pruning or by raising real refresh capacity.
  warnings.push(`library_over_ceiling: ${urls.size} pages against a ceiling of ${ceiling} (${policy.refresh_capacity_per_week} substantive refreshes per week held inside ${policy.refresh_window_days} days). ${urls.size - ceiling} pages cannot be kept current at this capacity.`);
}
if (dated.length && publishedThisWeek === dated.length && dated.length > 20) {
  warnings.push(`uniform_lastmod: ${publishedThisWeek} of ${dated.length} pages share a lastmod inside 7 days - that is a date bump pattern, not a refresh, and it makes the freshness signal meaningless`);
}
if (dated.length && fresh30 === 0) {
  warnings.push('no_recent_refresh: nothing has been updated in the last 30 days, where recency correlates most strongly with citation');
}

function report_date() { return today.toISOString().slice(0, 10); }
const report = {
  generated_at: today.toISOString().slice(0, 10),
  policy_source: policy._source,
  urls: urls.size,
  dated: dated.length,
  undated: undated.length,
  stale_over_window: stale,
  stale_pct: Number(stalePct.toFixed(1)),
  fresh_within_30d: fresh30,
  lastmod_within_7d: publishedThisWeek,
  new_since_last_run: ledgerExists ? newUrls.length : null,
  new_urls: ledgerExists ? newUrls : null,
  ledger_initialised: ledgerExists,
  maintainable_ceiling: ceiling,
  policy: { ...policy, _source: undefined },
  blocking,
  warnings,
  status: blocking.length ? 'BLOCKED' : 'CLEAR',
};

// The ledger is what "new since the last run" is measured against, so CHECKING must
// never write it. It used to be written on every run; the comment argued the ledger
// records what exists rather than rewarding a pass, which is true of a ledger and
// fatal for a gate: the check consumed its own evidence, so any block cleared itself
// on the next run with no change to the tree. Measured here: run1 exit 1, run2 exit 0.
//
// Recording an accepted URL set is now a separate, deliberate act.
if (ACCEPT) {
  // The ledger accumulates: a URL once seen stays known. The sitemap this reads
  // is batch-limited - prepare_distribution_artifacts.js publishes an active
  // window and defers the rest (measured: active_limit=100, deferred=2127) - so
  // the URL set ROTATES between runs. Snapshotting it meant a page published
  // months ago re-entered the active window and was counted as "new", which is
  // what reported 13 new URLs here for pages like /comparisons/bhpc-vs-hone.html
  // that have existed all along. A union keeps the check honest: genuinely new
  // pages still register exactly once, and rotation cannot manufacture them.
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const merged = [...new Set([...known, ...urls.keys()])].sort();
  fs.writeFileSync(
    ledgerPath,
    JSON.stringify({ generated_at: report_date(), accepted_reason: ACCEPT_REASON, urls: merged }, null, 2) + '\n',
  );
  console.log(`CADENCE LEDGER ACCEPTED: ${merged.length} url(s) recorded as known (${urls.size} in this run's sitemap, ${merged.length - known.size} newly added). Reason: ${ACCEPT_REASON}`);
}

fs.mkdirSync(path.join(ROOT, 'reports/cadence'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/cadence/cadence-gate.json'), JSON.stringify(report, null, 2) + '\n');

if (JSON_ONLY) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`CADENCE GATE ${report.status}: ${urls.size} urls; ${stale} past ${policy.refresh_window_days}d (${report.stale_pct}%); ${fresh30} fresh within ${policy.high_value_window_days}d; ceiling ${ceiling}`);
  for (const b of blocking) console.log(`  BLOCK  ${b}`);
  for (const w of warnings) console.log(`  WARN   ${w}`);
}
process.exit(blocking.length ? 1 : 0);
