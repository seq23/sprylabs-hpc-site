#!/usr/bin/env node
import {readJson,planFromCandidates,writeJson} from './pipeline_lib.mjs';
const candidates=readJson('data/signals/release_candidates/latest_release_candidates.json',{candidates:[]}).candidates||[];
const plan=planFromCandidates(candidates);
writeJson('artifacts/validation/daily-citation-release-plan.json',plan);writeJson('reports/daily-citation-release-plan.json',plan);
console.log(`[release:plan] PASS selected=${plan.summary.selected_units} skipped=${plan.summary.skipped_units} blocked=${plan.summary.blocked_units}`);
