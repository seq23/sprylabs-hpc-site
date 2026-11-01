#!/usr/bin/env node
/**
 * Delivers the weekly outcome report (Search Readiness i9).
 *
 * Two deliveries, and neither waits on a human:
 *
 *  1. NO EMAIL FROM HERE (owner, 1 Nov 2026). The workflow writes
 *     spry-weekly-summary.json (.github/scripts/spry_weekly_summary.mjs) and
 *     uploads it as the artifact `spry-weekly-summary`; Boss OS sends the ONE
 *     "Spry Labs weekly" email on Wednesday at 08:15 Central with a short
 *     section for this site. The Resend send that lived here is gone.
 *
 *  2. One SELF-CLOSING issue per red site. Red this week and no open issue ->
 *     open one. Red again -> comment on the existing one rather than open a
 *     second. No longer red -> the issue closes itself with the measurement that
 *     cleared it. That is what keeps the list from rotting.
 *
 * Issues are matched by a marker in the body, not by title text, so retitling
 * an issue by hand never orphans it.
 */
import fs from 'node:fs';

const REPORT = 'reports/weekly_outcome_report.json';
const MARKER = (site) => `<!-- weekly-outcome-report:site:${site} -->`;
const LABEL = 'weekly-outcome-report';

const token = process.env.GITHUB_TOKEN || '';
const repo = process.env.GITHUB_REPOSITORY || '';

if (!fs.existsSync(REPORT)) {
  console.error(`[weekly-outcome-notify] FAIL: ${REPORT} is missing; the report step must run before delivery.`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const summary = fs.existsSync('reports/weekly_outcome_report.md')
  ? fs.readFileSync('reports/weekly_outcome_report.md', 'utf8')
  : JSON.stringify(report, null, 2);

if (!report.site_count) {
  console.error('[weekly-outcome-notify] FAIL: the report covers no site, so there is nothing to deliver.');
  process.exit(1);
}

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function reconcileIssues() {
  if (!token || !repo) {
    console.log('[weekly-outcome-notify] no GITHUB_TOKEN/GITHUB_REPOSITORY; skipping issue reconciliation.');
    return;
  }
  const open = await gh(`/repos/${repo}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`);
  const byMarker = new Map();
  for (const issue of open) {
    const found = report.sites.find((s) => String(issue.body || '').includes(MARKER(s.site)));
    if (found) byMarker.set(found.site, issue);
  }
  const redSites = new Set(report.red_sites);

  for (const site of report.sites) {
    const issue = byMarker.get(site.site);
    if (redSites.has(site.site)) {
      const reasons = site.red_reasons.map((r) => `- ${r}`).join('\n');
      const body = `${MARKER(site.site)}\n**${site.site} is red for ${report.week}.**\n\n${reasons}\n\n${summary}`;
      if (issue) {
        await gh(`/repos/${repo}/issues/${issue.number}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: `Still red for ${report.week}.\n\n${reasons}` }),
        });
        console.log(`[weekly-outcome-notify] ${site.site}: still red, commented on #${issue.number}`);
      } else {
        const created = await gh(`/repos/${repo}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title: `Weekly outcome: ${site.site} is red`, body, labels: [LABEL] }),
        });
        console.log(`[weekly-outcome-notify] ${site.site}: opened #${created.number}`);
      }
    } else if (issue) {
      await gh(`/repos/${repo}/issues/${issue.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body:
            `Cleared for ${report.week}: ${site.impressions} impressions, ${site.clicks} clicks, ` +
            `coverage state ${site.coverage_state || 'unknown'}, ${site.errors_this_run ?? 0} collector error(s). Closing.`,
        }),
      });
      await gh(`/repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
      console.log(`[weekly-outcome-notify] ${site.site}: cleared, closed #${issue.number}`);
    }
  }
}

await reconcileIssues();
console.log(
  `[weekly-outcome-notify] OK: ${report.week}, ${report.site_count} site(s), red ${report.red_sites.length}`,
);
