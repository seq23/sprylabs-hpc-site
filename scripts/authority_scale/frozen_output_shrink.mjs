// Material-shrink rules for the frozen output store, shared by the writer
// (frozen_outputs.mjs freeze) and the pull-request check
// (scripts/validators/validate_frozen_output_shrink.mjs).
//
// WHY THIS IS SHARED, AND WHY THERE IS A NAMED ACCEPTANCE.
//
// freeze() refuses to re-freeze a page that lost >= 2048 bytes AND >= 10% of
// itself, and the only way past it was FROZEN_OUTPUT_ACCEPT_SHRINK=1 - an
// environment variable, so an acceptance was a thing a person typed into one
// run and nothing recorded. And freeze() only runs in the unattended writer
// lanes. So a reviewed pull request that legitimately thins a page merges
// green, and the NEXT unattended lane is the first thing to see the shrink,
// with no human there to accept it.
//
// That is exactly 2026-09-26: #107 gave 112 insight posts real descriptions in
// place of the boilerplate "- a calm, executable framework (Spry Executive OS)."
// The longer text put two of them over the word-count floor, so
// auto_expand_short_pages.js (correctly) dropped its "Implementation notes"
// filler, and the visible FAQ that had been built from that filler fell below
// three questions and was dropped with it. Daily Citation Intelligence run
// 36245956232 then failed FROZEN_OUTPUT_MATERIAL_SHRINK on those two pages, and
// Spry Content Release failed on the same freeze.
//
// Now: an intended shrink is a NAMED acceptance in
// data/release/frozen_output_shrink_acceptances.json - the route, the frozen
// sha256 it lowers the floor from, the new floor in bytes, and the reason - and
// the pull-request check fails any material shrink with no acceptance behind
// it, so the author of the change is the one asked. The sibling repository's
// shape (local-guides-citation-velocity's rendered-output shrink licences, PR
// #159) treats a named size as a lowered FLOOR, not an exact pin, and so does
// this: a page at or above floor_bytes passes, a page below it still fails.
// freeze() retires an acceptance once the frozen baseline it was written
// against has moved, so none outlives the shrink it licensed.
import fs from 'node:fs';
import path from 'node:path';

export const SHRINK_BYTES = Number(process.env.FROZEN_OUTPUT_SHRINK_BYTES || 2048);
export const SHRINK_RATIO = Number(process.env.FROZEN_OUTPUT_SHRINK_RATIO || 0.10);
export const SHRINK_ACCEPTANCES_REL = 'data/release/frozen_output_shrink_acceptances.json';

export function isMaterialShrink(before, after, bytes = SHRINK_BYTES, ratio = SHRINK_RATIO) {
  if (!(after < before)) return false;
  const lost = before - after;
  return lost >= bytes && lost / before >= ratio;
}

export function loadShrinkAcceptances(root) {
  const abs = path.join(root, SHRINK_ACCEPTANCES_REL);
  if (!fs.existsSync(abs)) return { schema_version: '1.0', acceptances: [] };
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return { ...data, acceptances: Array.isArray(data.acceptances) ? data.acceptances : [] };
}

export function writeShrinkAcceptances(root, data) {
  fs.writeFileSync(path.join(root, SHRINK_ACCEPTANCES_REL), JSON.stringify(data, null, 2) + '\n');
}

// Structural defects in one acceptance. An acceptance that cannot say what it
// accepts, from which baseline, down to what floor, and why, is refused.
export function acceptanceDefects(a = {}) {
  const defects = [];
  if (!a.route || typeof a.route !== 'string') defects.push('route missing');
  if (!/^[0-9a-f]{64}$/.test(String(a.from_sha256 || ''))) defects.push('from_sha256 is not a sha256');
  if (!Number.isInteger(a.floor_bytes) || a.floor_bytes <= 0) defects.push('floor_bytes is not a positive integer');
  if (String(a.reason || '').trim().length < 40) defects.push('reason is missing or too short to review');
  return defects;
}

// The acceptance that licenses THIS shrink, or null. It must name the route,
// have been written against the frozen baseline actually in force (so it cannot
// licence a later, different shrink), and the page must still be at or above
// the floor it names.
export function acceptanceFor(route, frozenSha256, afterBytes, acceptances = []) {
  return acceptances.find((a) => a.route === route
    && a.from_sha256 === frozenSha256
    && acceptanceDefects(a).length === 0
    && afterBytes >= a.floor_bytes) || null;
}

// shrinks: [{route, before, after, frozen_sha256}] -> {material, accepted}
export function classifyShrinks(shrinks, acceptances) {
  const material = [];
  const accepted = [];
  for (const s of shrinks) {
    if (!isMaterialShrink(s.before, s.after)) continue;
    const a = acceptanceFor(s.route, s.frozen_sha256, s.after, acceptances);
    if (a) accepted.push({ ...s, floor_bytes: a.floor_bytes, reason: a.reason });
    else material.push(s);
  }
  return { material, accepted };
}
