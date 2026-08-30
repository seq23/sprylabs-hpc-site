#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
/**
 * The guard for the social source registry and its collector.
 *
 * Spry Content Release went red on 2026-08-30 with
 * NO_SOURCE_MATCHES_COLLECTOR_CONTRACT. data/social/source_registry.json declared
 * four sources as bare strings - reddit, forums, search_console,
 * llm_citation_checks - while scripts/social/collect_social.js only ever matched
 * object-shaped entries on platforms [youtube, manual]. Two components, one list,
 * no shared vocabulary: every source was filtered out, and for months the lane
 * wrote an empty run file and printed a success-shaped line. 95 of 96 committed
 * run files hold zero records.
 *
 * Naming that mismatch was right. Leaving the lane red every morning afterwards
 * was not - "flagged, not fixed" is still not fixed. The registry now describes
 * what is actually implemented and permitted, and the collector distinguishes a
 * broken contract (exit 1) from an owner-input gap (NAMED STOP, exit 0).
 *
 * This proves all of it, on every run:
 *   A. Every registry entry is object-shaped, and every platform is either
 *      implemented by the collector or explicitly declared unimplemented WITH a
 *      reason. No entry may be silently unmatched.
 *   B. At least one source is implemented and active, so the lane is not a
 *      permanent no-op dressed up as a named stop.
 *   C. Both exit directions still work: a drifted registry hard-fails, and an
 *      implemented source with no operator input exits 0 naming who must act.
 *
 * Zero-item rule: it hard-fails when the registry declares no source, rather than
 * passing on an empty loop.
 */
const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = process.cwd();
const REGISTRY_REL = 'data/social/source_registry.json';
const COLLECTOR_REL = 'scripts/social/collect_social.js';
const errors = [];
const checks = [];

const registryPath = path.join(ROOT, REGISTRY_REL);
const collectorSource = fs.readFileSync(path.join(ROOT, COLLECTOR_REL), 'utf8');
const before = fs.readFileSync(registryPath, 'utf8');
let restored = false;
const restore = () => { if (restored) return; restored = true; fs.writeFileSync(registryPath, before); };
process.on('exit', restore);

// The supported list is read out of the collector, so this cannot become a third
// opinion about which platforms exist.
const supportedMatch = collectorSource.match(/SUPPORTED_PLATFORMS\s*=\s*\[([^\]]*)\]/);
const SUPPORTED = supportedMatch ? supportedMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
if (!SUPPORTED.length) {
  console.error(`[social-source-contract] FAIL: could not read SUPPORTED_PLATFORMS out of ${COLLECTOR_REL}; this check no longer reaches what it governs.`);
  process.exit(1);
}

const registry = JSON.parse(before);
const sources = Array.isArray(registry.sources) ? registry.sources : [];
if (!sources.length) {
  console.error(`[social-source-contract] FAIL: ${REGISTRY_REL} declares no source; there is nothing to prove.`);
  process.exit(1);
}

// --- A. every entry is shaped and accounted for -------------------------------
let active = 0;
let declaredUnimplemented = 0;
for (const source of sources) {
  const label = (source && (source.source_key || source.platform)) || JSON.stringify(source);
  if (!source || typeof source !== 'object' || !source.platform) {
    errors.push(`${label}: not an object with a .platform field. Bare strings are how this registry and its collector drifted apart in the first place.`);
    continue;
  }
  if (source.status === 'declared_unimplemented') {
    declaredUnimplemented += 1;
    if (!source.reason) errors.push(`${label}: declared_unimplemented without a reason; an unimplemented source must say why or it is indistinguishable from a broken one.`);
    if (SUPPORTED.includes(source.platform)) errors.push(`${label}: marked declared_unimplemented but "${source.platform}" IS implemented by the collector; the registry is understating what the lane can do.`);
    continue;
  }
  if (source.status === 'inactive') continue;
  if (!SUPPORTED.includes(source.platform)) {
    errors.push(`${label}: platform "${source.platform}" is not implemented (supported: ${SUPPORTED.join(', ')}) and is not marked declared_unimplemented. It would be silently filtered out.`);
    continue;
  }
  active += 1;
}
checks.push(`${sources.length} source(s): ${active} implemented and active, ${declaredUnimplemented} declared unimplemented with a stated reason`);

// --- B. the lane is not a permanent no-op ------------------------------------
if (active === 0) errors.push('no source is both implemented and active, so this lane can never collect anything; a named stop must not become a permanent excuse.');

// --- C. both exit directions still work --------------------------------------
const runCollector = () => spawnSync(process.execPath, [COLLECTOR_REL], {cwd: ROOT, encoding: 'utf8'});

const clean = runCollector();
if (clean.status !== 0) {
  errors.push(`with the committed registry the collector exited ${clean.status}; an implemented source with no operator input must be a named stop, not a red lane.\n${clean.stdout}${clean.stderr}`);
} else if (!/NAMED STOP|wrote \d+ high-intent/.test(clean.stdout || '')) {
  errors.push('the collector exited 0 without either collecting records or printing a NAMED STOP; a silent zero is exactly what this rule exists to prevent.');
} else {
  checks.push(clean.stdout.includes('NAMED STOP') ? 'committed registry -> NAMED STOP naming the owner, exit 0' : 'committed registry -> records collected, exit 0');
}

// Inject the historical defect: bare strings. It must still hard-fail.
fs.writeFileSync(registryPath, `${JSON.stringify({...registry, sources: ['reddit', 'forums']}, null, 2)}\n`);
const drifted = runCollector();
if (drifted.status === 0) {
  errors.push('a registry of bare strings did NOT fail the collector; the 2026-08-30 defect could return silently.');
} else {
  checks.push('bare-string registry -> hard failure preserved');
}
restore();

const report = {
  schema_version: '1.0',
  validator: 'social-source-contract',
  status: errors.length ? 'FAIL' : 'PASS',
  registry: REGISTRY_REL,
  collector: COLLECTOR_REL,
  supported_platforms: SUPPORTED,
  sources_examined: sources.length,
  active_implemented: active,
  declared_unimplemented: declaredUnimplemented,
  checks,
  errors,
  checked_at: new Date().toISOString(),
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), {recursive: true});
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/social-source-contract.json'), `${JSON.stringify(report, null, 2)}\n`);

if (errors.length) {
  console.error(`[social-source-contract] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`[social-source-contract] PASS sources=${sources.length} supported=[${SUPPORTED.join(', ')}]; ${checks.join('; ')}`);
