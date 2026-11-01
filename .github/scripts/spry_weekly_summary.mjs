#!/usr/bin/env node
/**
 * THE SPRY LABS WEEKLY HAND-OFF (owner, 1 Nov 2026). This site no longer emails its weekly outcome
 * report. This writes spry-weekly-summary.json (schema spry-weekly-summary-v1) from
 * reports/weekly_outcome_report.json; the workflow uploads it as the artifact `spry-weekly-summary`,
 * and Boss OS puts one short section for the Spry Labs site into the one "Spry Labs weekly" email
 * (Wednesdays 08:15 Central). Facts only: Boss OS words them.
 *
 *   node .github/scripts/spry_weekly_summary.mjs [report.json] [out.json]
 *   node .github/scripts/spry_weekly_summary.mjs --self-check
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function summarise(report, runUrl = null) {
  const sites = (report?.sites ?? []).map((s) => ({
    host: s.site,
    state: s.status === 'OK' ? 'fine' : 'needs-a-look',
    why: (s.red_reasons ?? []).slice(0, 3).map(String),
    clicks: s.clicks ?? null,
    impressions: s.impressions ?? null,
    prev_clicks: s.week_over_week?.clicks?.from ?? null,
    prev_impressions: s.week_over_week?.impressions?.from ?? null,
  }));
  if (sites.length === 0) throw new Error('NAMED STOP [NO_SITES] the weekly report covers no site; nothing to hand to Boss OS.');
  return {
    schema: 'spry-weekly-summary-v1', business: 'Spry Labs site', week: report.week,
    generated_at: report.generated_at ?? new Date().toISOString(), run_url: runUrl, sites, notes: [],
  };
}

export function selfCheck() {
  const r = summarise({ week: '2026-W45', sites: [
    { site: 'a.example', status: 'OK', impressions: 10, clicks: 1, week_over_week: { clicks: { from: 2 }, impressions: { from: 9 } } },
    { site: 'b.example', status: 'RED', red_reasons: ['impressions halved'] },
  ] });
  if (r.sites[0].state !== 'fine' || r.sites[0].prev_clicks !== 2 || r.sites[1].state !== 'needs-a-look') throw new Error('self-check: summary is wrong');
  let refused = false;
  try { summarise({ week: 'x', sites: [] }); } catch { refused = true; }
  if (!refused) throw new Error('self-check: an empty report was handed on (rule 0)');
  console.log('spry_weekly_summary self-check: ok');
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === '--self-check') selfCheck();
else if (import.meta.url === `file://${process.argv[1]}`) {
  const [input = 'reports/weekly_outcome_report.json', out = 'spry-weekly-summary.json'] = process.argv.slice(2);
  const summary = summarise(JSON.parse(readFileSync(input, 'utf8')), process.env.RUN_URL ?? null);
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`spry weekly summary: ${summary.sites.length} site(s) -> ${out}`);
}
