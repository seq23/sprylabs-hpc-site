#!/usr/bin/env node
/**
 * THE SPRY LABS WEEKLY HAND-OFF (owner, 1 Nov 2026). This site no longer emails its weekly outcome
 * report. This writes spry-weekly-summary.json (schema spry-weekly-summary-v1) from
 * reports/weekly_outcome_report.json; the workflow uploads it as the artifact `spry-weekly-summary`,
 * and Boss OS puts one short section for the Spry Labs site into the one "Spry Labs weekly" email
 * (Wednesdays 08:15 Central). Facts only: Boss OS words them.
 *
 * THE MONEY LINE (Growth playbook build order 1, 1 Nov 2026). BHPC OS sells on Gumroad, so sales
 * come from the Gumroad API (GET /v2/sales, last 7 days): count, revenue, and which site each buyer
 * came from (Gumroad's referrer host). Never a buyer's name or address. Without
 * GUMROAD_ACCESS_TOKEN the line is the NAMED STOP [NO_GUMROAD_TOKEN], never a zero.
 *
 * THE FREE SAMPLE LINE. The sample -> email -> paid series and the one review
 * ask for BHPC OS are all Gumroad features (a $0 product + a Workflow, Upsells, Workflow on
 * purchase). The copy is data/sales/gumroad_growth.json; until its `live` fields are filled in
 * the line is the NAMED STOP [GUMROAD_SETUP], naming what is waiting.
 *
 *   node .github/scripts/spry_weekly_summary.mjs [report.json] [out.json]
 *   node .github/scripts/spry_weekly_summary.mjs --self-check
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DAY = 86_400_000;
const GROWTH_FILE = 'data/sales/gumroad_growth.json';
const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };

/** Sales line from `{ sales: [{ price, referrer, refunded }] }` or `{ error }`. Pure. */
export function salesLine(read) {
  if (!read || read.error) return `Sales (Gumroad): not read: ${read?.error ?? 'nothing was asked'}.`;
  const sales = (read.sales ?? []).filter((s) => !s.refunded && !s.chargedback);
  if (!sales.length) return 'Sales (Gumroad): 0 this week.';
  const cents = sales.reduce((a, s) => a + Number(s.price ?? 0), 0);
  const from = Object.entries(sales.reduce((a, s) => { const h = host(s.referrer) ?? 'direct or unknown'; a[h] = (a[h] ?? 0) + 1; return a; }, {}))
    .sort((x, y) => y[1] - x[1]).map(([h, k]) => `${h} ${k}`).join(', ');
  return `Sales (Gumroad): ${plural(sales.length, 'sale')} this week ($${(cents / 100).toFixed(2)}); came from ${from}.`;
}

/** Free sample / upsell / review ask line from data/sales/gumroad_growth.json. Pure. */
export function growthLine(growth) {
  if (!growth) return `Free sample series: not read: ${GROWTH_FILE} is missing.`;
  const waiting = Object.entries(growth.live ?? {}).filter(([, v]) => !v).map(([k]) => k);
  if (!waiting.length) return `Free sample series and review ask: live on Gumroad (${plural(growth.series?.length ?? 0, 'email')}).`;
  return `Free sample series: NAMED STOP [GUMROAD_SETUP] written (${plural(growth.series?.length ?? 0, 'email')}), not live until set up in her Gumroad account: ${waiting.join(', ')}.`;
}

const day = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

/**
 * The A Player Mode Pinterest line (owner-approved 1 Nov 2026): new pins released in the
 * week (aplayermode/data/pinterest/queue.json) and visits from pins (the Monday measurement,
 * reports/pinterest/aplayermode_metrics.json). An unread number is "not read: reason",
 * never 0. Sales are not on this site: A Player Mode's checkout runs in the app.
 */
export function pinterestLine(metrics, queue, now = Date.now()) {
  if (!metrics) return 'A Player Mode Pinterest: not read: no measurement in this repo.';
  if (metrics.status !== 'MEASURED') return `A Player Mode Pinterest: not read: ${String(metrics.reason ?? metrics.stop ?? 'the last measurement stopped').replace(/\.$/, '')}.`;
  const at = Date.parse(metrics.generated_at ?? '');
  if (Number.isNaN(at) || now - at > 10 * DAY || metrics.total == null) return `A Player Mode Pinterest: not read: the newest measurement is from ${Number.isNaN(at) ? 'an unknown day' : day(at)}.`;
  const since = new Date(at - 7 * DAY).toISOString().slice(0, 10);
  const until = new Date(at).toISOString().slice(0, 10);
  const pins = (queue?.variants ?? []).filter((v) => v.release_date && v.release_date > since && v.release_date <= until).length;
  return `A Player Mode Pinterest (week to ${day(at)}): ${plural(pins, 'new pin')}, ${plural(Number(metrics.total), 'visit')} from pins; sales not read here (checkout runs in the app).`;
}

