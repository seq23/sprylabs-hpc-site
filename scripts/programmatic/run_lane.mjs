#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT=process.cwd();
const argv=process.argv.slice(2);
const sep=argv.indexOf('--');
const before=sep>=0?argv.slice(0,sep):argv;
const command=sep>=0?argv.slice(sep+1):[];
function arg(name){const i=before.indexOf(name); return i>=0?before[i+1]:null;}
const lane=arg('--lane');
if(!lane||!command.length){console.error('Usage: node scripts/programmatic/run_lane.mjs --lane <lane> -- <command> [args...]');process.exit(2);}
const contracts=JSON.parse(fs.readFileSync('data/content/programmatic_lane_contracts.json','utf8')).lanes||{};
if(!contracts[lane]){console.error(`Unknown programmatic lane: ${lane}`);process.exit(2);}
const skipDirs=new Set(['.git','node_modules','artifacts','coverage','reports','.build','test-results','playwright-report']);
function htmlFiles(dir=ROOT,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skipDirs.has(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())htmlFiles(f,out);else if(e.isFile()&&e.name.endsWith('.html'))out.push(path.relative(ROOT,f).split(path.sep).join('/'));}return out;}
function hash(buf){return crypto.createHash('sha256').update(buf).digest('hex');}
function snapshot(){const m=new Map();for(const rel of htmlFiles()){const b=fs.readFileSync(rel);m.set(rel,{hash:hash(b),body:b});}return m;}
function run(cmd,args,env={}){console.log(`[programmatic:${lane}] run: ${[cmd,...args].join(' ')}`);const r=spawnSync(cmd,args,{cwd:ROOT,stdio:'inherit',env:{...process.env,...env}});if(r.status!==0)process.exit(r.status??1);}
function stripTags(s=''){return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();}
function match(html,re){const m=html.match(re);return m?stripTags(m[1]):'';}
function attr(html,name){const re=new RegExp(`${name}=["']([^"']+)["']`,'i');const m=html.match(re);return m?m[1]:'';}
function infer(rel,html,baselineHash,candidateHash){
 const h1=match(html,/<h1[^>]*>([\s\S]*?)<\/h1>/i);
 const canonical=(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i)||[])[1]||'';
 const extraction=(html.match(/<[^>]+data-llm-answer=["']true["'][^>]*>[\s\S]*?<\/section>/i)||[])[0]||'';
 const framework=attr(extraction,'data-named-framework');
 const intent=attr(extraction,'data-extraction-type')||'concept';
 const uniqueAtom=stripTags(extraction).slice(0,800);
 const art=html.includes('prompt-card')?'prompts':html.includes('checklist-list')?'checklist':/<table\b/i.test(html)?'table':/<ol\b/i.test(html)?'ordered_steps':html.includes('citation-criteria')?'criteria':html.includes('page-artifact')?'artifact':'';
 const route='/'+rel.replace(/index\.html$/,'');
 const domain=canonical?new URL(canonical).hostname:(rel.startsWith('insights/')?'spryexecutiveos.com':'billionairehighperformancecoach.com');
 const specs=JSON.parse(fs.readFileSync('data/programmatic/programmatic_page_candidates.json','utf8')).candidates||[];
 const declared=specs.find(x=>x.path===rel||x.route===route)||{};
 return {path:rel,route,canonical_domain:domain,generation_lane:lane,admission_level:'full',status:'CANDIDATE',primary_query:declared.primary_query||h1,query_aliases:declared.query_aliases||[],intent:declared.intent||intent,cluster:declared.cluster||attr(html,'data-cluster')||lane,framework:declared.framework||framework,unique_atom:declared.unique_atom||uniqueAtom,artifact_type:declared.artifact_type||art,entity:declared.entity||null,use_case:declared.use_case||null,comparison_entities:declared.comparison_entities||null,comparison_methodology:declared.comparison_methodology||null,official_sources:declared.official_sources||null,conflict_disclosure:declared.conflict_disclosure||null,verified_at:declared.verified_at||null,health_adjacent:Boolean(declared.health_adjacent)||/adhd|therap|burnout|brain fog|mental health/i.test(h1+' '+uniqueAtom),commercial_comparison:Boolean(declared.commercial_comparison),baseline_hash:baselineHash||null,candidate_hash:candidateHash};
}

const runId=`${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${process.pid}`;
const baseline=snapshot();
run(command[0],command.slice(1),{PROGRAMMATIC_LANE:lane,PROGRAMMATIC_RUN_ID:runId});
run('npm',['run','build:all'],{PROGRAMMATIC_LANE:lane,PROGRAMMATIC_RUN_ID:runId});
const after=snapshot();
const candidates=[];
for(const [rel,current] of after){const old=baseline.get(rel);if(!old||old.hash!==current.hash)candidates.push(infer(rel,current.body.toString('utf8'),old?.hash,current.hash));}
const manifest={schema_version:'1.0',generated_at:new Date().toISOString(),lane,run_id:runId,candidates};
fs.writeFileSync('data/content/programmatic_candidate_manifest.json',JSON.stringify(manifest,null,2)+'\n');
fs.mkdirSync('reports',{recursive:true});
const resultPath='reports/programmatic-candidate-results.json';
run('python3',['scripts/validation/validate_programmatic_admission.py','--candidate-only','--json-output',resultPath,'--no-fail-quality']);
const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));
const registry=JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8'));
const accepted=[]; const rejected=[];
for(const item of result.results){const candidate=candidates.find(x=>x.path===item.path);if(!candidate)continue;if(item.accepted){candidate.status='ADMITTED';candidate.admitted_at=new Date().toISOString();candidate.source=`workflow:${lane}`;const idx=registry.records.findIndex(x=>x.path===candidate.path);if(idx>=0)registry.records[idx]=candidate;else registry.records.push(candidate);accepted.push(candidate.path);}else{const old=baseline.get(candidate.path);if(old)fs.writeFileSync(candidate.path,old.body);else fs.rmSync(candidate.path,{force:true});rejected.push({run_id:runId,lane,path:candidate.path,primary_query:candidate.primary_query,candidate_hash:candidate.candidate_hash,reasons:item.errors,rejected_at:new Date().toISOString()});}}
registry.records.sort((a,b)=>a.path.localeCompare(b.path));registry.record_count=registry.records.length;registry.generated_at=new Date().toISOString();fs.writeFileSync('data/content/page_admission_registry.json',JSON.stringify(registry,null,2)+'\n');
const backlog=JSON.parse(fs.readFileSync('data/programmatic/rejection_backlog.json','utf8'));backlog.updated_at=new Date().toISOString();backlog.rejections.push(...rejected);fs.writeFileSync('data/programmatic/rejection_backlog.json',JSON.stringify(backlog,null,2)+'\n');
if(rejected.length)run('npm',['run','build:postprocess'],{PROGRAMMATIC_LANE:lane,PROGRAMMATIC_RUN_ID:runId});
fs.writeFileSync('data/content/programmatic_candidate_manifest.json',JSON.stringify({schema_version:'1.0',generated_at:new Date().toISOString(),lane:null,run_id:runId,candidates:[]},null,2)+'\n');
run('npm',['run','validate:all']);
run('npm',['run','validate:warnings']);
const summary={status:'PASS',run_id:runId,lane,changed_candidates:candidates.length,accepted,rejected:rejected.map(x=>({path:x.path,reasons:x.reasons}))};
fs.writeFileSync('data/programmatic/latest_run_summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(`[programmatic:${lane}] PASS: ${accepted.length} admitted, ${rejected.length} quarantined`);
