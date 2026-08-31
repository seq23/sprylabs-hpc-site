#!/usr/bin/env node
// Two failures this repo could not see, guarded together because they are the
// same defect at two altitudes: the build stopped producing a correct tree, and
// nothing said so.
//
// 1. DECLARED ROUTE WITHOUT A SOURCE. Several registries declare a public route
//    and name the repo-relative file that answers it. Build stages open those
//    files by path. When a declared route's source is absent, `build:all` dies
//    mid-stage with a bare FileNotFoundError naming one file, leaving a
//    half-built tree behind - and the next run dies again, one file later. This
//    validator reports EVERY such route in one pass, so the class is fixed at
//    once rather than one instance per broken build.
//
// 2. A BUILD THAT NEVER FINISHED. On 2026-08-30 `build:all` died partway and was
//    not noticed for hours; it surfaced only because a human ran it by hand.
//    build:all now stamps artifacts/build/build_all_state.json IN_PROGRESS
//    before its first stage and COMPLETE after its last, so a build that dies
//    partway leaves evidence a validator can hard-fail on instead of a tree that
//    merely looks stale.
//
// Rule 0: this validator hard-fails when it examines zero declared routes. An
// empty registry, a renamed file, or a schema change that silently yields no
// items is a failure here, never a pass on an empty loop.
import fs from 'node:fs';
import path from 'node:path';
import { buildAllStages, SENTINEL_REL } from '../internal/record_build_all_state.mjs';

const ROOT = process.cwd();
const errors = [];

function load(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    errors.push(`${rel}: unparseable (${e.message})`);
    return null;
  }
}

// Each source is declared by name with the extractor that reads it. A registry
// that goes missing, or whose shape changes so the extractor yields nothing, is
// reported rather than skipped - that silent-skip is how a guard stops guarding
// while still printing PASS.
const ROUTE_SOURCES = [
  {
    rel: 'data/routes/public_route_manifest.json',
    extract: (p) => (p.routes || []).map((r) => ({ id: r.route_id || r.path, file: r.source_file })),
  },
  {
    rel: 'data/citation/citable_pages.json',
    extract: (p) => {
      const rows = Array.isArray(p) ? p : p.pages || p.records || p.entries || [];
      return rows.map((r) => (typeof r === 'string'
        ? { id: r, file: r }
        : { id: r.route_id || r.path || r.url || r.source_file, file: r.source_file || r.path || r.page }));
    },
  },
  {
    rel: 'data/content/page_admission_registry.json',
    // This registry carries TWO independent lists, not one: `records` holds the
    // 2,224 admitted content pages, `pages` holds the handful of authority
    // whitepapers. Reading whichever key happened to be found first covered 3 of
    // 2,227 while still reporting the source as OK - a guard that barely reached
    // what it governed. Both lists are unioned, and the per-source count in the
    // summary is what makes a regression here visible.
    extract: (p) => [...(Array.isArray(p.records) ? p.records : []), ...(Array.isArray(p.pages) ? p.pages : [])]
      .map((r) => (typeof r === 'string'
        ? { id: r, file: r }
        : { id: r.route || r.path || r.source_file || r.file, file: r.source_file || r.path || r.file })),
  },
];

// A path only counts as "has a source" if the build could actually open it.
// Extensionless routes are accepted through their .html and /index.html shapes,
// because that is exactly how the route contract resolves them.
function resolves(file) {
  if (!file || typeof file !== 'string') return false;
  const rel = file.replace(/^\/+/, '');
  if (!rel) return false;
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return true;
  if (fs.existsSync(`${abs}.html`)) return true;
  if (fs.existsSync(path.join(abs, 'index.html'))) return true;
  return false;
}

let examined = 0;
const missing = [];
const perSource = {};

for (const source of ROUTE_SOURCES) {
  const payload = load(source.rel);
  if (payload === null) {
    // These registries are tracked in git and read by build stages, so absence
    // is a real signal, never a fresh-checkout artefact.
    errors.push(`${source.rel}: declared route source is missing from the tree`);
    perSource[source.rel] = { declared: 0, missing: 0, status: 'ABSENT' };
    continue;
  }
  let rows = [];
  try {
    rows = (source.extract(payload) || []).filter((r) => r && r.file);
  } catch (e) {
    errors.push(`${source.rel}: extractor failed (${e.message})`);
  }
  if (!rows.length) {
    errors.push(`${source.rel}: yielded zero declared routes; the registry shape changed or the registry is empty, so this source is no longer guarding anything`);
    perSource[source.rel] = { declared: 0, missing: 0, status: 'ZERO_ITEMS' };
    continue;
  }
  const gone = rows.filter((r) => !resolves(r.file));
  examined += rows.length;
  perSource[source.rel] = { declared: rows.length, missing: gone.length, status: gone.length ? 'MISSING_SOURCES' : 'OK' };
  for (const row of gone) missing.push(`${source.rel}: route ${row.id} declares source ${row.file}, which does not exist`);
}

if (examined === 0) {
  errors.push('Rule 0: examined zero declared routes across every registry; this validator asserted nothing.');
}
errors.push(...missing);

// --- build completion ---------------------------------------------------
let buildState = 'NOT_RUN_IN_THIS_TREE';
const sentinel = load(SENTINEL_REL);
if (sentinel) {
  buildState = sentinel.status || 'UNKNOWN';
  if (sentinel.status === 'IN_PROGRESS') {
    errors.push(`build:all started at ${sentinel.started_at} and never completed - the tree it left behind is half-built. Re-run \`npm run build:all\` to completion before trusting any generated content.`);
  } else if (sentinel.status !== 'COMPLETE') {
    errors.push(`${SENTINEL_REL}: unrecognised status ${JSON.stringify(sentinel.status)}`);
  } else {
    // A completed build whose recorded stage list no longer matches build:all
    // means stages were added or removed since; the evidence describes a
    // pipeline that no longer exists.
    const current = buildAllStages();
    const recorded = sentinel.stages || [];
    if (JSON.stringify(current) !== JSON.stringify(recorded)) {
      errors.push(`${SENTINEL_REL}: recorded ${recorded.length} build:all stages but package.json now declares ${current.length}; the completion evidence predates the current pipeline. Re-run \`npm run build:all\`.`);
    }
  }
}

const summary = {
  test_id: 'validate-build-all-integrity',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  declared_routes_examined: examined,
  declared_routes_missing_source: missing.length,
  build_state: buildState,
  sources: perSource,
  errors,
};
const runId = process.env.PROOF_RUN_ID || 'container-current';
const outDir = path.join(ROOT, 'artifacts', 'diagnostics', runId, 'validate-build-all-integrity');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

if (errors.length) {
  console.error(`[validate:build-all-integrity] FAIL: ${errors.length} problem(s); examined ${examined} declared route(s); build state ${buildState}`);
  for (const e of errors.slice(0, 50)) console.error(` - ${e}`);
  if (errors.length > 50) console.error(` - ...and ${errors.length - 50} more`);
  process.exit(1);
}
console.log(`[validate:build-all-integrity] PASS: ${examined} declared route(s) all resolve to a source file; build state ${buildState}`);
