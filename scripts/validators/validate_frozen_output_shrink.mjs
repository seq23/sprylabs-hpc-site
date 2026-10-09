#!/usr/bin/env node
/**
 * validate:frozen-output-shrink - the frozen-output shrink floor, asked at
 * pull-request time instead of first in an unattended writer lane.
 *
 * THE DEFECT THIS EXISTS FOR. #107 (2026-09-25) legitimately thinned two
 * insight pages by >10% and merged green, because the only shrink check lived
 * in frozen_outputs.mjs freeze, which only the unattended lanes run. The next
 * morning Daily Citation Intelligence (run 36245956232) failed
 * FROZEN_OUTPUT_MATERIAL_SHRINK on both pages with nobody there to judge the
 * trim, and Spry Content Release hit the same freeze. This check reads the same
 * rule (scripts/authority_scale/frozen_output_shrink.mjs) against the tree being
 * proposed, so the change that shrinks a page is the change that must name the
 * shrink in data/release/frozen_output_shrink_acceptances.json.
 *
 * HARD FAILS:
 *  - any admitted page that is a material shrink (>= 2048 bytes and >= 10%) of
 *    its frozen blob with no acceptance naming that route, that frozen sha256,
 *    and a floor the page is still at or above;
 *  - a malformed acceptance (no route, no sha256, no positive floor, no reason);
 *  - a stale acceptance: its route is not frozen, or the frozen sha256 it was
 *    written against is no longer the one in force (freeze retires these);
 *  - Rule 0: zero frozen records examined, or a self-proof case that no longer
 *    fails when it should.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  SHRINK_BYTES, SHRINK_RATIO, SHRINK_ACCEPTANCES_REL,
  acceptanceDefects, classifyShrinks, loadShrinkAcceptances,
} from '../authority_scale/frozen_output_shrink.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REG = path.join(ROOT, 'data/release/frozen_output_registry.json');
const OUT = path.join(ROOT, 'artifacts/validation/frozen-output-shrink.json');
const errors = [];

// Self-proof: the classifier must still refuse what it exists to refuse.
const sha = (c) => c.repeat(64);
const proof = [
  ['unaccepted material shrink is refused', [{ route: '/p', before: 25000, after: 22000, frozen_sha256: sha('a') }], [], 1],
  ['small shrink is not material', [{ route: '/p', before: 25000, after: 24000, frozen_sha256: sha('a') }], [], 0],
  ['accepted shrink at the floor passes', [{ route: '/p', before: 25000, after: 22000, frozen_sha256: sha('a') }],
    [{ route: '/p', from_sha256: sha('a'), floor_bytes: 22000, reason: 'x'.repeat(40) }], 0],
  ['page below the accepted floor is refused', [{ route: '/p', before: 25000, after: 21000, frozen_sha256: sha('a') }],
    [{ route: '/p', from_sha256: sha('a'), floor_bytes: 22000, reason: 'x'.repeat(40) }], 1],
  ['acceptance written against another baseline is refused', [{ route: '/p', before: 25000, after: 22000, frozen_sha256: sha('b') }],
    [{ route: '/p', from_sha256: sha('a'), floor_bytes: 22000, reason: 'x'.repeat(40) }], 1],
  ['acceptance with no reason is refused', [{ route: '/p', before: 25000, after: 22000, frozen_sha256: sha('a') }],
    [{ route: '/p', from_sha256: sha('a'), floor_bytes: 22000, reason: '' }], 1],
];
let proofs = 0;
for (const [label, shrinks, acceptances, expected] of proof) {
  const got = classifyShrinks(shrinks, acceptances).material.length;
  if (got !== expected) errors.push(`self-proof "${label}": expected ${expected} refused, got ${got}`);
  proofs += 1;
}

const registry = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, 'utf8')) : { records: {} };
const records = registry.records || {};
const acceptances = loadShrinkAcceptances(ROOT).acceptances;

for (const a of acceptances) {
  const defects = acceptanceDefects(a);
  if (defects.length) errors.push(`${SHRINK_ACCEPTANCES_REL}: acceptance for ${a.route || '(no route)'} is malformed: ${defects.join('; ')}`);
  else if (!records[a.route]) errors.push(`${SHRINK_ACCEPTANCES_REL}: acceptance for ${a.route} names a route that is not frozen`);
  else if (records[a.route].sha256 !== a.from_sha256) errors.push(`${SHRINK_ACCEPTANCES_REL}: acceptance for ${a.route} was written against frozen ${a.from_sha256.slice(0, 12)} but ${records[a.route].sha256.slice(0, 12)} is in force; freeze retires consumed acceptances, so this one is stale`);
}

let examined = 0;
const shrinks = [];
for (const [route, r] of Object.entries(records)) {
  const page = path.join(ROOT, r.path || '');
  const blob = path.join(ROOT, r.blob || '');
  if (!r.path || !fs.existsSync(page) || !fs.existsSync(blob)) continue;
  examined += 1;
  let before;
  try { before = zlib.gunzipSync(fs.readFileSync(blob)).length; } catch { errors.push(`${r.blob}: unreadable frozen blob for ${route}`); continue; }
  const after = fs.statSync(page).size;
  if (after < before) shrinks.push({ route, path: r.path, before, after, lost: before - after, ratio: Number(((before - after) / before).toFixed(4)), frozen_sha256: r.sha256 });
}
if (!examined) errors.push('examined 0 frozen records; a shrink check that reads no page proves nothing (Rule 0)');

const { material, accepted } = classifyShrinks(shrinks, acceptances);
for (const s of material) {
  errors.push(`${s.path}: ${s.lost} bytes (${(s.ratio * 100).toFixed(1)}%) below its frozen output with no named acceptance. If the trim is intended, add {route: "${s.route}", from_sha256: "${s.frozen_sha256}", floor_bytes: ${s.after}, reason} to ${SHRINK_ACCEPTANCES_REL}; if not, restore the content.`);
}

const report = {
  validator: 'validate:frozen-output-shrink',
  status: errors.length ? 'FAIL' : 'PASS',
  threshold: { bytes: SHRINK_BYTES, ratio: SHRINK_RATIO },
  examined_frozen_records: examined,
  self_proofs: proofs,
  shrunk: shrinks.length,
  accepted: accepted.map(({ route, before, after, floor_bytes }) => ({ route, before, after, floor_bytes })),
  refused: material,
  acceptances: acceptances.length,
  errors,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
if (errors.length) {
  console.error(`[validate:frozen-output-shrink] FAIL: ${errors.length} issue(s)`);
  for (const e of errors.slice(0, 40)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[validate:frozen-output-shrink] PASS: ${examined} frozen page(s) examined; ${shrinks.length} shrunk, ${accepted.length} by a named acceptance, 0 material shrink unaccepted; ${proofs} self-proof case(s)`);
