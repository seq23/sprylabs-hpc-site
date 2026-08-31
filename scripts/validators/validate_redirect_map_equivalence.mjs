#!/usr/bin/env node
// scripts/content/apply_redirect_map.mjs used to answer "does this URL name a
// retired route?" with a linear scan over 758 mappings x ~16 variants, per URL
// attribute and per file, recompiling roughly 12,000 RegExps for every non-HTML
// file it looked at. Measured on the real tree: 167.3s for ONE call, while
// reporting "0 files updated; 0 replacements". build:all calls it twice and CI
// runs build:all three times (once directly, twice inside
// validate:clean-rebuild-parity), so it was about 20 of every 28-minute run.
//
// It is now indexed: Map lookups, precompiled patterns, and a per-file segment
// scan that skips mappings that cannot match. 167.3s -> 1.2s.
//
// That is a pure performance change, so the only thing worth guarding is that it
// stayed pure. This validator imports the REAL replaceUrlValue and rewriteText
// that ship - not a copy - and checks them against a naive linear scan written
// here, over every variant the live redirect map produces. A copy of the fast
// path would be free to drift from the shipped one; importing it cannot.
//
// It also fails if the fast path has silently switched itself off, because that
// is invisible in the output and puts 20 minutes back into every CI run.
//
// Rule 0: hard-fails when it examines zero URL values or zero documents.
import path from 'node:path';
import {
  mappings,
  replaceUrlValue,
  rewriteText,
  targetForVariant,
  variantsAreSeparatorFree,
} from '../content/apply_redirect_map.mjs';

const errors = [];

// ---- reference implementations: the code as it was before indexing ----------

function naiveReplaceUrlValue(value, rel) {
  let result = value;
  const suffixMatch = result.match(/([?#].*)$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';
  const bare = suffix ? result.slice(0, -suffix.length) : result;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(bare) && !bare.startsWith('/') && !bare.startsWith('#')) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), bare));
    const candidates = [resolved, `${resolved}.html`, path.posix.join(resolved.replace(/\/$/, ''), 'index.html')];
    const relativeMatch = mappings.find((mapping) => candidates.includes(mapping.source_path));
    if (relativeMatch) return relativeMatch.target + suffix;
  }
  for (const mapping of mappings) {
    for (const variant of mapping.variants) {
      if (result === variant || result.startsWith(`${variant}?`) || result.startsWith(`${variant}#`)) {
        const tail = result.slice(variant.length);
        return targetForVariant(mapping.target, variant) + tail;
      }
    }
  }
  return result;
}

