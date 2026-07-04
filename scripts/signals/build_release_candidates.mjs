#!/usr/bin/env node
import {readJson, candidateFromScore, writeJson} from '../citation_intelligence/pipeline_lib.mjs';
const scores = readJson('data/signals/scores/latest_signal_scores.json').scores || [];
const candidates = scores.map(candidateFromScore);
writeJson('data/signals/release_candidates/latest_release_candidates.json', {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), candidates});
writeJson('artifacts/validation/release-candidates.json', {schema_version:'1.4', status:candidates.length?'PASS':'FAIL', candidate_count:candidates.length, actions:[...new Set(candidates.map(x=>x.action))]});
console.log(`[signals:candidates] ${candidates.length?'PASS':'FAIL'} candidates=${candidates.length}`);
if (!candidates.length) process.exit(1);
