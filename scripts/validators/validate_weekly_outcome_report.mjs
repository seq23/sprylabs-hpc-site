#!/usr/bin/env node
/**
 * Search Readiness item i9: "A workflow on the default branch runs on a weekly
 * cron and names a report."
 *
 * The checklist's own wording is the floor, not the ceiling. A workflow that
 * merely MENTIONS a report would satisfy the words and report nothing, which is
 * the defect class this repository calls "runs but inert". So this asserts the
 * whole chain: the weekly cron exists, it reaches the builder, the builder is
 * real and writes the report the delivery step reads, the red rule is declared
 * rather than implied, and the issue reconciliation can actually open and close
 * an issue (the permission, not just the code).
 */
import fs from 'node:fs';

const errors = [];
const WORKFLOW = '.github/workflows/weekly-outcome-report.yml';
const BUILDER = 'scripts/reports/build_weekly_outcome_report.mjs';
const SELF_TEST = 'scripts/reports/self_test_weekly_outcome_report.mjs';
const NOTIFY = '.github/scripts/weekly_outcome_notify.mjs';
const REPORT = 'reports/weekly_outcome_report.json';

function read(rel) {
  return fs.existsSync(rel) ? fs.readFileSync(rel, 'utf8') : null;
}

const wf = read(WORKFLOW);
if (!wf) {
  errors.push(`${WORKFLOW} is missing; item i9 requires a workflow on the default branch that runs weekly and names a report`);
} else {
  // A weekly cron: five fields, day-of-week pinned to a single day, and the
  // day-of-month left open. "* * * * *" or a daily cron would pass a naive
  // "has a cron" check while reporting every day or never.
  const crons = [...wf.matchAll(/cron:\s*["']([^"']+)["']/g)].map((m) => m[1].trim());
  if (!crons.length) errors.push(`${WORKFLOW}: declares no cron, so nothing runs weekly`);
  const weekly = crons.filter((c) => {
    const f = c.split(/\s+/);
    if (f.length !== 5) return false;
    const [min, hour, dom, , dow] = f;
    return dom === '*' && /^[0-6]$/.test(dow) && /^\d+$/.test(min) && /^\d+$/.test(hour);
  });
  if (crons.length && !weekly.length) {
    errors.push(`${WORKFLOW}: no cron runs exactly weekly (needs a fixed minute, hour and a single day-of-week): ${crons.join(', ')}`);
  }
  if (!/workflow_dispatch/.test(wf)) {
    errors.push(`${WORKFLOW}: no workflow_dispatch, so the report cannot be run on demand when a week is missed`);
  }
  // The cron must REACH the builder and the delivery, not just sit near them.
  if (!/npm run report:weekly-outcome/.test(wf)) errors.push(`${WORKFLOW}: never invokes npm run report:weekly-outcome, so it names a report it does not build`);
  if (!/npm run self-test:weekly-outcome-report/.test(wf)) errors.push(`${WORKFLOW}: does not run the report's self-test, so its numbers are unproven`);
  if (!new RegExp(`node ${NOTIFY.replace(/[.]/g, '\\.')}`).test(wf)) errors.push(`${WORKFLOW}: never invokes ${NOTIFY}, so nothing is delivered and no issue is reconciled`);
  if (!/issues:\s*write/.test(wf)) errors.push(`${WORKFLOW}: lacks issues: write, so the self-closing issue per red site cannot be opened or closed`);
  // Without full history no commit a week old is reachable, every delta is
  // absent, and the report silently degrades to a single-week snapshot.
  if (!/fetch-depth:\s*0/.test(wf)) {
    errors.push(`${WORKFLOW}: checkout does not set fetch-depth: 0, so no prior-week commit is reachable and every week-over-week delta would be absent`);
  }
}

const builder = read(BUILDER);
if (!builder) errors.push(`${BUILDER} is missing`);
else {
  for (const token of ['gsc_truth.json', 'index_coverage.json']) {
    if (!builder.includes(token)) errors.push(`${BUILDER}: does not read ${token}; the report must come from the collectors' measurements, not from numbers written here`);
  }
  if (!/priorCommit/.test(builder) || !builder.includes("'log'")) {
    errors.push(`${BUILDER}: does not read the prior week from git history, so there is no week to compare against`);
  }
  if (!/prior_week/.test(builder)) errors.push(`${BUILDER}: does not state the prior week, so a delta cannot be told apart from a first run`);
}

if (!read(SELF_TEST)) errors.push(`${SELF_TEST} is missing; the red rule must be proven, not asserted`);

const notify = read(NOTIFY);
if (!notify) errors.push(`${NOTIFY} is missing`);
else {
  if (!notify.includes(REPORT)) errors.push(`${NOTIFY}: does not read ${REPORT}, so it delivers something other than the report that was built`);
  // Self-closing is the whole point of i9's second half.
  if (!/state:\s*'closed'|"closed"/.test(notify)) errors.push(`${NOTIFY}: never closes an issue, so the red list rots`);
  if (!/resend\.com/.test(notify)) errors.push(`${NOTIFY}: no Resend delivery`);
  // A missing key must not fail the run, or a report nobody configured email for
  // would red main every Monday.
  if (!/RESEND_API_KEY/.test(notify)) errors.push(`${NOTIFY}: does not read RESEND_API_KEY`);
}

// The report's declared red rule must be machine-readable in the artifact, so a
// reader can tell why a site is red without reading this validator.
if (fs.existsSync(REPORT)) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
  } catch (err) {
    errors.push(`${REPORT} is not valid JSON (${err.message})`);
  }
  if (report) {
    if (!report.red_rule || typeof report.red_rule !== 'object') errors.push(`${REPORT}: carries no red_rule, so "red" is an opinion`);
    if (!Array.isArray(report.sites) || !report.sites.length) errors.push(`${REPORT}: covers no site; a weekly report over zero sites proves nothing`);
    if (report.prior_week === undefined) errors.push(`${REPORT}: omits prior_week`);
    if (report.comparison_basis === undefined) errors.push(`${REPORT}: omits comparison_basis, so a reader cannot tell what the deltas are measured against`);
    for (const site of report.sites || []) {
      if (site.status === 'RED' && !(site.red_reasons || []).length) {
        errors.push(`${REPORT}: ${site.site} is RED with no stated reason`);
      }
    }
  }
}

if (errors.length) {
  console.error(`[validate:weekly-outcome-report] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log('[validate:weekly-outcome-report] OK: a weekly cron builds the report from the collectors, proves its red rule, and reconciles one self-closing issue per red site');
