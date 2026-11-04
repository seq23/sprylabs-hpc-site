#!/usr/bin/env node
/**
 * AI-REFERRAL VISITS AND AI-BOT READS ARE REALLY MEASURED (Search Readiness f11).
 *
 * The shared search loop (seq23/search-loop) reads both halves of the answer-engine
 * half of the goal from Cloudflare every day and accumulates them in
 * `data/search-loop/ai-daily.json`; the weekly `search-loop-week` report sums the
 * last seven days, and Boss OS reads that. A number that was not read is written as
 * "not read: <reason>", never a zero - which is the honest shape, and exactly why a
 * broken credential is invisible: the lane stays green and the report simply says
 * nothing was read.
 *
 * That happened here. The repository secret SEARCH_LOOP_CF_USAGE_TOKEN held a
 * Cloudflare token without `zone.analytics.read`, so 1-3 November 2026 each recorded
 *   "Cloudflare analytics refused the query: Actor 'com.cloudflare.api.token.41e529...'
 *    does not have permission 'com.cloudflare.api.account.zone.analytics.read'"
 * and the Monday audit reported f11 as "not measured: AI-referral visits and AI-bot
 * reads" for spryexecutiveos.com. Nothing in this repository noticed.
 *
 * This is that guard. Two ways to run it, one judgement:
 *
 *   npm run check:ai-measurement           offline, in the validation matrix: reads the
 *                                          committed daily ledger and refuses a week in
 *                                          which NOTHING was read.
 *   npm run check:ai-measurement -- --live  with CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
 *                                          (the weekly report workflow): asks Cloudflare the
 *                                          same three questions the engine asks and refuses a
 *                                          token that cannot answer them.
 *   npm run self-test:ai-measurement        proves both verdicts against fixtures, no network.
 *
 * Rule 0 shapes, so it cannot pass while seeing nothing:
 *   - zero search-loop configs found, or zero day rows in the ledger, is a NAMED STOP,
 *     not a pass (the lane that writes them never ran);
 *   - a credential or configuration reason ("does not have permission", "is not set",
 *     "cannot see zone", "needs Zone:Read", "turn on Web Analytics") is a hard failure
 *     the moment it is the only thing in the ledger: it never fixes itself;
 *   - a transient reason (a failed fetch, a timeout) is a NAMED NOTE and exit 0 while it
 *     is younger than a week: her rule is that a stop the next scheduled run retries is a
 *     note, not a red main. A whole week of them is a failure like any other.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WINDOW_DAYS = 7;
/** Reasons no scheduled retry can clear: a token, an account id or a setting must change. */
const CREDENTIAL_REASON = /does not have permission|is not set|cannot see zone|needs Zone:Read|no referrer field|turn on Web Analytics|refused the (bot|referral) query|Authentication error|not passed|no free analytics source/i;

const fail = (msg) => { console.error(`NAMED STOP [AI_MEASUREMENT_NOT_READ] ${msg}`); process.exitCode = 1; };
const note = (msg) => console.log(`NAMED NOTE [AI_MEASUREMENT_RETRYING] ${msg}`);

/** Every search-loop config in the tree that asks Cloudflare for the AI numbers. */
export function configs(root = ROOT) {
  const out = [];
  for (const name of fs.readdirSync(root)) {
    if (name !== 'search-loop.config.json') continue;
    const p = path.join(root, name);
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    out.push({ path: name, cfg });
  }
  return out;
}

/** The day rows inside the window, newest first. */
export function recentDays(ledger, { now = new Date(), windowDays = WINDOW_DAYS } = {}) {
  const days = Object.entries(ledger?.days ?? {}).sort(([a], [b]) => (a < b ? 1 : -1));
  const oldest = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);
  return days.filter(([d]) => d >= oldest);
}

/**
 * The verdict on one site's committed ledger: { ok, why, transient }.
 * ok=false with transient=true is a note, not a failure (see the header).
 */
export function judgeLedger(ledger, { site, now = new Date(), windowDays = WINDOW_DAYS } = {}) {
  if (!ledger || typeof ledger !== 'object') return { ok: false, why: `${site}: no daily AI ledger was ever written, so neither number has ever been read` };
  const days = recentDays(ledger, { now, windowDays });
  if (!days.length) return { ok: false, why: `${site}: the daily AI ledger has no day in the last ${windowDays} days, so the lane that writes it is not running` };
  const read = { ai_visitors: [], ai_bot_hits: [] };
  const reasons = new Set();
  for (const [day, row] of days) {
    for (const key of ['ai_visitors', 'ai_bot_hits']) {
      if (row?.[key] && typeof row[key].total === 'number') read[key].push(day);
      else reasons.add(String(row?.[`${key}_not_read`] ?? row?.not_read ?? 'no reason recorded'));
    }
  }
  const missing = Object.entries(read).filter(([, ds]) => !ds.length).map(([k]) => (k === 'ai_visitors' ? 'AI-referral visits' : 'AI-bot reads'));
  if (!missing.length) return { ok: true, why: `${site}: AI-referral visits read on ${read.ai_visitors.length} day(s) and AI-bot reads on ${read.ai_bot_hits.length} of the last ${days.length} day(s)` };
  const why = `${site}: ${missing.join(' and ')} not read on any of the last ${days.length} day(s) in ${windowDays}: ${[...reasons].join(' | ')}`;
  const transient = ![...reasons].some((r) => CREDENTIAL_REASON.test(r)) && days.length < windowDays;
  return { ok: false, why, transient };
}

