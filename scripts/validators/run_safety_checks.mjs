#!/usr/bin/env node
// The one validator runner for this repository (lean shape, 7 Nov 2026).
// It holds only safety checks; page format, wording and governance checks were
// retired with the in-repo content engine (the page engine is Search Loop).
import { spawnSync } from 'node:child_process';

const CHECKS = [
  // secrets and owner emails never in the repo
  ['no-secrets-or-owner-emails', 'node scripts/validators/check_no_secrets_or_owner_emails.mjs'],
  // zero paid LLM
  ['zero-paid-llm', 'node scripts/validators/validate_zero_paid_llm.mjs'],
  // claim safety (risk brain)
  ['claim-safety', 'node scripts/validation/validate_claim_safety.mjs'],
  ['safe-harbor', 'node scripts/validators/validate_safe_harbor_autopublish.mjs'],
  // deploy safety: redirects, links, canonical host, sitemaps, what Pages publishes
  ['redirect-and-link-integrity', 'node scripts/validators/validate_redirect_and_link_integrity.mjs'],
  ['retired-route-references', 'node scripts/validation/validate_retired_route_references.mjs'],
  ['canonical-no-redirect', 'node scripts/validation/validate_canonical_no_redirect.mjs'],
  ['sitemap-coverage', 'node scripts/validation/validate_sitemap_coverage.mjs'],
  ['sitemap-canonical-on-own-host', 'node scripts/validators/validate_sitemap_canonical_on_own_host.mjs'],
  ['published-surface-is-pages-only', 'node scripts/validators/validate_published_surface_is_pages_only.mjs'],
  // named stops: no stage exits 0 having done nothing
  ['no-silent-zero-work', 'node scripts/validators/validate_no_silent_zero_work.mjs'],
];

if (!CHECKS.length) { console.error('[safety] FAIL: no checks declared'); process.exit(1); }
const failed = [];
for (const [name, cmd] of CHECKS) {
  const t = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n');
  const ok = r.status === 0;
  console.log(`[safety] ${ok ? 'PASS' : 'FAIL'} ${name} (${((Date.now() - t) / 1000).toFixed(1)}s) ${ok ? out.at(-1).slice(0, 160) : ''}`);
  if (!ok) { failed.push(name); console.log(out.slice(-25).map((l) => '    ' + l).join('\n')); }
}
if (failed.length) { console.error(`[safety] FAIL: ${failed.length} of ${CHECKS.length} check(s): ${failed.join(', ')}`); process.exit(1); }
console.log(`[safety] PASS: ${CHECKS.length} of ${CHECKS.length} safety checks`);
