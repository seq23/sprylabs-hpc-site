#!/usr/bin/env node
/**
 * Copy the pages a failing citation contract NAMED into the uploaded artifact.
 *
 * A failing release uploads everything except the thing that explains the failure.
 * validate_citation_contract.py writes its verdict to
 * artifacts/diagnostics/container-current/validate-citation-contract/summary.json, and
 * the pages it names were never uploaded at all - so a failure that reproduces ONLY on
 * the runner could not be read anywhere but a truncated log line.
 *
 * On 2026-09-12 that cost hours. comparisons/bhpc-vs-betterup.html is byte-intact in
 * the repository AND in a faithful local replay of the same release lane - 1 extraction
 * block, 1 citation definition - and the runner reported it with no block, no
 * definition, no product anchor and no download link, which is what an EMPTY parse
 * looks like. There was no way to tell whether CI had a different tree or a different
 * parse, because neither the verdict nor the bytes left the runner.
 *
 * Best-effort by design: it runs under continue-on-error and never fails a build. A
 * diagnostic that can break the thing it is diagnosing is worse than none.
 */
import fs from 'node:fs';
import path from 'node:path';

const SUMMARY = 'artifacts/diagnostics/container-current/validate-citation-contract/summary.json';
const OUT = 'artifacts/diagnostics/failing-pages';

if (!fs.existsSync(SUMMARY)) {
  console.log(`[keep-failing-pages] no contract summary at ${SUMMARY}; nothing to keep.`);
  process.exit(0);
}

let doc;
try {
  doc = JSON.parse(fs.readFileSync(SUMMARY, 'utf8'));
} catch (e) {
  console.log(`[keep-failing-pages] could not read ${SUMMARY}: ${e.message}`);
  process.exit(0);
}

const named = [...new Set((doc.errors || []).map((e) => String(e).split(':')[0].trim()))].sort();
fs.mkdirSync(OUT, { recursive: true });

let kept = 0;
for (const rel of named) {
  try {
    if (!fs.statSync(rel).isFile()) continue;
    // Flattened, so the artifact is one readable directory rather than a tree.
    fs.copyFileSync(rel, path.join(OUT, rel.replace(/\//g, '__')));
    kept += 1;
  } catch { /* not a path, or not present - both are fine here */ }
}

fs.writeFileSync(path.join(OUT, '_named.json'), `${JSON.stringify({ named, kept, at: new Date().toISOString() }, null, 2)}\n`);
console.log(`[keep-failing-pages] kept ${kept} of ${named.length} page(s) the contract named.`);
