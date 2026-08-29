#!/usr/bin/env node
/**
 * Build the repair scope for citation-contract violations.
 *
 * WHY THIS EXISTS
 *
 * The release lane runs under an authority-scale mutation scope: run_guarded_release.mjs
 * calls `authority:scale:prepare-scope` before the lane and `clear-scope` after, so for
 * the whole lane data/release/active_mutation_scope.json lists the ~17 routes this
 * release is allowed to touch. That scope is a real protection - it is what stops a
 * release from silently rewriting 2200 frozen pages.
 *
 * But repair_schema_parity.py, the sole writer of CITATION_PAGE_SCHEMA, honoured that
 * scope while validate_citation_contract.py judged all ACTIVE citable pages. So a page
 * that lost its schema outside the scope was unrepairable BY CONSTRUCTION: the validator
 * failed on it every attempt, the repair skipped it every attempt, and
 * heal_until_clean.mjs burned its whole budget and exited UNRESOLVED. Observed in
 * production on 2026-08-29 (run 33259007622): "changed=18; scoped=True;
 * skipped_outside_scope=2183" followed by FAIL on three pages none of those 18 included.
 *
 * The fix is NOT to make the validator honour the scope - that would weaken a
 * release-blocking contract to make a loop terminate. It is to say: the mutation scope
 * exists to prevent gratuitous drift, and restoring a schema block that the contract
 * requires is not drift, it is the repair the contract is asking for. So this script
 * computes exactly the set of ACTIVE citable pages that violate the schema requirement,
 * and repair_schema_parity.py unions that set into its allowed routes. Nothing else
 * becomes writable: a page that is merely out of scope stays frozen.
 *
 * It is deliberately narrow. It reports only the one violation class that a scoped
 * repair provably could not reach - a missing CITATION_PAGE_SCHEMA block, which is the
 * check at validate_citation_contract.py:144 and :58. Other contract failures (H1/query
 * mismatch, definition drift) need content decisions, not a scope widening.
 *
 * Exit codes: 0 always, EXCEPT it hard-fails on an empty or missing citable-page
 * registry. A scope builder that examined nothing and wrote an empty scope would let
 * every caller downstream report success over a set it never looked at.
 *
 * Usage: node scripts/citation/build_contract_violation_scope.mjs [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAGES = path.join(ROOT, 'data/citation/citable_pages.json');
const OUT = path.join(ROOT, 'data/release/citation_contract_violation_scope.json');
const QUIET = process.argv.includes('--quiet');

// Mirrors normalize_route/route_from_path in scripts/citation/repair_schema_parity.py.
// If those diverge the scope silently stops matching, so validate_citation_repair_reach.mjs
// asserts the two agree on real registry paths.
export function normalizeRoute(value) {
  let v = String(value || '').trim();
  if (!v) return '';
  if (!v.startsWith('/')) v = `/${v}`;
  if (v === '/') return '/';
  if (v.endsWith('.html')) return v;
  return `${v.replace(/\/+$/, '')}/`;
}

export function routeFromPath(value) {
  const v = String(value || '').replace(/^\.\//, '');
  if (!v) return '';
  if (v.endsWith('/index.html')) return normalizeRoute(`/${v.slice(0, -'index.html'.length)}`);
  return normalizeRoute(`/${v}`);
}

// The exact condition validate_citation_contract.py tests, via BeautifulSoup:
//   soup.find('script', id='CITATION_PAGE_SCHEMA')
// Matched here on raw HTML because this runs on every page on every release attempt.
const SCHEMA_TAG = /<script\b[^>]*\bid\s*=\s*["']CITATION_PAGE_SCHEMA["']/i;

export function missingSchema(html) {
  return !SCHEMA_TAG.test(String(html || ''));
}

export function collect(root = ROOT) {
  const pagesFile = path.join(root, 'data/citation/citable_pages.json');
  if (!fs.existsSync(pagesFile)) {
    return { error: `missing ${path.relative(root, pagesFile)}` };
  }
  const pages = JSON.parse(fs.readFileSync(pagesFile, 'utf8')).pages || [];
  const active = pages.filter((p) => (p.status || 'ACTIVE') === 'ACTIVE' && p.path);
  const violations = [];
  let examined = 0;
  for (const rec of active) {
    const abs = path.join(root, rec.path);
    if (!fs.existsSync(abs)) continue;
    examined += 1;
    if (missingSchema(fs.readFileSync(abs, 'utf8'))) {
      violations.push({ path: rec.path, route: routeFromPath(rec.path), violation: 'citation schema missing' });
    }
  }
  return { active: active.length, examined, violations };
}

function main() {
  const result = collect(ROOT);
  if (result.error) {
    console.error(`[citation:violation-scope] STOP: ${result.error}`);
    process.exit(1);
  }
  if (result.examined === 0) {
    console.error(
      `[citation:violation-scope] STOP: ${PAGES} lists ${result.active} ACTIVE page(s) but none exist on disk - ` +
        'examined nothing, so an empty scope would be a false statement about the estate',
    );
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        schema_version: '1.0',
        generated_at: new Date().toISOString(),
        source: 'data/citation/citable_pages.json',
        violation_class: 'citation schema missing',
        active_pages: result.active,
        examined: result.examined,
        routes: result.violations.map((v) => v.route).sort(),
        paths: result.violations.map((v) => v.path).sort(),
        violations: result.violations,
      },
      null,
      2,
    )}\n`,
  );
  if (!QUIET) {
    console.log(
      `[citation:violation-scope] examined=${result.examined}; violations=${result.violations.length}` +
        (result.violations.length ? `; routes=${result.violations.slice(0, 5).map((v) => v.route).join(', ')}${result.violations.length > 5 ? ', ...' : ''}` : ''),
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
