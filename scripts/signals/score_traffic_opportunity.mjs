#!/usr/bin/env node
import {loadNormalized, scoreRecords, writeJson} from '../citation_intelligence/pipeline_lib.mjs';
const scores = scoreRecords(loadNormalized());
writeJson('data/signals/scores/latest_signal_scores.json', {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), scores});
writeJson('artifacts/validation/signal-scores.json', {schema_version:'1.4', status:scores.length?'PASS':'FAIL', score_count:scores.length, required_actions:[...new Set(scores.map(x=>x.candidate_action))]});
console.log(`[signals:score] ${scores.length?'PASS':'FAIL'} scores=${scores.length}`);
if (!scores.length) process.exit(1);
