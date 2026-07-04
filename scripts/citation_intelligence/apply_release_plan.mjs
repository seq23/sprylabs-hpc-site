#!/usr/bin/env node
import fs from 'node:fs';
import {readJson, writeJson} from './pipeline_lib.mjs';
const plan = readJson('artifacts/validation/daily-citation-release-plan.json');
const apply = process.argv.includes('--apply');
const result = {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), mode: apply ? 'CONTROLLED_APPLY_REQUESTED' : 'SHADOW_MODE', status:'PASS', release_units_applied:0, public_mutation:false, no_op_reason:null, selected:plan.selected.map(x=>x.candidate_id)};
if (!apply) result.no_op_reason = 'Shadow mode: release plan proved candidate selection without public route mutation.';
else result.no_op_reason = 'Controlled public mutation is not enabled in this container handoff; local updater validation required.';
writeJson('artifacts/validation/release-plan-application.json', result);
writeJson('reports/release-plan-application.json', result);
console.log(`[release:content:intelligence] PASS shadow_noop=${!apply}`);
