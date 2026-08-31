#!/usr/bin/env node
/**
 * Static guard: no writer of <script id="CITATION_PAGE_SCHEMA"> may serialize it
 * on its own.
 *
 * scripts/lib/citation_page_schema.{cjs,py} is the single source of truth for how
 * that block is written - compact JSON with `<` escaped, and mainEntityOfPage as
 * {"@id": canonical}. scripts/validation/validate_citation_schema_serialization.mjs
 * already fails when a page ON DISK does not match it. That check is necessary and
 * it is not sufficient, because it only ever sees the tree in the state the last
 * build step happened to leave it in.
 *
 * What it could not see: scripts/content/repair_programmatic_registry_owners.mjs
 * re-emitted the block with JSON.stringify(data, null, 2). It runs in
 * release:content-finalize, AFTER build:all has normalised the tree, so it
 * un-normalised every page it touched and the next build normalised them back.
 * Neither build looked wrong on its own; the pair of them produced thousands of
 * files of pure whitespace churn, a frozen output store that "kept reverting",
 * and 1,485 pages failing the serialization contract. The bypass was invisible to
 * an output check because whichever writer ran last always looked correct.
 *
 * So this check reads code, not pages. A script that emits HTML carrying the block
 * and does not go through the authority fails here, at the commit that introduces
 * it, instead of surfacing as unexplained churn weeks later. This is the "two
 * components each keeping their own list with no link" defect, caught statically.
 *
 * Rule 0: it fails if it examined zero writers. A code guard whose file discovery
 * silently stops matching would otherwise pass forever while policing nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SCHEMA_ID = 'CITATION_PAGE_SCHEMA';

/** These DEFINE the serialization, so they necessarily contain it. */
const AUTHORITY_FILES = new Set([
  'scripts/lib/citation_page_schema.cjs',
  'scripts/lib/citation_page_schema.py',
]);

/**
 * Individually exempt, each for a stated reason. This is not a place to silence a
 * real finding - a writer that is genuinely wrong gets fixed, not listed here.
 */
const EXEMPT = new Map([
  [
    'scripts/repair/repair_download_contract.mjs',
    'strips every OTHER ld+json block from download.html and names CITATION_PAGE_SCHEMA only inside a negative lookahead that PRESERVES it. It never emits the block, so it has nothing to serialize.',
  ],
]);

/** Writes HTML content to disk, as opposed to writing a JSON report. */
const WRITES_HTML = new RegExp(
  [
    String.raw`writeFileSync\s*\(\s*[^,]+,\s*(html|out|raw|rendered|next|updated|doc|page)\b`,
    String.raw`write_text\s*\(\s*(html|out|raw|rendered|str\(soup\)|soup)`,
    String.raw`writeFileSync\s*\([^,]*\.html`,
  ].join('|'),
);

/** Importing the authority, in either language. */
const IMPORTS_AUTHORITY = /citation_page_schema/;

function listScriptFiles() {
  return execFileSync('git', ['ls-files', 'scripts/'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.(mjs|cjs|js|py)$/.test(f));
}

const violations = [];
const writers = [];
let examined = 0;

for (const rel of listScriptFiles()) {
  if (AUTHORITY_FILES.has(rel)) continue;

  let src;
  try {
    src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    continue;
  }

  // Mentioning the block is necessary but nowhere near sufficient - most files
  // that mention it only read or match it. A writer also emits HTML.
  if (!src.includes(SCHEMA_ID)) continue;
  if (!WRITES_HTML.test(src)) continue;

  examined += 1;
  writers.push(rel);

  if (EXEMPT.has(rel)) continue;

  if (!IMPORTS_AUTHORITY.test(src)) {
    violations.push({
      path: rel,
      reason:
        `emits HTML carrying the ${SCHEMA_ID} block but never imports scripts/lib/citation_page_schema.{cjs,py}. ` +
        'Import serializeSchema()/serialize_schema() and mainEntityOfPage()/main_entity_of_page() and emit through them.',
    });
    continue;
  }

  // A file can import the authority for one code path and still hand-roll a
  // serializer for another. That is the partial bypass, and it is what
  // repair_programmatic_registry_owners.mjs did. Flag a raw serializer that is
  // feeding the block itself - not one writing a JSON report.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // A comment is not an emission. Both of these files DOCUMENT the serializer
    // they used to misuse, and naming the old call in prose must not be graded
    // as making it - otherwise writing down the fix re-triggers the finding.
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) continue;
    if (!/JSON\.stringify\s*\(|json\.dumps\s*\(/.test(line)) continue;
    // A serializer writing a report or a registry is not the block.
    if (/artifacts\/|report|registry|\.json['"]|indent=2\)|_path|Path\(/.test(line)) continue;
    // Only flag one that is near the block's construction.
    const window = lines.slice(Math.max(0, i - 25), i + 6).join('\n');
    if (!window.includes(SCHEMA_ID)) continue;
    violations.push({
      path: rel,
      reason:
        `line ${i + 1} serializes the ${SCHEMA_ID} block with a raw ` +
        `${line.includes('json.dumps') ? 'json.dumps' : 'JSON.stringify'} instead of the authority's ` +
        'serializeSchema()/serialize_schema(). Every emission of this block goes through the authority.',
    });
  }
}

const report = {
  status: violations.length === 0 ? 'PASS' : 'FAIL',
  writers_examined: examined,
  writers,
  exempt: [...EXEMPT.entries()].map(([p, why]) => ({ path: p, reason: why })),
  violations,
};
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'artifacts/validation/citation-schema-authority-reach.json'),
  JSON.stringify(report, null, 2) + '\n',
);

// Rule 0: no stage exits 0 having done nothing.
if (examined === 0) {
  console.error(
    `[validate:citation-schema-authority-reach] FAIL: examined 0 writers of ${SCHEMA_ID}. ` +
    'Either the block was renamed or file discovery stopped matching; this guard cannot pass on an empty loop.',
  );
  process.exit(1);
}

if (violations.length > 0) {
  console.error(
    `[validate:citation-schema-authority-reach] FAIL: ${violations.length} authority bypass(es) ` +
    `across ${examined} writer(s) of ${SCHEMA_ID}`,
  );
  for (const v of violations) console.error(`  ${v.path}: ${v.reason}`);
  process.exit(1);
}

console.log(
  `[validate:citation-schema-authority-reach] PASS: all ${examined} writer(s) of ${SCHEMA_ID} ` +
  `emit it through scripts/lib/citation_page_schema.*; ${EXEMPT.size} individually exempt`,
);
