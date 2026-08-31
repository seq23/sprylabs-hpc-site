#!/usr/bin/env node
import fs from 'node:fs';const c=JSON.parse(fs.readFileSync('config/authority/citation_intelligence_contract.json','utf8'));const errors=[],warnings=[];if(c.mode!=='FULL_SAFE_AUTONOMY_GAP_FILL')errors.push('wrong autonomy mode');if(c.routine_human_approval!==false)errors.push('routine approval must be false');for(const [k,v] of Object.entries(c.cadence_targets||{}))if(v.hard_failure!==false)errors.push(`${k} must be non-blocking`);
// The unsafe-claim scan below only sees files the release plan actually applied.
// A release that applied nothing is a legitimate state here (the lane stops when
// every candidate is fixture-only), so an empty `applied` array is not a
// failure. What must not pass silently is an absent or malformed receipt: the
// old `:{applied:[]}` fallback turned "no receipt was ever written" into "zero
// files to scan" and reported PASS either way.
const APP_PATH='artifacts/validation/release-plan-application.json';
if(!fs.existsSync(APP_PATH))errors.push(`${APP_PATH} is missing; the unsafe-claim scan needs the release-plan application receipt to know which source files were published. Scanning nothing because the receipt is absent proves no applied page is claim-safe.`);
const app=fs.existsSync(APP_PATH)?JSON.parse(fs.readFileSync(APP_PATH,'utf8')):{applied:[]};
if(fs.existsSync(APP_PATH)&&!Array.isArray(app.applied))errors.push(`${APP_PATH} has no "applied" array; the unsafe-claim scan cannot tell an empty release from a receipt that never recorded one.`);
for(const x of app.applied||[]){const t=fs.readFileSync(x.source_file,'utf8').toLowerCase();if(/guaranteed (success|wealth|billionaire|outcome)/.test(t))errors.push(`unsafe claim: ${x.source_file}`);}console.log(JSON.stringify({status:errors.length?'FAIL':'PASS',errors,warnings},null,2));if(errors.length)process.exit(1);
