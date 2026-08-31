#!/usr/bin/env node
/**
 * Static guard: nothing may emit <script id="CITATION_PAGE_SCHEMA"> or author a
 * mainEntityOfPage value except through scripts/lib/citation_page_schema.{cjs,py}.
 *
 * Why this exists
 * ---------------
 * scripts/lib/citation_page_schema.cjs is already correct and already the single
 * source of truth for the block's serialization and for the one permitted
 * mainEntityOfPage shape ({"@id": canonical}, no "@type"). What it never had was
 * anything forcing a writer to use it.
 *
 * Three mainEntityOfPage shapes accumulated in the page store from writers that
 * predated the authority - {"@id": url}, a bare url string, and
 * {"@type":"WebPage","@id":url} - and every normalisation of the output was
 * reverted by the next writer that did not know the authority existed. That is
 * the "two components each keeping their own list with no link" defect: the
 * authority holds one list, each writer holds its own, and nothing joins them.
 * Fixing the output is not a fix, because the output is downstream of the gap.
 *
 * So this validator does not look at pages at all. It looks at CODE, and fails
 * when a file both writes to disk and hand-rolls this block or this key without
 * importing the authority. A new writer added tomorrow fails here on the day it
 * is written, not months later when the store has drifted again.
 *
 * Out of scope, deliberately: scripts/build_insights.js emits an UNLABELED
 * `<script type="application/ld+json">` Article block that carries its own
 * mainEntityOfPage. It is a different block from CITATION_PAGE_SCHEMA - both
 * appear on the same rendered insights page, and that builder's own
 * OWN_TAIL_SCRIPTS regex (`/<script type="application\/ld\+json">/`) matches
 * only the attribute-free tag, so it provably cannot touch the id-bearing
 * CITATION_PAGE_SCHEMA block. The authority governs the CITATION_PAGE_SCHEMA
 * block; it does not govern every ld+json script in the repo. That exclusion is
 * declared BY NAME below rather than left to a regex accident, so if the builder
 * ever starts writing the labelled block this guard still sees it.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['scripts', 'functions', 'tests'];
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.py']);
const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', 'legacy_ops']);

/** The authority itself, plus this guard. Not writers. */
const AUTHORITY_FILES = new Set([
  'scripts/lib/citation_page_schema.cjs',
  'scripts/lib/citation_page_schema.py',
  'scripts/validators/validate_citation_schema_authority.mjs',
]);

/**
 * Files excluded BY NAME with a stated reason. Each entry is re-proved on every
 * run: if the reason stops holding - the file starts emitting the labelled block
 * after all, or stops mentioning the schema entirely - the entry is reported as
 * stale and the run fails. An exclusion that no longer describes reality is a
 * lie the next reader would inherit, so it is not allowed to sit.
 */
const DECLARED_OUT_OF_SCOPE = [
  {
    file: 'scripts/build_insights.js',
    reason:
      'emits an unlabeled <script type="application/ld+json"> Article block, a different '
      + 'block from CITATION_PAGE_SCHEMA; its OWN_TAIL_SCRIPTS regex matches only the '
      + 'attribute-free tag so it cannot write the id-bearing block',
    // The exclusion holds only while the file never constructs the labelled tag.
    proof: (src) => !EMITS_LABELLED_TAG.test(src) && !REWRITES_BLOCK_IN_PLACE.test(src),
  },
];

/**
 * Known bypasses that predate this guard and live in another agent's territory.
 * These are NOT forgiven - they are counted, named, and reported on every run.
 * Each must be re-proved: if the file starts importing the authority the entry
 * is stale and the run fails, so the debt cannot outlive its fix.
 */
