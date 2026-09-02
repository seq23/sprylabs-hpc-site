#!/usr/bin/env node
/**
 * Every whitepaper on disk must be a page the admission registry admitted, and
 * every whitepaper the registry admits must be on disk.
 *
 * WHY THIS EXISTS
 *
 * build_authority_papers.js renders a paper and then admits it, in that order.
 * Admission can refuse - correctly, when the paper stands on no demand-backed
 * registered query - and the refusal was a `continue`. The HTML stayed on disk.
 *
 * That produced a page that is published (it is in the tree the release lane
 * commits, and it renders at its URL) and simultaneously unadmitted. And an
 * unadmitted page is invisible to validate:demand-backed-pages, whose demand
 * check and admission-level check both walk data/content/page_admission_registry.json
 * - the very list the refusal kept it out of.
 *
 * So the refusal converted a LOUD failure into a SILENT one. Before the refusal
 * existed, the writer admitted the paper dishonestly at `baseline` with a
 * primary_query invented from its own title, validate:demand-backed-pages caught
 * it, and the release went red daily until someone fixed it. Reproduced on
 * 2026-09-02: two refused papers left on disk, and the entire content-quality
 * profile passed. That is the "two components each keeping their own list with
 * no link" defect - disk is one list, the registry is the other.
 *
 * The writer now refuses BEFORE rendering, so the orphan is not created. This
 * validator is the standing proof of that, and it is what fails if the order is
 * ever swapped back, if a new writer renders into whitepapers/ without admitting,
 * or if a record is admitted for a page that was never built.
 *
 * ZERO-ITEM BEHAVIOUR: this check is a set comparison, and comparing two empty
 * sets succeeds while proving nothing. An empty whitepapers/ directory or an
 * admission registry with no authority-lane records is therefore a HARD FAIL,
 * not a pass on an empty loop.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TAG = '[authority-paper-disk-registry-parity]';
const REGISTRY = 'data/content/page_admission_registry.json';
const DIR = 'whitepapers';

function fail(...lines) {
  console.error(`${TAG} FAIL:`);
  for (const l of lines) console.error(`  - ${l}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, DIR))) {
  fail(`${DIR}/ does not exist. This validator compares that directory against the admission registry; with no directory it would compare nothing and report success.`);
}

const disk = new Set(
  fs.readdirSync(path.join(ROOT, DIR))
    .filter((f) => f.endsWith('.html'))
    .map((f) => `${DIR}/${f}`)
);
if (disk.size === 0) {
  fail(`${DIR}/ contains no .html files, so the disk side of this comparison is empty and parity would hold vacuously. Either the papers were lost or this validator is pointed at the wrong directory; both need a human.`);
}

let registry;
try {
  registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY), 'utf8'));
} catch (err) {
  fail(`${REGISTRY} could not be read or parsed (${err.message}). The registry side of this comparison would be empty and every page on disk would read as an orphan or, worse, the comparison would be skipped.`);
}
const records = registry.records || registry.pages || [];
if (!records.length) {
  fail(`${REGISTRY} carries no admitted pages, so the registry side of this comparison is empty. An empty registry proves nothing about parity.`);
}

const admitted = new Set(
  records
    .map((r) => r.path || String(r.route || '').replace(/^\//, ''))
    .filter((p) => p.startsWith(`${DIR}/`))
);
if (admitted.size === 0) {
  fail(`no record in ${REGISTRY} points at a page under ${DIR}/, so the lane this validator governs was not examined at all. ${disk.size} file(s) are on disk and none of them is admitted.`);
}

// A paper may be deliberately retired: kept on disk (nothing here is ever
// deleted) but withdrawn from admission. That is a legitimate state and must be
// declared, by flag, so it is distinguishable from an orphan left by a refusal.
const RETIRED = 'data/content/retired_authority_papers.json';
let retired = new Set();
if (fs.existsSync(path.join(ROOT, RETIRED))) {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, RETIRED), 'utf8'));
  retired = new Set((doc.retired || []).map((r) => (typeof r === 'string' ? r : r.path)).filter(Boolean));
}

const orphans = [...disk].filter((p) => !admitted.has(p) && !retired.has(p)).sort();
const ghosts = [...admitted].filter((p) => !disk.has(p)).sort();

const errors = [];
if (orphans.length) {
  errors.push(
    `${orphans.length} whitepaper(s) are on disk but carry no record in ${REGISTRY}. They render at their URL and ship in the release commit, while every registry-driven check - including validate:demand-backed-pages - cannot see them. Either admit them against a demand-backed registered query, or declare them retired in ${RETIRED}:\n    ` +
    orphans.slice(0, 20).join('\n    ')
  );
}
if (ghosts.length) {
  errors.push(
    `${ghosts.length} page(s) are admitted under ${DIR}/ but have no file on disk. The registry asserts a published page that does not exist:\n    ` +
    ghosts.slice(0, 20).join('\n    ')
  );
}
if (errors.length) fail(...errors);

const retiredOnDisk = [...retired].filter((p) => disk.has(p)).length;
console.log(
  `${TAG} PASS: ${disk.size} whitepaper file(s) on disk reconcile with ${admitted.size} admitted record(s)` +
  `${retiredOnDisk ? `, ${retiredOnDisk} declared retired` : ''}; 0 unadmitted page(s) published and 0 admitted page(s) missing.`
);
