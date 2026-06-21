#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const major=Number(process.versions.node.split('.')[0]);
console.log(`[release-profile] environment=container profile=release:prepush:container node=${major}`);
function run(label, args){
  console.log(`[release:prepush:container] ${label}`);
  const r=spawnSync('npm',args,{stdio:'inherit',env:process.env});
  if(r.status!==0)process.exit(r.status??1);
}
function node(label, script){
  console.log(`[release:prepush:container] ${label}`);
  const r=spawnSync('node',[script],{stdio:'inherit',env:process.env});
  if(r.status!==0)process.exit(r.status??1);
}
run('build:all',['run','build:all']);
// Decomposed validate:all, same gates, less brittle for large 2K-surface baseline validation in constrained containers.
for (const [label,args] of [
  ['validate:repo',['run','validate:repo']],
  ['validate:validation-registry',['run','validate:validation-registry']],
  ['validate:workflow-contract',['run','validate:workflow-contract']],
  ['validate:workflow-lineage',['run','validate:workflow-lineage']],
  ['validate:workflow-monitor',['run','validate:workflow-monitor']],
  ['validate:disavow-asset',['run','validate:disavow-asset']],
  ['validate:programmatic-provenance',['run','validate:programmatic-provenance']],
  ['validate:programmatic-registry',['run','validate:programmatic-registry']],
  ['validate:citation-contract',['run','validate:citation-contract']],
  ['validate:citation-strategy',['run','validate:citation-strategy']],
  ['validate:rendered-schema-parity',['run','validate:rendered-schema-parity']],
  ['validate:retired-route-references',['run','validate:retired-route-references']],
  ['validate:content',['run','validate:content']],
  ['validate:graph',['run','validate:graph']],
  ['validate:distribution',['run','validate:distribution']],
  ['validate:ui-test-parity',['run','validate:ui-test-parity']],
  ['validate:browser-suite-contract',['run','validate:browser-suite-contract']]
]) run(label,args);
for (const [label,script] of [
  ['validate:release-atom-contract','scripts/validation/validate_release_atom_contract.mjs'],
  ['validate:release-mix-policy','scripts/validation/validate_release_mix_policy.mjs'],
  ['validate:citation-phase-manifest','scripts/validation/validate_citation_phase_manifest.mjs'],
  ['validate:no-keyword-swap-pages','scripts/validation/validate_no_keyword_swap_pages.mjs'],
  ['validate:claim-safety','scripts/validation/validate_claim_safety.mjs'],
  ['validate:internal-link-velocity','scripts/validation/validate_internal_link_velocity.mjs'],
  ['validate:llms-full-coverage','scripts/validation/validate_llms_full_coverage.mjs'],
  ['validate:sitemap-coverage','scripts/validation/validate_sitemap_coverage.mjs']
]) node(label,script);
console.log('[release:prepush:container] OK');