function naiveRewriteText(rel, text) {
  let replacements = 0;
  let out = text.replace(/\b(href|src|action|content)=(['"])([^'"]+)\2/gi, (match, attr, quote, value) => {
    const next = naiveReplaceUrlValue(value, rel);
    if (next !== value) replacements += 1;
    return `${attr}=${quote}${next}${quote}`;
  });
  if (!rel.endsWith('.html')) {
    for (const mapping of mappings) {
      for (const variant of mapping.variants) {
        const literalTarget = targetForVariant(mapping.target, variant);
        if (out.includes(variant)) {
          const before = out;
          out = out.split(variant).join(literalTarget);
          if (out !== before) replacements += 1;
        }
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(["'\\x60])${escaped}([?#][^"'\\x60]*)?\\1`, 'g');
        out = out.replace(pattern, (match, quote, tail = '') => {
          replacements += 1;
          return `${quote}${literalTarget}${tail}${quote}`;
        });
      }
    }
  }
  return { out, replacements };
}

// ---- the premise the fast path rests on -------------------------------------

if (!mappings.length) {
  errors.push('the redirect map produced zero mappings, so this validator asserted nothing about the rewriter');
}
if (!variantsAreSeparatorFree) {
  errors.push(
    'apply_redirect_map.mjs has disabled its indexed URL lookup: a variant now contains "?" or "#", '
    + 'so it has fallen back to the linear scan. Output is still correct, but this silently restores the '
    + 'O(mappings x variants) cost that was about 20 minutes of every CI run. Re-derive the lookup for '
    + 'variants that carry a query or fragment separator rather than leaving the fallback in place.'
  );
}

// ---- coverage honesty: is the tie-break actually exercised? ------------------
//
// variantIndex keeps the FIRST mapping for a variant, because the linear scan
// returned the earliest mapping. That branch is only observable when two
// mappings claim the same variant. Today's map has none, so the URL sweep below
// cannot distinguish first-wins from last-wins. Rather than let a PASS imply
// coverage that does not exist, the count is measured and reported: at zero it
// is stated as unexercised, and the moment a duplicate appears the sweep starts
// checking it for real, because the naive reference resolves it to the earliest
// mapping and the indexed path must agree.
const variantOwners = new Map();
let duplicateVariantCount = 0;
for (const mapping of mappings) {
  for (const variant of mapping.variants) {
    if (!variantOwners.has(variant)) variantOwners.set(variant, mapping.order);
    else if (variantOwners.get(variant) !== mapping.order) duplicateVariantCount += 1;
  }
}

// ---- URL-attribute equivalence ----------------------------------------------

const REL = 'probe/dir/page.html';
const urlValues = [];
for (const mapping of mappings) {
  for (const variant of mapping.variants) {
    urlValues.push(variant, `${variant}?utm_source=x`, `${variant}#section`, `${variant}?a=1#b`);
  }
  // relative shapes, which take the source_path branch rather than the variant scan
  urlValues.push(mapping.source_path, mapping.source_path.replace(/\.html$/, ''));
}
// values that must NOT be rewritten, so the scan is exercised to exhaustion too
urlValues.push('/', '#top', 'https://example.com/nothing', 'mailto:a@b.c', './sibling.html', '/definitely-not-retired');

let urlChecked = 0;
for (const value of urlValues) {
  const fast = replaceUrlValue(value, REL);
  const slow = naiveReplaceUrlValue(value, REL);
  urlChecked += 1;
  if (fast !== slow) {
    errors.push(`replaceUrlValue diverged for ${JSON.stringify(value)}: indexed ${JSON.stringify(fast)} vs linear ${JSON.stringify(slow)}`);
    if (errors.length > 40) break;
  }
}
if (urlChecked === 0) errors.push('Rule 0: examined zero URL values');

// ---- document equivalence, HTML and non-HTML --------------------------------

// A document naming many real retired routes in every textual form the rewriter
// recognises: attributes in both quote styles, bare literals, and the quoted
// forms the non-HTML branch targets, including backticks and ?/# suffixes.
const sample = mappings.filter((_, i) => i % 97 === 0).slice(0, 8);
if (!sample.length) errors.push('Rule 0: no sample mappings selected for the document check');

let htmlDoc = '<html><body>\n';
let textDoc = '';
for (const mapping of sample) {
  for (const variant of mapping.variants.slice(0, 6)) {
    htmlDoc += `<a href="${variant}">x</a><img src='${variant}?utm=1'><form action="${variant}#f"></form><meta content="${variant}">\n`;
    textDoc += `const a = "${variant}";\nconst b = '${variant}?q=2';\nconst c = \`${variant}#h\`;\nbare ${variant} bare\n`;
  }
  htmlDoc += `<a href="${mapping.source_path}">rel</a>\n`;
}
htmlDoc += '</body></html>\n';

let docsChecked = 0;
for (const [rel, text] of [['probe/dir/page.html', htmlDoc], ['probe/dir/refs.js', textDoc], ['probe/dir/refs.json', textDoc]]) {
  const fast = rewriteText(rel, text);
  const slow = naiveRewriteText(rel, text);
  docsChecked += 1;
  if (fast.out !== slow.out) {
    errors.push(`rewriteText output diverged for ${rel} (indexed ${fast.out.length} bytes vs linear ${slow.out.length} bytes)`);
  }
  if (fast.replacements !== slow.replacements) {
    errors.push(`rewriteText replacement count diverged for ${rel}: indexed ${fast.replacements} vs linear ${slow.replacements}`);
  }
}
if (docsChecked === 0) errors.push('Rule 0: examined zero documents');

// ---- report ------------------------------------------------------------------

const summary = {
  test_id: 'validate-redirect-map-equivalence',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  mappings: mappings.length,
  variants: mappings.reduce((n, m) => n + m.variants.length, 0),
  url_values_checked: urlChecked,
  documents_checked: docsChecked,
  indexed_lookup_active: variantsAreSeparatorFree,
  duplicate_variant_count: duplicateVariantCount,
  tie_break_exercised: duplicateVariantCount > 0,
  errors,
};
const fs = await import('node:fs');
const runId = process.env.PROOF_RUN_ID || 'container-current';
const outDir = path.join(process.cwd(), 'artifacts', 'diagnostics', runId, 'validate-redirect-map-equivalence');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

if (errors.length) {
  console.error(`[validate:redirect-map-equivalence] FAIL: ${errors.length} problem(s); checked ${urlChecked} URL value(s) and ${docsChecked} document(s)`);
  for (const e of errors.slice(0, 20)) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[validate:redirect-map-equivalence] PASS: indexed rewriter matches the linear scan on ${urlChecked} URL value(s) across ${summary.variants} variant(s) of ${mappings.length} mapping(s), and on ${docsChecked} document(s); indexed lookup active; first-mapping-wins tie-break ${duplicateVariantCount ? `checked against ${duplicateVariantCount} duplicated variant(s)` : 'UNEXERCISED (no variant is claimed by two mappings)'}`);