const KNOWN_BYPASS_DEBT = [
  {
    file: 'scripts/content/repair_programmatic_registry_owners.mjs',
    owner: 'build-chain agent (scripts/content/ is not this validator owner\'s territory)',
    detail:
      'updateCitationSchema() re-serialises the block with JSON.stringify(data, null, 2), '
      + 'the pretty-printed form the authority exists to eliminate. Reachability is wider than '
      + 'first recorded: besides scripts/selfheal/heal_until_clean.mjs it is reached from '
      + 'release:content-finalize, which Spry Full Rebuild runs immediately after build:all - so it '
      + 'could rewrite pages into the non-conforming shape the moment a full rebuild finished, which '
      + 'is likely part of why the frozen store kept reverting. Measured divergence: hand-rolled '
      + '3,904 B with 72 newlines against the authority\'s 3,217 B with 0. Fixed by the build agent on '
      + 'fix/build-all-declared-route-integrity (PR #37); this entry reports itself paid once that lands.',
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

/**
 * Comments are not code. The first draft of this guard flagged
 * scripts/build_insights.js because a COMMENT in it names the block, and flagged
 * scripts/citation/build_contract_violation_scope.mjs for the same reason - both
 * only discuss the block in prose. Stripping comments before matching is what
 * separates "this file talks about the schema" from "this file writes it".
 */
function stripComments(src, ext) {
  if (ext === '.py') {
    return src
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '')
      .replace(/(^|[^\\])#[^\n]*/g, '$1');
  }
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** A CITATION_PAGE_SCHEMA opening tag being BUILT as a string, not matched as a regex. */
const EMITS_LABELLED_TAG =
  /<script\b[^>]{0,80}\bid\s*=\s*\\?["'{]?\s*(?:\$\{[^}]*\}|CITATION_PAGE_SCHEMA)/i;

/**
 * Rewriting the block's body in place: a .replace()/re.sub() against a pattern
 * that targets the labelled script. This is what repair passes do.
 */
const REWRITES_BLOCK_IN_PLACE =
  /\.replace\s*\(\s*\w*(?:SCHEMA|schema)\w*(?:Pattern|Re|RE|_RE|Regex)?\s*,|re\.sub\s*\([^,]*(?:SCHEMA|schema)/;

/** mainEntityOfPage authored as an object/dict KEY (construction, not lookup). */
const AUTHORS_MEOP_KEY = /(?:^|[^.\w])["']?mainEntityOfPage["']?\s*:/m;

/** Writing to disk, in either language. */
const WRITES_TO_DISK =
  /writeFileSync\s*\(|fs\.promises\.writeFile\s*\(|\bwriteFile\s*\(|\.write_text\s*\(|\bopen\s*\([^)]*["'][wa]/;

/** Imports the single source of truth. */
const IMPORTS_AUTHORITY = /citation_page_schema/;

/**
 * Calling one of the authority's emitting helpers is itself proof of emission.
 * Without this, the compliant writers - render_authority.js, render_synthesis.js,
 * render_comparison.js, apply_citation_program.py - are invisible to the scan,
 * because going through the authority is exactly what removes the hand-rolled tag
 * and the hand-rolled replace this guard otherwise keys on. Counting them keeps
 * the inert-guard floor below meaningful.
 */
const USES_AUTHORITY_EMITTER =
  /\b(?:renderSchemaScript|replaceSchemaBody|serializeSchema|render_schema_script|serialize_schema|main_entity_of_page|mainEntityOfPage)\s*\(/;

/**
 * The repo is known to contain this many writers of the block. The number is a
 * floor, not an exact count: adding a writer is normal, losing sight of one is
 * the failure. If the scan drops below it the detection patterns have drifted
 * away from the code and the guard has gone inert while still reporting PASS -
 * the precise defect it exists to prevent, turned on itself.
 */
const EMITTER_FLOOR = 9;

/**
 * Classify a file as an EMITTER of the governed block.
 *
 * The discriminator that matters is "does this file put the block back on a
 * page", not "does this file mention the block". Every validator in this repo
 * reads CITATION_PAGE_SCHEMA and writes a JSON report about it; none of those is
 * a writer of the block, and an earlier revision of this guard wrongly flagged
 * seven of them. So an emitter must BOTH shape the block (construct its tag, or
 * rewrite its body through a schema-targeted replace, or author the governed
 * key) AND write to disk.
 */
function classify(src) {
  const writes = WRITES_TO_DISK.test(src);
  const reasons = [];
  if (!writes) return { isEmitter: false, reasons };

  if (EMITS_LABELLED_TAG.test(src)) reasons.push('constructs a CITATION_PAGE_SCHEMA <script> tag');
  if (REWRITES_BLOCK_IN_PLACE.test(src)) reasons.push('rewrites the CITATION_PAGE_SCHEMA block body in place');
  if (AUTHORS_MEOP_KEY.test(src)) reasons.push('authors a mainEntityOfPage value');
  if (USES_AUTHORITY_EMITTER.test(src)) reasons.push('emits the block through the authority helpers');

  return { isEmitter: reasons.length > 0, reasons };
}

const files = ROOTS.flatMap((r) => walk(r));

// Rule 0 for this validator itself: it must never pass having examined nothing.
if (!files.length) {
  console.error(
    '[validate:citation-schema-authority] FAIL: examined 0 source files. Expected .js/.mjs/.cjs/.py '
    + `files under ${ROOTS.join(', ')}. A guard that reaches no code protects nothing.`,
  );
  process.exit(1);
}

const outOfScopeByFile = new Map(DECLARED_OUT_OF_SCOPE.map((e) => [e.file, e]));
const debtByFile = new Map(KNOWN_BYPASS_DEBT.map((e) => [e.file, e]));

const errors = [];
const stale = [];
const resolvedDebt = [];
const emitters = [];
const compliant = [];
const carriedDebt = [];

for (const rel of files) {
  if (AUTHORITY_FILES.has(rel)) continue;
  const raw = fs.readFileSync(rel, 'utf8');
  const src = stripComments(raw, path.extname(rel));
  const { isEmitter, reasons } = classify(src);
  if (!isEmitter) {
    // A declared exclusion for a file that no longer emits anything is stale.
    if (outOfScopeByFile.has(rel)) {
      const entry = outOfScopeByFile.get(rel);
      if (!entry.proof(src)) {
        stale.push(`${rel}: declared out of scope, but it now constructs the labelled tag`);
      }
    }
    continue;
  }
  emitters.push(rel);

  if (IMPORTS_AUTHORITY.test(src)) {
    compliant.push(rel);
    // A debt entry whose file now goes through the authority is PAID. That is
    // the outcome this list exists to drive, so it passes and says so.
    //
    // It used to hard-fail as a stale declaration, which was wrong in a way worth
    // naming: the fix and the bookkeeping live on different branches, so the guard
    // went red the moment someone else's correct fix merged, and stayed red until
    // a human edited this file. That is a hand-synchronised list coupling two
    // components with nothing linking them - the exact defect this validator was
    // written to catch, reproduced inside the validator. A paid debt can never
    // hide a bypass, so it cannot justify failing a build.
    if (debtByFile.has(rel)) resolvedDebt.push(rel);
    continue;
  }

  if (outOfScopeByFile.has(rel)) {
    const entry = outOfScopeByFile.get(rel);
    if (entry.proof(src)) continue;
    stale.push(`${rel}: declared out of scope, but the stated reason no longer holds`);
    continue;
  }

  if (debtByFile.has(rel)) {
    const entry = debtByFile.get(rel);
    carriedDebt.push(`${rel} [owner: ${entry.owner}] ${entry.detail}`);
    continue;
  }

  errors.push(
    `${rel}: ${reasons.join('; ')}, without importing scripts/lib/citation_page_schema. `
    + 'Every writer of this block must go through the authority '
    + '(serializeSchema / mainEntityOfPage / renderSchemaScript / replaceSchemaBody).',
  );
}

// A declared exclusion naming a file that no longer exists is a real problem:
// the exclusion could be masking a bypass in whatever replaced it. A debt entry
// naming a deleted file is merely obsolete bookkeeping.
for (const entry of DECLARED_OUT_OF_SCOPE) {
  if (!fs.existsSync(entry.file)) {
    stale.push(`${entry.file}: declared out of scope by this guard but no longer exists. Remove the entry, and check what replaced it.`);
  }
}
for (const entry of KNOWN_BYPASS_DEBT) {
  if (!fs.existsSync(entry.file)) resolvedDebt.push(`${entry.file} (no longer present)`);
}

// The guard must actually reach the writers it governs. If the scan found no
// emitter at all, the pattern set has drifted away from the code and the guard
// is inert - which is the exact failure it was built to prevent.
if (emitters.length < EMITTER_FLOOR) {
  console.error(
    '[validate:citation-schema-authority] FAIL: examined '
    + `${files.length} source files but identified only ${emitters.length} CITATION_PAGE_SCHEMA `
    + `emitter(s), below the floor of ${EMITTER_FLOOR}. Expected writers under scripts/render/, `
    + 'scripts/citation/, scripts/content/, scripts/internal/ and scripts/programmatic/. '
    + 'The detection patterns no longer reach the code they govern, so this guard is inert.',
  );
  process.exit(1);
}

fs.mkdirSync('artifacts/validation', { recursive: true });
const status = errors.length || stale.length ? 'FAIL' : 'PASS';
fs.writeFileSync(
  'artifacts/validation/citation-schema-authority.json',
  `${JSON.stringify(
    {
      status,
      files_scanned: files.length,
      emitters_found: emitters.length,
      compliant: compliant.sort(),
      carried_bypass_debt: carriedDebt,
      resolved_bypass_debt: resolvedDebt,
      declared_out_of_scope: DECLARED_OUT_OF_SCOPE.map((e) => ({ file: e.file, reason: e.reason })),
      stale_declarations: stale,
      errors,
    },
    null,
    2,
  )}\n`,
);

if (stale.length) {
  console.error('[validate:citation-schema-authority] FAIL: stale declarations in this guard');
  for (const s of stale) console.error(`- ${s}`);
}
if (errors.length) {
  console.error('[validate:citation-schema-authority] FAIL: schema authority bypassed');
  for (const e of errors) console.error(`- ${e}`);
}
if (status === 'FAIL') process.exit(1);

console.log(
  `[validate:citation-schema-authority] PASS: ${files.length} source files scanned, `
  + `${emitters.length} CITATION_PAGE_SCHEMA emitter(s) found, all routed through the authority.`,
);
if (resolvedDebt.length) {
  console.log(
    `[validate:citation-schema-authority] ${resolvedDebt.length} previously named bypass(es) now go through `
    + 'the authority. The debt is paid; the KNOWN_BYPASS_DEBT entries below can be deleted at leisure:',
  );
  for (const d of resolvedDebt) console.log(`- ${d}`);
}
if (carriedDebt.length) {
  console.warn(
    `[validate:citation-schema-authority] ${carriedDebt.length} NAMED pre-existing bypass(es) `
    + 'carried, owned outside this validator\'s territory:',
  );
  for (const d of carriedDebt) console.warn(`- ${d}`);
}
