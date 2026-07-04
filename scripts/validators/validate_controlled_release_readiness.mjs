#!/usr/bin/env node
import fs from 'node:fs';
function readJson(p,fallback=null){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):fallback;}
function writeJson(p,payload){fs.mkdirSync(p.split('/').slice(0,-1).join('/')||'.',{recursive:true}); fs.writeFileSync(p,JSON.stringify(payload,null,2)+'\n');}
const errors=[];
const profile=readJson('data/strategy/citation_strategy_profile.json',{});
const contract=readJson('_content_release_contract.json',{});
const plan=readJson('artifacts/validation/daily-citation-release-plan.json',{});
const proof=readJson('artifacts/validation/daily-proof-packet.json',{});
const trace=readJson('artifacts/validation/fixture-signal-trace.json',{});
const app=readJson('artifacts/validation/release-plan-application.json',{});
const wf=fs.existsSync('.github/workflows/daily-citation-intelligence.yml')?fs.readFileSync('.github/workflows/daily-citation-intelligence.yml','utf8'):'';
const mock=readJson('artifacts/validation/browserless-mock-audit.json',{});
const daily=Number(profile.cadence?.daily_target_units||0);
if(daily<10 || daily>25) errors.push(`Spry controlled cadence must be 10-25 units/day; found ${daily}`);
if(profile.signal_strategy?.default_mode !== 'SHADOW_MODE') errors.push('default signal mode must remain SHADOW_MODE');
if(contract.apply_policy?.shadow_mode_writes_only_reports !== true) errors.push('Spry apply policy must remain shadow report/no-op in container');
if(trace.status !== 'PASS') errors.push('fixture trace must pass before controlled release readiness');
if(!plan.selected?.length) errors.push('release plan must select units');
if(!plan.blocked?.length) errors.push('release plan must include blocked/not-selected units');
if(proof.status !== 'PASS') errors.push('daily proof packet must pass structurally');
if(app.public_mutation !== false) errors.push('release plan application must not public-mutate in container');
if(!wf.includes('schedule:') || !wf.includes('37 13 * * *')) errors.push('Spry daily citation workflow schedule must be present at cron 37 13 * * *');
if(!wf.includes('permissions:\n  contents: read')) errors.push('daily workflow must not have contents: write');
if(mock.status !== 'PASS' || mock.real_browser_proof !== false) errors.push('browserless mock backup proof must pass and remain explicitly non-browser');
const report={schema_version:'1.0',repo:'seq23/sprylabs-hpc-site',validator:'controlled-release-readiness',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',cadence_class:'CADENCE_DAILY_STANDARD_CONTROLLED_LOW',daily_target_units:daily,public_content_mutation_enabled:false,scheduled_workflow_enabled:true,local_browser_validation:'REQUIRED_NOT_RUN',external_telemetry_present:false,errors};
writeJson('artifacts/validation/controlled-release-readiness.json',report);
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/controlled-release-readiness.md',`# Controlled Release Readiness\n\nStatus: ${report.status}\n\nCadence: ${report.cadence_class} (${daily} units/day)\n\nPublic content mutation enabled: false\n\nDaily schedule enabled: true\n\nLocal browser/updater validation: REQUIRED_NOT_RUN\n`);
if(errors.length){console.error(errors.join('\n'));process.exit(1);} console.log('[validate:controlled-release-readiness] PASS');
