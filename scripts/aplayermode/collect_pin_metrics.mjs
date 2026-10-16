#!/usr/bin/env node
/**
 * Weekly measurement for the aplayermode.com Pinterest drip: Pinterest-referred page
 * views (utm_source=pinterest) per pin (utm_content) over the last 7 days, from the
 * edge log the aplayermode-com Worker writes (Workers Analytics Engine dataset
 * aplayermode_pin_visits, binding PIN_VISITS: utm values only, no IP, UA or cookie;
 * $0 within the Workers Paid allowance).
 *
 * Writes reports/pinterest/aplayermode_metrics.json and appends
 * reports/pinterest/aplayermode_metrics_history.json (last 104 runs).
 *
 * Reading Analytics Engine needs a Cloudflare API token with Account > Account
 * Analytics > Read, as the Actions secret CLOUDFLARE_API_TOKEN (account id: the
 * CLOUDFLARE_ACCOUNT_ID secret, else the account the Worker deploys to). Without a
 * token, or when Cloudflare refuses it, this writes the NAMED STOP
 * PINTEREST_METRICS_UNAVAILABLE naming the secret and exits 0: a named stop, never a
 * zero it did not measure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUEUE_FILE } from './pinfeed_lib.mjs';

export const DATASET = 'aplayermode_pin_visits';
export const DEFAULT_ACCOUNT_ID = '8d147e242033699dd37c6f5a451f48d2';
export const SECRET = 'CLOUDFLARE_API_TOKEN';
// Test visits logged by live verification (PR #138) are not Pinterest traffic.
export const EXCLUDED_VARIANTS = ['verify-probe'];
export const SQL = `SELECT blob1 AS variant, SUM(_sample_interval) AS visits FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '7' DAY AND blob1 NOT IN (${EXCLUDED_VARIANTS.map((v) => `'${v}'`).join(', ')}) GROUP BY variant ORDER BY visits DESC FORMAT JSON`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(root, 'reports/pinterest');
const LATEST = path.join(OUT_DIR, 'aplayermode_metrics.json');
const HISTORY = path.join(OUT_DIR, 'aplayermode_metrics_history.json');

function write(result) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LATEST, `${JSON.stringify(result, null, 2)}\n`);
  const history = fs.existsSync(HISTORY) ? JSON.parse(fs.readFileSync(HISTORY, 'utf8')) : [];
  history.push({ generated_at: result.generated_at, status: result.status, window: result.window ?? null, total: result.total ?? null, by_variant: result.by_variant ?? null });
  fs.writeFileSync(HISTORY, `${JSON.stringify(history.slice(-104), null, 2)}\n`);
  const line = result.status === 'MEASURED'
    ? `[pin-metrics] ${result.total} Pinterest-referred visit(s) in ${result.window}, ${Object.keys(result.by_variant).length} pin(s) with visits`
    : `NAMED STOP: ${result.stop} - ${result.reason}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### aplayermode.com Pinterest drip metrics\n\n${line}\n`);
}

export async function collect({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const generated_at = now.toISOString();
  const stop = (reason) => ({ generated_at, status: 'NAMED_STOP', stop: 'PINTEREST_METRICS_UNAVAILABLE', secret: SECRET, reason });
  const token = env[SECRET];
  if (!token) return stop(`${SECRET} is not set in this repo's Actions secrets; reading the Analytics Engine dataset ${DATASET} needs a Cloudflare API token with Account Analytics: Read.`);
  const account = env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT_ID;
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: SQL });
  if (res.status === 401 || res.status === 403) return stop(`Cloudflare answered ${res.status}: ${SECRET} lacks Account Analytics: Read on account ${account}.`);
  if (!res.ok) return stop(`Analytics Engine SQL API answered ${res.status}; nothing was measured.`);
  const body = await res.json();
  if (!Array.isArray(body.data)) return stop('Analytics Engine SQL API returned no data array; nothing was measured.');
  const queue = JSON.parse(fs.readFileSync(path.join(root, QUEUE_FILE), 'utf8'));
  const known = new Set([...queue.variants.map((v) => v.id), ...queue.launch.map((i) => i.slug)]);
  const byVariant = {};
  let total = 0;
  for (const row of body.data) {
    const visits = Number(row.visits) || 0;
    byVariant[row.variant] = visits;
    total += visits;
  }
  return {
    generated_at,
    status: 'MEASURED',
    source: `Workers Analytics Engine dataset ${DATASET} (aplayermode-com Worker edge log)`,
    window: 'last 7 days',
    total,
    by_variant: byVariant,
    unknown_variants: Object.keys(byVariant).filter((id) => !known.has(id)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  write(await collect({ env: { CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID } }));
}
