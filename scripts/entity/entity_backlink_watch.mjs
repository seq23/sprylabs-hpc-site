/**
 * entity_backlink_watch: the weekly check that the Spry Labs entity graph in
 * config/entity.json is still true out on the web, with self-heal.
 *
 * For every sameAs URL (the Spry Labs organization and each of this repo's
 * sites) it fetches the profile with a browser user agent and classifies it:
 *
 *   ok           2xx, and the page names one of the entity's hosts (link-back).
 *   no_link_back 2xx on a server-rendered platform, but the page never names
 *                the site: a NAMED STOP naming the exact profile field to edit.
 *   unverifiable 2xx on a JS-rendered platform (Gumroad, Instagram, LinkedIn,
 *                Google Maps, Crunchbase): resolving is proved, link-back
 *                cannot be. A named state, never counted as a pass.
 *   blocked      403/429/5xx or a timeout: the platform refused a robot. Named,
 *                never removed - a refusal is not proof the profile is gone.
 *   dead         404/410 or a host that does not resolve, twice: REMOVED from
 *                sameAs (--apply), with a note in the report.
 *
 * Pending profiles (profiles_pending) are promoted into sameAs when their URL
 * resolves - and links back, where the platform can show it. A pending entry
 * with url null takes its address from `url_from` (aplayermode/config.js
 * stores.*) when that is filled in; otherwise it waits for the owner action it
 * names, which is listed as a named stop.
 *
 * Members (config/entity.json members): each side business's home page should
 * declare parentOrganization with the Spry Labs @id. One that does not is a
 * named stop for that business's repo - the graph edge is only half drawn.
 *
 * --apply writes config/entity.json when something was removed or promoted;
 * the workflow then stops red with that exact change for one reviewed rebuild. The
 * report goes to reports/entity/backlink_watch.json.
 *
 * Rule 0: a run that examined zero profiles and zero members fails.
 *
 * Run: npm run watch:entity-backlinks [-- --apply] [-- --offline-fixture <json>]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const JS_RENDERED = ['gumroad.com', 'instagram.com', 'linkedin.com', 'crunchbase.com', 'google.com', 'maps.app.goo.gl', 'tiktok.com', 'apps.apple.com', 'play.google.com'];
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const fixtureArg = args.indexOf('--offline-fixture');
// A fixture maps URL -> {status, body}; used by the negative proof and tests so
// the classification logic is exercised without the network.
const argVal = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const CFG_PATH = path.resolve(ROOT, argVal('config', 'config/entity.json'));
const REPORT = path.resolve(ROOT, argVal('report', 'reports/entity/backlink_watch.json'));
const FIXTURE = fixtureArg >= 0 ? JSON.parse(fs.readFileSync(args[fixtureArg + 1], 'utf8')) : null;

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const isJsRendered = (u) => JS_RENDERED.some((h) => hostOf(u) === h || hostOf(u).endsWith(`.${h}`));

async function fetchOnce(url) {
  if (FIXTURE) {
    const f = FIXTURE[url];
    if (!f) return { status: 0, body: '', error: 'ENOTFOUND (fixture)' };
    return { status: f.status, body: f.body || '' };
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
    const body = await r.text();
    return { status: r.status, body };
  } catch (e) {
    return { status: 0, body: '', error: String(e.cause?.code || e.name || e.message) };
  } finally { clearTimeout(t); }
}

async function probe(url, hosts) {
  let r = await fetchOnce(url);
  if (!(r.status >= 200 && r.status < 300)) r = await fetchOnce(url); // one retry
  const dead = r.status === 404 || r.status === 410 || (r.status === 0 && /ENOTFOUND|EAI_AGAIN|NXDOMAIN/.test(r.error || ''));
  if (dead) return { url, state: 'dead', status: r.status, error: r.error };
  if (!(r.status >= 200 && r.status < 300)) return { url, state: 'blocked', status: r.status, error: r.error };
  if (isJsRendered(url)) return { url, state: 'unverifiable', status: r.status };
  const body = r.body.toLowerCase();
  return hosts.some((h) => body.includes(h)) ? { url, state: 'ok', status: r.status } : { url, state: 'no_link_back', status: r.status };
}

function configValue(spec) {
  // "aplayermode/config.js stores.appStore" -> the string assigned to appStore in that file.
  const m = /^(\S+)\s+(?:\w+\.)*(\w+)$/.exec(spec || '');
  if (!m) return null;
  const file = path.join(ROOT, m[1]);
  if (!fs.existsSync(file)) return null;
  const v = new RegExp(`\\b${m[2]}\\s*:\\s*['"]([^'"]*)['"]`).exec(fs.readFileSync(file, 'utf8'));
  return v && /^https:\/\//.test(v[1]) ? v[1] : null;
}

const entities = [
  { key: 'organization', label: 'Spry Labs', node: cfg, hosts: cfg.own_hosts },
  ...cfg.own_hosts.map((h) => ({ key: `sites.${h}`, label: cfg.sites[h].name, node: cfg.sites[h], hosts: [h] })),
];

const report = { checked_at: new Date().toISOString(), apply: APPLY, profiles: [], promoted: [], removed: [], members: [], named_stops: [] };
let changed = false;

for (const e of entities) {
  const keep = [];
  for (const url of e.node.sameAs || []) {
    const r = { entity: e.label, ...(await probe(url, e.hosts)) };
    report.profiles.push(r);
    if (r.state === 'dead') {
      report.removed.push({ entity: e.label, url, why: `answered ${r.status || r.error} twice` });
      changed = true;
      continue;
    }
    if (r.state === 'no_link_back') report.named_stops.push(`${e.label}: the profile ${url} does not link to ${e.hosts.join(' or ')}. Owner: add https://${e.hosts[0]}/ to that profile's website field.`);
    keep.push(url);
  }
  const stillPending = [];
  for (const p of e.node.profiles_pending || []) {
    const url = p.url || configValue(p.url_from);
    if (!url) { stillPending.push(p); if (!/^None/.test(p.owner_action)) report.named_stops.push(`${e.label}: ${p.platform} profile not created yet. Owner: ${p.owner_action}`); continue; }
    const r = await probe(url, e.hosts);
    report.profiles.push({ entity: e.label, pending: true, ...r });
    if (r.state === 'ok' || r.state === 'unverifiable') {
      keep.push(url);
      report.promoted.push({ entity: e.label, platform: p.platform, url, state: r.state });
      changed = true;
    } else {
      stillPending.push(p);
      if (r.state === 'no_link_back') report.named_stops.push(`${e.label}: pending ${p.platform} profile ${url} resolves but does not link to ${e.hosts[0]}. Owner: add https://${e.hosts[0]}/ to its website field.`);
    }
  }
  e.node.sameAs = keep;
  e.node.profiles_pending = stillPending;
}

const ID_RE = new RegExp(`"parentOrganization"\\s*:\\s*(?:\\{[^{}]*"@id"\\s*:\\s*)?"${cfg['@id'].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`);
for (const m of cfg.members || []) {
  const r = await fetchOnce(m.url);
  const state = !(r.status >= 200 && r.status < 300) ? 'unreachable' : (ID_RE.test(r.body) ? 'ok' : 'no_parent');
  report.members.push({ name: m.name, url: m.url, status: r.status, state });
  if (state === 'no_parent') report.named_stops.push(`${m.name}: ${m.url} does not yet declare parentOrganization ${cfg['@id']} (that repo's entity.json / JSON-LD).`);
}

const examined = report.profiles.length + report.members.length;
report.summary = {
  examined,
  ok: report.profiles.filter((p) => p.state === 'ok').length,
  unverifiable: report.profiles.filter((p) => p.state === 'unverifiable').length,
  blocked: report.profiles.filter((p) => p.state === 'blocked').length,
  removed: report.removed.length,
  promoted: report.promoted.length,
  members_ok: report.members.filter((m) => m.state === 'ok').length,
  named_stops: report.named_stops.length,
  config_changed: changed,
};
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
if (changed && APPLY) fs.writeFileSync(CFG_PATH, `${JSON.stringify(cfg, null, 2)}\n`);

for (const p of report.profiles) console.log(`[entity-watch] ${p.state.padEnd(13)} ${p.entity}: ${p.url}`);
for (const m of report.members) console.log(`[entity-watch] member ${m.state.padEnd(11)} ${m.name}: ${m.url}`);
for (const r of report.removed) console.log(`[entity-watch] REMOVED ${r.entity}: ${r.url} (${r.why})`);
for (const r of report.promoted) console.log(`[entity-watch] PROMOTED ${r.entity}: ${r.platform} ${r.url}`);
for (const s of report.named_stops) console.log(`[entity-watch] NAMED STOP ${s}`);
if (!examined) { console.error('[entity-watch] FAIL Rule 0: 0 profiles and 0 members examined'); process.exit(1); }
console.log(`[entity-watch] ${JSON.stringify(report.summary)}`);
