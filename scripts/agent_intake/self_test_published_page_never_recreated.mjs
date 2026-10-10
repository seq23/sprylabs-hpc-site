#!/usr/bin/env node
// A PUBLISHED AGENT PAGE IS REPAIRED, NEVER RE-CREATED. PROVE IT BY RUNNING IT.
//
// 2026-10-10, Spry Content Release run 38068034223: the 2026-10-10 Twin Agent
// drop asked to create "identify unmet needs in the market that my competitor
// hasn't addressed yet", a page the 2026-09-12 drop had already created and that
// had been published (frozen) since. The plan builder planned it
// CREATE_NEW_TARGET_PAGE again because the page carried our ownership marker,
// and apply-exact's CREATE branch rebuilt the published page from the bare
// template, discarding the word-count section, related-page nav and
// recommendation summary that build:all adds in earlier stages. The page went
// 15,995 -> 9,305 bytes (-41.8%) and authority:scale:freeze stopped the release
// on FROZEN_OUTPUT_MATERIAL_SHRINK.
//
// This test runs the REAL plan builder and applier in a scratch tree
// (self_test_scratch_repo.mjs) and proves:
//   1. A page created in this run and not yet frozen is still planned CREATE
//      on a re-plan, and the re-apply is byte-idempotent (the reason the CREATE
//      rebuild of an owned page exists at all).
//   2. NEGATIVE (the defect's mechanism): with no frozen baseline, an enriched
//      owned page is re-planned CREATE and the apply DISCARDS its enrichment.
//   3. Once the page is in data/release/frozen_output_registry.json it is planned
//      REPAIR_INTENDED_WINNER_PAGE, and the apply KEEPS the enrichment and never
//      shrinks the page; the unfrozen sibling stays CREATE.
// Hard-fails on zero assertions.
import fs from 'node:fs';
import path from 'node:path';
import {PAGES, writeJson, makeScratch, plan, apply} from './self_test_scratch_repo.mjs';
import {isMaterialShrink} from '../authority_scale/frozen_output_shrink.mjs';

const TAG = '[published-page-never-recreated-self-test]';
const FROZEN = 'data/release/frozen_output_registry.json';
const ENRICHMENT = '<section class="card" data-content-contract="word-count-repair"><h2>Implementation notes</h2><p>Enrichment a later build stage added to the published page; a re-plan must never discard it.</p></section>';
let assertions = 0;
let failures = 0;
function check(ok, msg) { assertions += 1; if (!ok) { failures += 1; console.error(`${TAG} FAIL: ${msg}`); } else console.log(`${TAG} ok: ${msg}`); }
const bytes = (root, rel) => fs.readFileSync(path.join(root, rel));
const opFor = (p, rel) => (p.specs.find((s) => s.implementation_path === rel) || {}).operation;
function enrich(root, rel) {
  const html = bytes(root, rel).toString('utf8');
  const out = /<\/main>/i.test(html) ? html.replace(/<\/main>/i, `${ENRICHMENT}\n</main>`) : html.replace(/<\/body>/i, `${ENRICHMENT}\n</body>`);
  fs.writeFileSync(path.join(root, rel), out);
  return Buffer.byteLength(out);
}

const scratch = makeScratch();
try {
  const [published, fresh] = PAGES;

  // 1. First run: both pages are new and are created.
  let p = plan(scratch);
  check(opFor(p, published) === 'CREATE_NEW_TARGET_PAGE' && opFor(p, fresh) === 'CREATE_NEW_TARGET_PAGE', 'first plan creates both fixture pages');
  apply(scratch);
  check(PAGES.every((rel) => fs.existsSync(path.join(scratch, rel))), 'first apply writes both pages');
  p = plan(scratch);
  check(opFor(p, fresh) === 'CREATE_NEW_TARGET_PAGE', 'a page created this run and not frozen is still planned CREATE on a re-plan');
  apply(scratch);
  const freshSecond = bytes(scratch, fresh);
  plan(scratch); apply(scratch);
  check(bytes(scratch, fresh).equals(freshSecond), 'the CREATE rebuild of an unfrozen created page reaches a byte fixed point across plan passes');

  // 2. NEGATIVE: later stages enrich the page; with no frozen baseline the re-plan
  // is CREATE and the rebuild discards the enrichment - the 2026-10-10 shrink.
  let enrichedSize = enrich(scratch, published);
  p = plan(scratch);
  check(opFor(p, published) === 'CREATE_NEW_TARGET_PAGE', 'NEGATIVE: unfrozen owned page re-plans as CREATE');
  apply(scratch);
  const rebuilt = bytes(scratch, published).toString('utf8');
  check(!rebuilt.includes('data-content-contract="word-count-repair"') && Buffer.byteLength(rebuilt) < enrichedSize, 'NEGATIVE: the CREATE rebuild discards the enrichment and shrinks the page (the mechanism this test guards)');

  // 3. The page is published: it sits in the frozen accepted-output baseline.
  enrichedSize = enrich(scratch, published);
  writeJson(path.join(scratch, FROZEN), {schema_version: '1.1', policy: 'accepted_output_freeze', records: {[`/${published}`]: {path: published, sha256: '0'.repeat(64), blob: 'fixture'}}});
  p = plan(scratch);
  check(opFor(p, published) === 'REPAIR_INTENDED_WINNER_PAGE', 'a frozen (published) owned page is planned REPAIR_INTENDED_WINNER_PAGE, not CREATE');
  check(opFor(p, fresh) === 'CREATE_NEW_TARGET_PAGE', 'the unfrozen sibling stays CREATE');
  apply(scratch);
  const repaired = bytes(scratch, published).toString('utf8');
  check(repaired.includes('data-content-contract="word-count-repair"'), 'the repair keeps the enrichment later stages added');
  check(!isMaterialShrink(enrichedSize, Buffer.byteLength(repaired)), `the repair is not a material shrink of the published page by the freeze's own rule (${enrichedSize} -> ${Buffer.byteLength(repaired)} bytes)`);
  const once = bytes(scratch, published);
  plan(scratch); apply(scratch);
  check(bytes(scratch, published).equals(once), 're-applying the repair is byte-idempotent');
} finally {
  fs.rmSync(scratch, {recursive: true, force: true});
}

if (assertions === 0) { console.error(`${TAG} FAIL: zero assertions ran`); process.exit(1); }
if (failures) { console.error(`${TAG} FAIL: ${failures}/${assertions} assertion(s) failed`); process.exit(1); }
console.log(`${TAG} PASS: ${assertions} assertion(s)`);
