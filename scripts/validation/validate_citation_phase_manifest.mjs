#!/usr/bin/env node
import fs from 'node:fs';
const phase=JSON.parse(fs.readFileSync('data/citation/citation_phase_manifest.json','utf8'));
const pages=JSON.parse(fs.readFileSync('data/citation/citable_pages.json','utf8')).pages.filter(x=>x.status==='ACTIVE');
const errors=[];
if (!String(phase.scope||'').includes('aplayermode.com + billionairehighperformancecoach.com')) errors.push('phase manifest scope drift');
if (phase.current_active_reference_surfaces !== pages.length) errors.push(`phase manifest count ${phase.current_active_reference_surfaces} does not match active pages ${pages.length}`);
if (pages.length < 2000) errors.push(`active reference surfaces below 2000: ${pages.length}`);
if (phase.phases?.phase_4_dominance?.status !== 'RUNWAY_ACTIVE_NOT_COMPLETE') errors.push('phase 4 must be runway active, not falsely complete');
for (const rel of ['data/content/release_profiles.json','data/content/release_mix_policy.json','data/citation/product_claims_registry.json']) if (!fs.existsSync(rel)) errors.push(`missing phase artifact ${rel}`);
fs.mkdirSync('artifacts/diagnostics/container-current/validate-citation-phase-manifest',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/container-current/validate-citation-phase-manifest/summary.json', JSON.stringify({status:errors.length?'FAIL':'PASS',active_pages:pages.length,errors},null,2)+'\n');
if (errors.length) { console.error('[validate:citation-phase-manifest] FAIL'); errors.forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log(`[validate:citation-phase-manifest] OK: ${pages.length} active reference surfaces`);
