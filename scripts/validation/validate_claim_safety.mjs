#!/usr/bin/env node
import fs from 'node:fs';
const badClaims = ['guaranteed results','cures','diagnoses','treats anxiety','treats depression','certified therapist','clinical treatment','proven to make you rich','reviews say','customers say'];
const rows=JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8')).records.filter(x=>x.source==='aplayer_phase_expansion_2000_baseline');
const claims=JSON.parse(fs.readFileSync('data/citation/product_claims_registry.json','utf8'));
const errors=[];
// Both sets below are the whole subject of this check. If the generated-page
// filter or the claims registry comes back empty, every loop after it runs zero
// times and the validator reports OK while having read no page and no claim.
if (!rows.length) { console.error('[validate:claim-safety] FAIL: data/content/page_admission_registry.json records contains no entry with source "aplayer_phase_expansion_2000_baseline"; expected at least one generated page to scan. Passing with nothing scanned proves no page is claim-safe.'); process.exit(1); }
if (!(claims.claims||[]).length) { console.error('[validate:claim-safety] FAIL: data/citation/product_claims_registry.json declares no claims; expected at least one classified product claim. An empty registry cannot prove the claim classifications are safe.'); process.exit(1); }
for (const c of claims.claims||[]) if (!c.public_allowed && c.classification !== 'external_pending') errors.push(`unexpected unsafe claim classification in registry: ${c.claim}`);
for (const r of rows) {
  if (['source_needed','external_pending','prohibited'].includes(r.claim_safety_level)) errors.push(`${r.path}: unsafe public claim level ${r.claim_safety_level}`);
  const text = fs.existsSync(r.path) ? fs.readFileSync(r.path,'utf8').toLowerCase() : '';
  for (const phrase of badClaims) if (text.includes(phrase)) errors.push(`${r.path}: prohibited claim phrase ${phrase}`);
}
fs.mkdirSync('artifacts/diagnostics/container-current/validate-claim-safety',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-claim-safety/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',checked:rows.length,errors},null,2)+'\n');
if (errors.length) { console.error('[validate:claim-safety] FAIL'); errors.slice(0,200).forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:claim-safety] OK: ${rows.length} generated pages checked`);