/**
 * BHPC sales by source (8 Nov 2026, docs/operations/link-tracking.md): counts only, never a name or
 * address. Source = the sale's utm_source/utm_medium/utm_campaign when Gumroad returns them (the
 * Sales API in Gumroad's code carries them; the live API did not yet on 8 Nov), else the referrer
 * host, else "direct or unknown". "kindle" (printed in the published books) counts as kdp.
 * Unread = { status: 'not read', reason }, never 0.
 */
export const BHPC_PRODUCT = /billionaire high performance coach/i;
export function sourceOf(s) {
  const src = String(s.utm_source ?? '').toLowerCase();
  if (src) return [src === 'kindle' ? 'kdp' : src, s.utm_medium, s.utm_campaign].filter(Boolean).join(' / ');
  return host(s.referrer) ?? 'direct or unknown';
}
export function bhpcSourceCounts(read, week = null) {
  if (!read || read.error) return { status: 'not read', reason: read?.error ?? 'nothing was asked', week };
  const sales = (read.sales ?? []).filter((s) => !s.refunded && !s.chargedback && BHPC_PRODUCT.test(s.product_name ?? ''));
  const by_source = {};
  for (const s of sales) { const k = sourceOf(s); by_source[k] = (by_source[k] ?? 0) + 1; }
  return { status: 'read', week, sales: sales.length, by_source };
}
export function sourceLine(counts) {
  if (counts.status !== 'read') return `BHPC sales by source: not read: ${counts.reason}.`;
  if (!counts.sales) return 'BHPC sales by source: 0 BHPC sales this week.';
  return `BHPC sales by source: ${Object.entries(counts.by_source).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}.`;
}

export function summarise(report, runUrl = null, { sales = null, growth = null, pinterest = null } = {}) {
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
    generated_at: report.generated_at ?? new Date().toISOString(), run_url: runUrl, sites,
    bhpc_sales_by_source: bhpcSourceCounts(sales, report.week),
    notes: [salesLine(sales), sourceLine(bhpcSourceCounts(sales, report.week)), growthLine(growth), ...(pinterest ? [pinterest] : [])],
  };
}

/** Last 7 days of Gumroad sales; `{ error }` (a named stop) when they cannot be read. */
export async function readGumroadSales(now = Date.now(), fetchImpl = fetch, token = process.env.GUMROAD_ACCESS_TOKEN) {
  if (!token) return { error: 'NAMED STOP [NO_GUMROAD_TOKEN] GUMROAD_ACCESS_TOKEN is not set (made in her Gumroad account: Settings > Advanced > Applications; then the repo secret)' };
  const after = new Date(now - 7 * DAY).toISOString().slice(0, 10);
  const sales = [];
  let page = '';
  for (let i = 0; i < 20; i++) {
    const url = `https://api.gumroad.com/v2/sales?after=${after}${page ? `&page_key=${encodeURIComponent(page)}` : ''}`;
    let res, body;
    try { res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }); body = await res.json().catch(() => ({})); }
    catch (e) { return { error: `Gumroad could not be reached (${String(e?.message ?? e).slice(0, 80)})` }; }
    if (!res.ok || !body.success) return { error: `Gumroad answered ${res.status}` };
    for (const s of body.sales ?? []) if (Date.parse(s.created_at) >= now - 7 * DAY) sales.push({ price: s.price, referrer: s.referrer, refunded: !!s.refunded, chargedback: !!s.chargedback, product_name: s.product_name, utm_source: s.utm_source, utm_medium: s.utm_medium, utm_campaign: s.utm_campaign });
    if (!body.next_page_key) break;
    page = body.next_page_key;
  }
  return { sales };
}

