#!/usr/bin/env node
/**
 * Search Readiness item i9: the weekly outcome report.
 *
 * "Without a report nobody notices a drop for a month. Without self-closing
 * issues the list rots."
 *
 * Week-over-week, per site, from the measurements this repository already
 * collects - never from numbers invented here:
 *
 *   data/search_intelligence/gsc_truth.json          impressions, clicks, rows
 *                                                    per site, per export window
 *   data/search_intelligence/<host>/index_coverage.json
 *                                                    sitemap URL count, how many
 *                                                    URLs have been inspected,
 *                                                    errors, state, named stop
 *
 * The prior week comes from GIT, not from a file this report keeps. The
 * search-intelligence lane commits gsc_truth.json and each index_coverage.json
 * every day, so the repository already holds a dated snapshot of every
 * measurement; the comparison reads the newest commit at least seven days old
 * that touched gsc_truth.json and reads those same files at that commit.
 *
 * That choice is deliberate. A history file this workflow wrote would have to be
 * committed back to main to survive, which would make a read-only reporter into
 * a main writer and route it through the tree-convergence helper built for the
 * content lanes. Reading the collector's own committed history needs no write
 * at all, and there is exactly one source of truth for every number.
 *
 * It requires full history in the checkout (fetch-depth: 0). With a shallow
 * clone no prior commit is reachable, and the report says `prior_week: null`
 * and shows no deltas rather than quietly reporting a week-over-week of zero -
 * a delta against nothing is a fabricated number, and this report exists to be
 * trusted. validate:weekly-outcome-report fails a workflow that forgets the
 * depth, because that silently turns every delta off.
 *
 * A site is RED on a declared rule, not on a feeling:
 *   - its index coverage carries a named stop, or its state is not OK; or
 *   - the collector reported errors this run; or
 *   - impressions fell by more than IMPRESSION_DROP_RED (50%) against the prior
 *     week, measured only when the prior week had at least MIN_BASE (20)
 *     impressions, so single-digit noise cannot turn a site red.
 *
 * The workflow emails the report through Resend when a key is configured and
 * files one self-closing issue per red site either way. Nothing here waits on a
 * human: with no key the report and the issues still land.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const GSC_TRUTH = 'data/search_intelligence/gsc_truth.json';
const REPORT = 'reports/weekly_outcome_report.json';
const SUMMARY = 'reports/weekly_outcome_report.md';

export const IMPRESSION_DROP_RED = 0.5;
export const MIN_BASE = 20;

function readJson(rel, fallback = null) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(rel, value) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** ISO week key, e.g. 2026-W43. The report is addressed by week, not by date. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current ISO week determines the year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** sc-domain:example.com and https://example.com/ both name the host example.com. */
export function hostOf(siteUrl) {
  const raw = String(siteUrl || '');
  if (raw.startsWith('sc-domain:')) return raw.slice('sc-domain:'.length);
  try {
    return new URL(raw).host;
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** The file's contents at a commit, or null when it is not reachable there. */
function showJson(commit, rel) {
  const raw = commit ? git(['show', `${commit}:${rel}`]) : '';
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * The newest commit at least `days` old that touched the collector's output.
 * Returns null on a shallow clone or a repository with no such commit, which is
 * reported as "no prior week" rather than guessed at.
 */
export function priorCommit(now, days = 7) {
  const before = new Date(now.getTime() - days * 86400000).toISOString();
  const sha = git(['log', '-1', `--before=${before}`, '--format=%H', '--', GSC_TRUTH]);
  if (!sha) return null;
  const when = git(['log', '-1', '--format=%cI', sha]);
  return { sha, date: when ? new Date(when) : null };
}

/** One measured row per site, from the collectors' own output. */
export function collectSites(commit = null) {
  const truth = (commit ? showJson(commit, GSC_TRUTH) : readJson(GSC_TRUTH, {})) || {};
  const sites = new Map();
  for (const exp of truth.exports || []) {
    const host = hostOf(exp.site_url);
    if (!host) continue;
    sites.set(host, {
      site: host,
      impressions: Number(exp.raw_impressions ?? 0),
      clicks: Number(exp.raw_clicks ?? 0),
      queries: Number(exp.raw_distinct_query_count ?? 0),
      window_end: exp.end_date || null,
      gsc_data_state: exp.data_state || truth.data_state || null,
    });
  }
  for (const [host, row] of sites) {
    const rel = `data/search_intelligence/${host}/index_coverage.json`;
    const coverage = commit ? showJson(commit, rel) : readJson(rel);
    row.sitemap_url_count = coverage ? Number(coverage.sitemap_url_count ?? 0) : null;
    row.inspected_total = coverage ? Number(coverage.inspected_total ?? 0) : null;
    row.errors_this_run = coverage ? Number(coverage.errors_this_run ?? 0) : null;
    row.coverage_state = coverage ? coverage.state || null : null;
    row.named_stop = coverage ? coverage.named_stop ?? null : null;
  }
  return [...sites.values()].sort((a, b) => a.site.localeCompare(b.site));
}

/**
 * Why is this site red? Returns the reasons, so the issue body can state them
 * instead of asserting "red".
 */
export function redReasons(row, prior) {
  const reasons = [];
  if (row.named_stop) reasons.push(`index coverage carries a named stop: ${row.named_stop}`);
  if (row.coverage_state && row.coverage_state !== 'OK') {
    reasons.push(`index coverage state is ${row.coverage_state}, not OK`);
  }
  if (Number(row.errors_this_run) > 0) {
    reasons.push(`${row.errors_this_run} collector error(s) this run`);
  }
  if (prior && Number(prior.impressions) >= MIN_BASE) {
    const drop = (prior.impressions - row.impressions) / prior.impressions;
    if (drop > IMPRESSION_DROP_RED) {
      reasons.push(
        `impressions fell ${(drop * 100).toFixed(0)}% week over week, ${prior.impressions} to ${row.impressions}`,
      );
    }
  }
  return reasons;
}

function delta(now, before) {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  const change = Number(now) - Number(before);
  const ratio = Number(before) === 0 ? null : Number((change / Number(before)).toFixed(4));
  return { from: Number(before), to: Number(now), change, ratio };
}

export function buildReport(now = new Date()) {
  const week = isoWeek(now);
  const sites = collectSites();

  // The prior week is the collector's own committed snapshot, read from git.
  const prior = priorCommit(now);
  const priorSites = prior ? collectSites(prior.sha) : [];
  const priorByHost = new Map(priorSites.map((s) => [s.site, s]));
  const priorWeekKey = prior?.date ? isoWeek(prior.date) : null;

  const rows = sites.map((row) => {
    const was = priorByHost.get(row.site) || null;
    const reasons = redReasons(row, was);
    return {
      ...row,
      status: reasons.length ? 'RED' : 'OK',
      red_reasons: reasons,
      week_over_week: was
        ? {
            impressions: delta(row.impressions, was.impressions),
            clicks: delta(row.clicks, was.clicks),
            queries: delta(row.queries, was.queries),
            inspected_total: delta(row.inspected_total, was.inspected_total),
          }
        : null,
    };
  });

  const report = {
    schema_version: '1.0',
    report: 'weekly-outcome-report',
    week,
    prior_week: priorWeekKey,
    prior_commit: prior ? prior.sha : null,
    comparison_basis: prior
      ? `data/search_intelligence committed at ${prior.sha.slice(0, 9)}`
      : 'none reachable: shallow clone or no commit at least seven days old',
    generated_at: now.toISOString(),
    red_rule: {
      impression_drop_ratio: IMPRESSION_DROP_RED,
      minimum_prior_impressions: MIN_BASE,
      also_red_on: ['named_stop', 'coverage_state != OK', 'errors_this_run > 0'],
    },
    site_count: rows.length,
    red_sites: rows.filter((r) => r.status === 'RED').map((r) => r.site),
    sites: rows,
  };
  writeJson(REPORT, report);

  const lines = [
    `# Weekly outcome report, ${week}`,
    '',
    priorWeekKey
      ? `Week over week against ${priorWeekKey}, measured from ${report.comparison_basis}.`
      : 'No prior week is reachable in this checkout, so no deltas are shown.',
    '',
    '| Site | Impressions | Clicks | Queries | Indexed/inspected | Status |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const wow = (key) => {
      const d = r.week_over_week?.[key];
      if (!d) return '';
      const sign = d.change > 0 ? '+' : '';
      return ` (${sign}${d.change})`;
    };
    lines.push(
      `| ${r.site} | ${r.impressions}${wow('impressions')} | ${r.clicks}${wow('clicks')} | ` +
        `${r.queries}${wow('queries')} | ${r.inspected_total ?? '-'} of ${r.sitemap_url_count ?? '-'} | ${r.status} |`,
    );
  }
  const red = rows.filter((r) => r.status === 'RED');
  if (red.length) {
    lines.push('', '## Red sites', '');
    for (const r of red) for (const reason of r.red_reasons) lines.push(`- **${r.site}**: ${reason}`);
  } else {
    lines.push('', 'No site is red this week.');
  }
  fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, SUMMARY), `${lines.join('\n')}\n`, 'utf8');
  return report;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  // A report over zero sites is not a quiet week, it is a broken collector, and
  // it must not exit 0 having said nothing (Rule 0).
  const report = buildReport();
  if (!report.site_count) {
    console.error(
      '[report:weekly-outcome] FAIL: no site produced a measurement. ' +
        `Expected one row per export in ${GSC_TRUTH}; a weekly report over zero sites proves nothing.`,
    );
    process.exit(1);
  }
  console.log(
    `[report:weekly-outcome] OK: ${report.week} covers ${report.site_count} site(s); ` +
      `prior week ${report.prior_week || 'none'}; red ${report.red_sites.length ? report.red_sites.join(', ') : 0}`,
  );
}
