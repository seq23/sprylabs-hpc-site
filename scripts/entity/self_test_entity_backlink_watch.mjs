/**
 * Proves entity_backlink_watch's self-heal rules offline, against a fixture, so
 * the weekly job cannot quietly stop removing dead profiles, promoting live
 * pending ones or naming a missing link-back. Each case is a negative proof:
 * the fixture is built so a watch that skipped the rule would leave a visible
 * difference this test fails on.
 *
 * Run: npm run self-test:entity-backlink-watch
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const real = JSON.parse(fs.readFileSync('config/entity.json', 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'entity-watch-'));
const cfg = structuredClone(real);
cfg.sameAs = ['https://dead.example.org/spry', 'https://sprylabs.gumroad.com/'];
cfg.profiles_pending = [{ platform: 'Test pending', url: 'https://pending.example.org/spry', owner_action: 'test' }];
cfg.sites['aplayermode.com'].sameAs = ['https://nolink.example.org/apm'];
cfg.members = [{ name: 'Member', url: 'https://member.example.org/', description: 'x' }];
const fixture = {
  'https://sprylabs.gumroad.com/': { status: 200, body: '<div id=app></div>' },
  'https://pending.example.org/spry': { status: 200, body: 'see billionairehighperformancecoach.com' },
  'https://nolink.example.org/apm': { status: 200, body: 'nothing here' },
  'https://member.example.org/': { status: 200, body: `{"parentOrganization":{"@id":"${real['@id']}"}}` },
  'https://dead.example.org/spry': { status: 404 },
};
const cfgPath = path.join(dir, 'entity.json');
const fixPath = path.join(dir, 'fixture.json');
const repPath = path.join(dir, 'report.json');
fs.writeFileSync(cfgPath, JSON.stringify(cfg));
fs.writeFileSync(fixPath, JSON.stringify(fixture));
const r = spawnSync(process.execPath, ['scripts/entity/entity_backlink_watch.mjs', '--apply', '--config', cfgPath, '--report', repPath, '--offline-fixture', fixPath], { encoding: 'utf8' });
const fails = [];
if (r.status !== 0) fails.push(`watch exited ${r.status}: ${r.stderr}`);
const out = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const rep = JSON.parse(fs.readFileSync(repPath, 'utf8'));
if (out.sameAs.includes('https://dead.example.org/spry')) fails.push('a 404 profile was not removed from sameAs');
if (!out.sameAs.includes('https://pending.example.org/spry')) fails.push('a resolving, linking-back pending profile was not promoted');
if (out.profiles_pending.length) fails.push('the promoted profile is still pending');
if (!out.sameAs.includes('https://sprylabs.gumroad.com/')) fails.push('an unverifiable (JS-rendered) profile was removed');
if (rep.profiles.find((p) => p.url === 'https://sprylabs.gumroad.com/')?.state !== 'unverifiable') fails.push('Gumroad was not classed unverifiable');
if (!rep.named_stops.some((s) => s.includes('nolink.example.org'))) fails.push('a profile with no link-back was not a named stop');
if (rep.members[0]?.state !== 'ok') fails.push('a member declaring parentOrganization was not recognised');
// Rule 0: a config with nothing to examine must fail.
const empty = { ...structuredClone(real), sameAs: [], profiles_pending: [], members: [], sites: Object.fromEntries(Object.entries(real.sites).map(([k, v]) => [k, { ...v, sameAs: [], profiles_pending: [] }])) };
fs.writeFileSync(cfgPath, JSON.stringify(empty));
const z = spawnSync(process.execPath, ['scripts/entity/entity_backlink_watch.mjs', '--config', cfgPath, '--report', repPath, '--offline-fixture', fixPath], { encoding: 'utf8' });
if (z.status === 0) fails.push('Rule 0: a run that examined nothing exited 0');
fs.rmSync(dir, { recursive: true, force: true });
for (const f of fails) console.error(`[self-test:entity-backlink-watch] FAIL ${f}`);
if (fails.length) process.exit(1);
console.log('[self-test:entity-backlink-watch] PASS - 7 self-heal rules and Rule 0 proved offline');