export async function selfCheck() {
  const r = summarise({ week: '2026-W45', sites: [
    { site: 'a.example', status: 'OK', impressions: 10, clicks: 1, week_over_week: { clicks: { from: 2 }, impressions: { from: 9 } } },
    { site: 'b.example', status: 'RED', red_reasons: ['impressions halved'] },
  ] });
  if (r.sites[0].state !== 'fine' || r.sites[0].prev_clicks !== 2 || r.sites[1].state !== 'needs-a-look') throw new Error('self-check: summary is wrong');
  let refused = false;
  try { summarise({ week: 'x', sites: [] }); } catch { refused = true; }
  if (!refused) throw new Error('self-check: an empty report was handed on (rule 0)');

  // The money line: count + revenue + source, refunds excluded, never a zero for an unread number.
  const line = salesLine({ sales: [{ price: 4900, referrer: 'https://www.spryexecutiveos.com/' }, { price: 4900, referrer: 'https://billionairehighperformancecoach.com/download' }, { price: 4900, referrer: 'https://spryexecutiveos.com/x', refunded: true }] });
  if (line !== 'Sales (Gumroad): 2 sales this week ($98.00); came from spryexecutiveos.com 1, billionairehighperformancecoach.com 1.') throw new Error(`self-check: money line is wrong: ${line}`);
  const noToken = await readGumroadSales(Date.now(), async () => { throw new Error('must not call Gumroad without a token'); }, '');
  if (!/^NAMED STOP \[NO_GUMROAD_TOKEN\]/.test(noToken.error ?? '') || /\b0\b/.test(salesLine(noToken))) throw new Error('self-check: a missing token was not a named stop');
  const now = Date.parse('2026-11-04T12:00:00Z');
  const fake = async (url, init) => {
    if (init.headers.Authorization !== 'Bearer t' || url.includes('t@')) throw new Error('token must go in the header only');
    return new Response(JSON.stringify(url.includes('page_key') ? { success: true, sales: [{ price: 4900, referrer: 'https://spryexecutiveos.com/', created_at: '2026-11-03T10:00:00Z' }] }
      : { success: true, next_page_key: 'p2', sales: [{ price: 9900, referrer: null, created_at: '2026-11-02T10:00:00Z' }, { price: 100, created_at: '2026-10-01T00:00:00Z' }] }), { status: 200 });
  };
  const read = await readGumroadSales(now, fake, 't');
  if (salesLine(read) !== 'Sales (Gumroad): 2 sales this week ($148.00); came from direct or unknown 1, spryexecutiveos.com 1.') throw new Error(`self-check: paging or the 7-day window is wrong: ${salesLine(read)}`);
  // BHPC by source: utm first, referrer host next, kindle counts as kdp, other products and refunds out, unread never 0.
  const counts = bhpcSourceCounts({ sales: [
    { product_name: 'Billionaire High Performance Coach Operating System', utm_source: 'kindle', utm_medium: 'book', utm_campaign: 'task-paralysis' },
    { product_name: 'Billionaire High Performance Coach Operating System', utm_source: 'kdp', utm_medium: 'book', utm_campaign: 'task-paralysis' },
    { product_name: 'Billionaire High Performance Coach Operating System', referrer: 'https://www.pinterest.com/pin/1' },
    { product_name: 'Billionaire High Performance Coach Operating System', referrer: 'https://x.example', refunded: true },
    { product_name: 'Some other product', utm_source: 'kdp', utm_medium: 'book', utm_campaign: 'x' },
  ] }, '2026-W45');
  if (JSON.stringify(counts.by_source) !== JSON.stringify({ 'kdp / book / task-paralysis': 2, 'pinterest.com': 1 }) || counts.sales !== 3) throw new Error(`self-check: BHPC by-source counts are wrong: ${JSON.stringify(counts)}`);
  if (JSON.stringify(counts).match(/@|full_name|email/)) throw new Error('self-check: a buyer detail reached the counts');
  const unread = bhpcSourceCounts({ error: 'Gumroad answered 401' });
  if (unread.status !== 'not read' || 'sales' in unread || /\b0\b/.test(sourceLine(unread))) throw new Error('self-check: unread BHPC sources became a zero');
  if (!/NAMED STOP \[GUMROAD_SETUP\]/.test(growthLine({ series: [1, 2], live: { a: null } }))) throw new Error('self-check: a Gumroad setup gap was not a named stop');
  const pnow = Date.parse('2026-11-04T13:00:00Z');
  const q = { variants: [{ release_date: '2026-11-01' }, { release_date: '2026-11-02' }, { release_date: '2026-10-20' }, { release_date: null }] };
  const pinLine = pinterestLine({ status: 'MEASURED', generated_at: '2026-11-02T15:00:00Z', total: 3 }, q, pnow);
  if (pinLine !== 'A Player Mode Pinterest (week to Nov 2): 2 new pins, 3 visits from pins; sales not read here (checkout runs in the app).') throw new Error(`self-check: Pinterest line is wrong: ${pinLine}`);
  const stop = pinterestLine({ status: 'NAMED_STOP', reason: 'no token.' }, q, pnow);
  if (!stop.includes('not read: no token') || /\b0 visit/.test(stop)) throw new Error(`self-check: an unread Pinterest number became a zero: ${stop}`);
  console.log('spry_weekly_summary self-check: ok');
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === '--self-check') await selfCheck();
else if (import.meta.url === `file://${process.argv[1]}`) {
  const [input = 'reports/weekly_outcome_report.json', out = 'spry-weekly-summary.json'] = process.argv.slice(2);
  const growth = existsSync(GROWTH_FILE) ? JSON.parse(readFileSync(GROWTH_FILE, 'utf8')) : null;
  const summary = summarise(JSON.parse(readFileSync(input, 'utf8')), process.env.RUN_URL ?? null, { sales: await readGumroadSales(), growth, pinterest: pinterestLine(existsSync('reports/pinterest/aplayermode_metrics.json') ? JSON.parse(readFileSync('reports/pinterest/aplayermode_metrics.json', 'utf8')) : null, existsSync('aplayermode/data/pinterest/queue.json') ? JSON.parse(readFileSync('aplayermode/data/pinterest/queue.json', 'utf8')) : null) });
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`spry weekly summary: ${summary.sites.length} site(s) -> ${out}; ${summary.notes.join(' | ')}`);
}