/** The three reads the engine makes, asked live. Returns { ok, why } per question. */
export async function liveReads({ zoneName, token = process.env.CLOUDFLARE_API_TOKEN, accountId = process.env.CLOUDFLARE_ACCOUNT_ID, fetchImpl = fetch, now = new Date() } = {}) {
  const out = [];
  const t = String(token ?? '').trim();
  if (!t) return [{ ok: false, why: 'CLOUDFLARE_API_TOKEN is not set, so nothing can be read' }];
  const api = async (url, body) => {
    const r = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    return r.json();
  };
  const CF = 'https://api.cloudflare.com/client/v4';
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const until = now.toISOString();
  const z = await api(`${CF}/zones?name=${encodeURIComponent(zoneName)}`);
  const zone = z?.result?.[0]?.id;
  if (!zone) return [{ ok: false, why: `the Cloudflare token cannot see zone ${zoneName}; it needs Zone:Read + Analytics:Read` }];
  const gql = async (query, variables) => {
    const g = await api(`${CF}/graphql`, { query, variables });
    return g?.errors?.length ? { error: String(g.errors[0].message).slice(0, 200) } : { data: g?.data };
  };
  // AI-bot reads: the zone's own request log by user agent. Every plan has this.
  const bots = await gql(`query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){rows:httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$since,datetime_lt:$until}){count dimensions{userAgent}}}}}`, { zone, since, until });
  out.push(bots.error
    ? { ok: false, why: `AI-bot reads: zone analytics refused the query: ${bots.error}` }
    : { ok: true, why: `AI-bot reads: zone analytics answered for ${zoneName}` });
  // AI-referral visits: the zone's referrer host where the plan has it, else Web Analytics.
  const refs = await gql(`query($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){rows:httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:$since,datetime_lt:$until}){count dimensions{clientRefererHost}}}}}`, { zone, since, until });
  if (!refs.error) out.push({ ok: true, why: `AI-referral visits: the zone's own referrer field answered for ${zoneName}` });
  else if (!/does not have access to the field/i.test(refs.error)) out.push({ ok: false, why: `AI-referral visits: zone analytics refused the query: ${refs.error}` });
  else if (!String(accountId ?? '').trim()) out.push({ ok: false, why: `AI-referral visits: this zone's plan has no referrer field and CLOUDFLARE_ACCOUNT_ID is not set, so Web Analytics cannot be read` });
  else {
    const bare = zoneName.replace(/^www\./, '');
    const rum = await gql(`query($a:String!,$wk:Time!,$until:Time!,$hosts:[String!]){viewer{accounts(filter:{accountTag:$a}){week:rumPageloadEventsAdaptiveGroups(limit:1,filter:{datetime_geq:$wk,datetime_lt:$until,requestHost_in:$hosts}){count}}}}`,
      { a: String(accountId).trim(), wk: new Date(now.getTime() - 7 * 86_400_000).toISOString(), until, hosts: [bare, `www.${bare}`] });
    const loads = (rum.data?.viewer?.accounts?.[0]?.week ?? []).reduce((n, g) => n + g.count, 0);
    out.push(rum.error
      ? { ok: false, why: `AI-referral visits: this zone's plan has no referrer field and Web Analytics refused the query: ${rum.error}` }
      : loads > 0
        ? { ok: true, why: `AI-referral visits: Cloudflare Web Analytics answered for ${bare} (${loads} page load(s) in 7 days)` }
        : { ok: false, why: `AI-referral visits: this zone's plan has no referrer field and the Web Analytics beacon recorded no page load for ${bare} in 7 days: turn on Web Analytics for ${bare}` });
  }
  // The Workers AI usage read shares this token (the engine's $0 model lane reads neurons with it).
  const ai = await gql(`query($a:String!,$s:Time!,$u:Time!){viewer{accounts(filter:{accountTag:$a}){rows:aiInferenceAdaptiveGroups(limit:1,filter:{datetime_geq:$s,datetime_lt:$u}){sum{totalNeurons}}}}}`, { a: String(accountId ?? '').trim(), s: since, u: until });
  out.push(ai.error
    ? { ok: false, why: `Workers AI usage (the $0 model lane's own budget read, same token): ${ai.error}` }
    : { ok: true, why: 'Workers AI usage: account analytics answered' });
  return out;
}

