#!/usr/bin/env node
/**
 * VAL-CITATION-SCHEMA-SERIALIZATION
 *
 * Every <script id="CITATION_PAGE_SCHEMA"> on disk must be byte-identical to
 * what scripts/lib/citation_page_schema.cjs would have produced for the same
 * data - whichever of the fourteen writers actually produced it.
 *
 * What this catches, and what it cost to not have it: the writers used three
 * different serializations of the same JSON. scripts/programmatic/generate_aplayer_phase_expansion.mjs
 * pretty-printed with two-space indent, scripts/citation/repair_schema_parity.py
 * and scripts/content/build_visible_faq_sections.py used Python's default
 * spaced separators, and everything else was compact. Since several of those
 * run in one `npm run build:all`, a page was written one way and rewritten
 * another way inside a single build, and back again on the next one. The JSON
 * parsed identically every time - it was purely how it was printed - so nothing
 * failed. What it produced was a clean build:all leaving roughly 2,200 pages
 * modified with no editorial change in any of them, which makes every "did this
 * page actually change?" signal in this repo useless: lastmod evidence, the
 * cadence gate's date reasoning, and any reviewer trying to find the real change
 * in a diff.
 *
 * This is a shape check, not a content check. It re-serializes the parsed JSON
 * and compares bytes, so it cannot object to what a page says, only to how the
 * same thing was written down.
 *
 * Rule 0: it fails if it examined zero pages. A serialization check that finds
 * no schema blocks has not passed, it has not run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const ROOT = process.cwd();
const { SCHEMA_SCRIPT_RE, SERIALIZATION_EXEMPT, serializeSchema, mainEntityOfPageId } =
  requireCjs(path.join(ROOT, 'scripts/lib/citation_page_schema.cjs'));

// '.claude' holds agent worktrees - `git worktree add .claude/worktrees/<id>`
// puts a COMPLETE second checkout of this repository inside the working tree.
// Without this entry the walker descended into it and graded another checkout's
// pages as if they were ours: a clean tree reported 1,486 failures, every one of
// them under .claude/worktrees/, while all 2,254 pages of this repo conformed.
// A validator must grade the tree it is validating and nothing nested inside it.
const SKIP_DIRS = new Set([
  '.git', '.claude', '.pages-output', 'node_modules', 'artifacts', 'coverage', '.build',
  'test-results', 'playwright-report', 'reports', 'logs', 'releases', 'scripts',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, entry.name)).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(rel);
    }
  }
  return out;
}

const errors = [];
let examined = 0;
let exempt = 0;
const shapeCounts = new Map();

for (const rel of walk(ROOT)) {
  let html;
  try { html = fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { continue; }
  const m = SCHEMA_SCRIPT_RE.exec(html);
  if (!m) continue;
  if (SERIALIZATION_EXEMPT.has(rel)) { exempt += 1; continue; }
  examined += 1;
  const body = m[2];
  let data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    errors.push(`${rel}: CITATION_PAGE_SCHEMA is not parseable JSON (${err.message})`);
    continue;
  }
  const canonical = serializeSchema(data);
  if (canonical !== body) {
    // Name the divergence rather than dumping two multi-kilobyte strings.
    const kind = body.includes('\n') ? 'pretty-printed with newlines'
      : (body.includes('", "') || body.includes('": "')) ? "Python's default spaced separators"
      : 'a serialization that is neither the shared compact form nor a recognised legacy form';
    errors.push(`${rel}: CITATION_PAGE_SCHEMA is written as ${kind}; the one permitted form is scripts/lib/citation_page_schema.cjs serializeSchema() (compact, '<' escaped). Re-run npm run build:all to normalise it, and fix whichever writer produced it.`);
    continue;
  }
  const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data];
  const primary = graph.find((n) => n && ['Article', 'BlogPosting', 'WebPage', 'CollectionPage'].includes(n['@type']));
  if (primary && Object.prototype.hasOwnProperty.call(primary, 'mainEntityOfPage')) {
    const value = primary.mainEntityOfPage;
    const shape = typeof value === 'string' ? 'string'
      : (value && typeof value === 'object') ? `object{${Object.keys(value).sort().join(',')}}`
      : String(typeof value);
    shapeCounts.set(shape, (shapeCounts.get(shape) || 0) + 1);
    if (shape !== 'object{@id}') {
      errors.push(`${rel}: mainEntityOfPage is written as ${shape}; the one permitted shape is {"@id": canonical} from citation_page_schema mainEntityOfPage(). It points at ${mainEntityOfPageId(value) || 'nothing'}.`);
    }
  }
}

const report = {
  schema_version: '1.0',
  validator: 'VAL-CITATION-SCHEMA-SERIALIZATION',
  pages_examined: examined,
  pages_exempt: exempt,
  exempt_by_name: [...SERIALIZATION_EXEMPT],
  main_entity_of_page_shapes: Object.fromEntries(shapeCounts),
  errors,
};

fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'artifacts/validation/citation-schema-serialization.json'),
  JSON.stringify(report, null, 2) + '\n'
);

// Rule 0: no stage exits 0 having done nothing. A run that examined no schema
// blocks has not proved anything, and passing on an empty loop is how a check
// like this quietly stops covering the tree it was written for.
if (examined === 0) {
  console.error('[validate:citation-schema-serialization] FAIL: examined 0 pages carrying CITATION_PAGE_SCHEMA. Either the tree has not been built or the block moved; this check cannot pass on an empty loop.');
  process.exit(1);
}

if (errors.length) {
  console.error(`[validate:citation-schema-serialization] FAIL: ${errors.length} of ${examined} page(s) do not match the one serialization`);
  for (const e of errors.slice(0, 25)) console.error(` - ${e}`);
  if (errors.length > 25) console.error(` ... and ${errors.length - 25} more; full list in artifacts/validation/citation-schema-serialization.json`);
  process.exit(1);
}

console.log(`[validate:citation-schema-serialization] PASS: ${examined} page(s) carry a byte-identical CITATION_PAGE_SCHEMA serialization; ${exempt} exempt by name (${[...SERIALIZATION_EXEMPT].join(', ')})`);