async function main(argv) {
  const live = argv.includes('--live');
  const found = configs();
  if (!found.length) { fail('no search-loop.config.json in this repository, so no site can be measured at all; this check must see at least one'); return; }
  let checked = 0;
  for (const { path: cfgPath, cfg } of found) {
    const site = cfg.site ?? cfgPath;
    const wantsCloudflare = cfg.analytics?.ai_referrals === 'cloudflare' || cfg.analytics?.ai_bot_hits === 'cloudflare';
    if (!wantsCloudflare) { fail(`${site}: ${cfgPath} names no free analytics source (analytics.ai_referrals), so neither number can ever be read`); continue; }
    checked++;
    const zoneName = cfg.analytics?.zone || new URL(cfg.base_url).host;
    if (live) {
      const reads = await liveReads({ zoneName });
      for (const r of reads) console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${site}: ${r.why}`);
      const bad = reads.filter((r) => !r.ok);
      if (bad.length) fail(`${site}: the Cloudflare token cannot read ${bad.length} of ${reads.length} question(s) the search loop asks every day: ${bad.map((b) => b.why).join(' | ')}`);
      continue;
    }
    const ledgerPath = path.join(cfg.ledger_dir ?? 'data/search-loop', 'ai-daily.json');
    let ledger = null;
    try { ledger = JSON.parse(fs.readFileSync(path.join(ROOT, ledgerPath), 'utf8')); } catch { ledger = null; }
    const v = judgeLedger(ledger, { site });
    if (v.ok) console.log(`OK   ${v.why} (${ledgerPath})`);
    else if (v.transient) note(`${v.why} - a retryable reason, and the next scheduled run reads the day again`);
    else fail(`${v.why} (${ledgerPath}). The token in SEARCH_LOOP_CF_USAGE_TOKEN needs Zone:Read + Zone Analytics:Read on the zone and Account Analytics:Read; prove it with: npm run check:ai-measurement -- --live`);
  }
  if (!checked) { fail('no site in this repository asks Cloudflare for the AI numbers, so f11 can never be measured'); return; }
  if (!process.exitCode) console.log(`check:ai-measurement: ${checked} site(s) checked ${live ? 'live against Cloudflare' : 'from the committed daily ledger'}`);
}

async function selfTest() {
  const f = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/search-loop', n), 'utf8'));
  const now = new Date('2026-11-03T12:00:00Z');
  const cases = [
    ['ai-daily-read.json', { ok: true }],
    ['ai-daily-credential-blind.json', { ok: false, transient: false }],
    ['ai-daily-empty.json', { ok: false, transient: undefined }],
    ['ai-daily-transient.json', { ok: false, transient: true }],
  ];
  const problems = [];
  for (const [name, want] of cases) {
    const got = judgeLedger(f(name), { site: 'spryexecutiveos.com', now });
    if (got.ok !== want.ok) problems.push(`${name}: expected ok=${want.ok}, got ok=${got.ok} (${got.why})`);
    if (want.ok === false && 'transient' in want && Boolean(got.transient) !== Boolean(want.transient)) problems.push(`${name}: expected transient=${Boolean(want.transient)}, got ${Boolean(got.transient)} (${got.why})`);
    console.log(`  ${name}: ok=${got.ok}${got.ok ? '' : ` transient=${Boolean(got.transient)}`} - ${got.why}`);
  }
  // The real defect this guard exists for must be refused by name.
  const real = judgeLedger(f('ai-daily-credential-blind.json'), { site: 'spryexecutiveos.com', now });
  if (real.ok || real.transient) problems.push('the 1-3 November credential failure must be a hard failure, not a pass or a note');
  // A missing ledger is never a pass.
  if (judgeLedger(null, { site: 'spryexecutiveos.com', now }).ok) problems.push('a missing ledger must not pass');
  // Nothing may pass without a single configured site.
  if (!configs().length) problems.push('the repository has no search-loop.config.json for this check to read');
  if (problems.length) { console.error(`NAMED STOP [SELF_TEST_FAILED]\n- ${problems.join('\n- ')}`); process.exitCode = 1; return; }
  console.log(`self-test:ai-measurement: ${cases.length} ledger verdicts + 3 refusals proved, ${configs().length} site config read`);
}

const argv = process.argv.slice(2);
if (argv.includes('--self-test')) await selfTest(); else await main(argv);
