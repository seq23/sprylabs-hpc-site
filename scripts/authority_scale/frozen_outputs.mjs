#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const ROOT=process.cwd();
const REG=path.join(ROOT,'data/release/frozen_output_registry.json');
const CACHE=path.join(ROOT,'data/release/frozen_accepted_outputs');
const SCOPE=path.join(ROOT,'data/release/active_mutation_scope.json');
const ADMISSION=path.join(ROOT,'data/content/page_admission_registry.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const normalizeRoute=r=>{r=String(r||'').trim();if(!r)return'';if(!r.startsWith('/'))r='/'+r;return r==='/'?'/':r.replace(/\/$/,'')+(String(r).endsWith('.html')?'':'/');};
const routeFromPath=p=>{p=String(p||'').replace(/^\.\//,'');if(!p)return'';if(p.endsWith('/index.html'))return '/'+p.slice(0,-'index.html'.length);if(p.endsWith('.html'))return '/'+p;return '/'+p.replace(/^\//,'');};
const load=(p,f)=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):f;
const registry=()=>load(REG,{schema_version:'1.0',policy:'accepted_output_freeze',source_registry:'data/content/page_admission_registry.json',accepted_statuses:['ADMITTED'],mutation_scope:'data/release/active_mutation_scope.json',records:{}});
const scope=()=>new Set((load(SCOPE,{routes:[]}).routes||[]).map(normalizeRoute));
function admitted(){const d=load(ADMISSION,{records:[],pages:[]});const out=[];for(const r of d.records||[])if(String(r.status).toUpperCase()==='ADMITTED'&&r.path)out.push({route:normalizeRoute(r.route||routeFromPath(r.path)),path:r.path});for(const r of d.pages||[])if(String(r.status).toLowerCase()==='admitted'&&r.path)out.push({route:normalizeRoute(routeFromPath(r.path)),path:r.path});const m=new Map();for(const r of out)if(r.route&&r.path&&fs.existsSync(path.join(ROOT,r.path)))m.set(r.route,r);return [...m.values()];}
// status also reports missing_cache. A record whose sha256 is updated without its
// gzip blob being written leaves restore() with nothing to restore from, and
// restore() exits 1 - so the release lane dies on the FIRST step that touches the
// cache, with no earlier signal. That is exactly what happened to /download.html:
// the registry hash was updated by 7c96aab61, the blob was never written, and every
// release run failed there until the blob was regenerated. Checking it here surfaces
// the same condition from a cheap status call instead of a dead release lane.
function status(){const reg=registry(),allowed=scope();let drift=0,missing=0,missingCache=0;for(const [route,r] of Object.entries(reg.records||{})){if(!fs.existsSync(path.join(ROOT,r.blob||'')))missingCache++;const p=path.join(ROOT,r.path);if(!fs.existsSync(p)){missing++;continue;}if(!allowed.has(normalizeRoute(route))&&hash(fs.readFileSync(p))!==r.sha256)drift++;}console.log(JSON.stringify({command:'status',frozen:Object.keys(reg.records||{}).length,active_mutation_routes:allowed.size,unscoped_drift:drift,missing_rendered:missing,missing_cache:missingCache},null,2));if(drift||missing||missingCache)process.exit(1);}
function restore(){const reg=registry(),allowed=scope();let restored=0,thawed=0,missing=0;for(const [route,r] of Object.entries(reg.records||{})){if(allowed.has(normalizeRoute(route))){thawed++;continue;}const blob=path.join(ROOT,r.blob||'');if(!fs.existsSync(blob)){missing++;continue;}const raw=zlib.gunzipSync(fs.readFileSync(blob));const p=path.join(ROOT,r.path);const cur=fs.existsSync(p)?hash(fs.readFileSync(p)):null;if(cur!==r.sha256){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,raw);restored++;}}console.log(JSON.stringify({command:'restore',restored,transactionally_thawed:thawed,missing_cache:missing},null,2));if(missing)process.exit(1);}
function collectScope(){const routes=new Set();const add=(r)=>{const n=normalizeRoute(r);if(n)routes.add(n);};const plan=load(path.join(ROOT,'artifacts/validation/daily-citation-release-plan.json'),{});for(const r of plan.selected||[]){add(r.route_owner);if(r.source_file)add(routeFromPath(r.source_file));}const agent=load(path.join(ROOT,'artifacts/validation/agent-exact-implementation-plan.json'),{});for(const s of agent.specs||[]){if(s.status==='PLANNED'&&s.implementation_path)add(routeFromPath(s.implementation_path));}fs.mkdirSync(path.dirname(SCOPE),{recursive:true});fs.writeFileSync(SCOPE,JSON.stringify({schema_version:'1.0',generated_at:new Date().toISOString(),sources:['daily-citation-release-plan','agent-exact-implementation-plan'],routes:[...routes].sort()},null,2)+'\n');console.log(JSON.stringify({command:'prepare-scope',routes:routes.size},null,2));}

// SHRINK GUARD ON THE ACCEPT PATH.
//
// freeze() used to record whatever was on disk, with no floor of any kind. Its
// only gate was UNSCOPED_FROZEN_OUTPUT_DRIFT - refuse if a frozen page changed
// outside the active mutation scope - and that gate is structurally disarmed by
// the step immediately before it: collectDriftScope() adds EVERY drifted route
// to the scope, and both writing lanes run them back to back
// (package.json release:agent-intake and release:zero-dollar-autonomous). After
// prepare-drift-scope, `unscoped` is empty by construction, so anything of any
// size was accepted.
//
// That is not hypothetical. On ae39ee266, an unattended lane re-froze 24 routes
// and 18 of them got THINNER - up to 890 bytes - becoming the new baseline while
// validate_frozen_output_contract.mjs printed PASS 2225/2225. It deliberately
// asserts only schema shape, never size or parity, so it cannot see this.
//
// Re-accepting a thinner page is how content is lost silently while CI stays
// green. So a re-freeze that drops a material amount of a page is now a hard
// stop, and EVERY shrink is reported even when it is under the threshold -
// nothing shrinks quietly.
//
// The threshold is deliberately not tuned to make today's tree pass: today's
// worst case is 890 bytes on a 29,390-byte page (3.0%), which reports and
// proceeds. A page losing a fifth of itself does not.
const SHRINK_BYTES = Number(process.env.FROZEN_OUTPUT_SHRINK_BYTES || 2048);
const SHRINK_RATIO = Number(process.env.FROZEN_OUTPUT_SHRINK_RATIO || 0.10);
function auditShrink(old, records) {
  const shrunk = [];
  for (const [route, next] of Object.entries(records)) {
    const prev = old.records?.[route];
    if (!prev || !prev.blob) continue;
    let before;
    try { before = zlib.gunzipSync(fs.readFileSync(path.join(ROOT, prev.blob))).length; } catch { continue; }
    let after;
    try { after = fs.statSync(path.join(ROOT, next.path)).size; } catch { continue; }
    if (after >= before) continue;
    const lost = before - after;
    shrunk.push({ route, path: next.path, before, after, lost, ratio: Number((lost / before).toFixed(4)) });
  }
  shrunk.sort((a, b) => b.lost - a.lost);
  const material = shrunk.filter((s) => s.lost >= SHRINK_BYTES && s.ratio >= SHRINK_RATIO);
  if (shrunk.length) {
    console.log(JSON.stringify({
      notice: 'FROZEN_OUTPUT_SHRINK_REPORT',
      shrunk: shrunk.length,
      total_bytes_lost: shrunk.reduce((n, s) => n + s.lost, 0),
      threshold: { bytes: SHRINK_BYTES, ratio: SHRINK_RATIO },
      sample: shrunk.slice(0, 20),
    }, null, 2));
  }
  if (material.length && process.env.FROZEN_OUTPUT_ACCEPT_SHRINK !== '1') {
    console.error(JSON.stringify({
      error: 'FROZEN_OUTPUT_MATERIAL_SHRINK',
      message: `${material.length} page(s) would be re-frozen having lost at least ${SHRINK_BYTES} bytes and 10% of their content. Re-accepting these makes the thinner output the new baseline and the loss becomes invisible. Establish that the trim is intended, then re-run with FROZEN_OUTPUT_ACCEPT_SHRINK=1.`,
      count: material.length,
      sample: material.slice(0, 20),
    }, null, 2));
    process.exit(1);
  }
  return shrunk;
}

function freeze(){const old=registry(),allowed=scope();const unscoped=[];for(const [route,r] of Object.entries(old.records||{})){const p=path.join(ROOT,r.path);if(!fs.existsSync(p))continue;const h=hash(fs.readFileSync(p));if(h!==r.sha256&&!allowed.has(normalizeRoute(route)))unscoped.push({route,path:r.path,before:r.sha256,after:h});}if(unscoped.length){console.error(JSON.stringify({error:'UNSCOPED_FROZEN_OUTPUT_DRIFT',count:unscoped.length,sample:unscoped.slice(0,20)},null,2));process.exit(1);}fs.mkdirSync(CACHE,{recursive:true});const records={};for(const a of admitted()){const raw=fs.readFileSync(path.join(ROOT,a.path));const h=hash(raw);const blob=`data/release/frozen_accepted_outputs/${h}.html.gz`;const abs=path.join(ROOT,blob);if(!fs.existsSync(abs))fs.writeFileSync(abs,zlib.gzipSync(raw,{level:9,mtime:0}));records[a.route]={path:a.path,sha256:h,blob};}const shrink_report=auditShrink(old,records);const keep=new Set(Object.values(records).map(r=>path.basename(r.blob)));for(const n of fs.readdirSync(CACHE))if(n.endsWith('.html.gz')&&!keep.has(n))fs.rmSync(path.join(CACHE,n),{force:true});const out={schema_version:'1.1',policy:'accepted_output_freeze',source_registry:'data/content/page_admission_registry.json',accepted_statuses:['ADMITTED','admitted'],mutation_scope:'data/release/active_mutation_scope.json',records};fs.writeFileSync(REG,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({command:'freeze',frozen:Object.keys(records).length,accepted_mutation_routes:allowed.size,unscoped_drift:0,shrunk_routes:shrink_report.length,bytes_lost:shrink_report.reduce((n,s)=>n+s.lost,0)},null,2));}
function collectDriftScope(){const reg=registry();const routes=new Set([...scope()]);let scanned=0,changed=0,missing=0;for(const [route,r] of Object.entries(reg.records||{})){scanned++;const p=path.join(ROOT,r.path);if(!fs.existsSync(p)){missing++;continue;}const h=hash(fs.readFileSync(p));if(h!==r.sha256){routes.add(normalizeRoute(route));changed++;}}fs.mkdirSync(path.dirname(SCOPE),{recursive:true});const existing=load(SCOPE,{sources:[]});fs.writeFileSync(SCOPE,JSON.stringify({schema_version:'1.0',generated_at:new Date().toISOString(),sources:[...new Set([...(existing.sources||[]),'frozen-output-drift-diff'])],mode:'exact_post_run_changed_routes',scanned_frozen_routes:scanned,changed_frozen_routes:changed,missing_rendered_routes:missing,routes:[...routes].sort()},null,2)+'\n');console.log(JSON.stringify({command:'prepare-drift-scope',routes:routes.size,changed_frozen_routes:changed,missing_rendered_routes:missing},null,2));if(missing)process.exit(1);}
function clear(){fs.rmSync(SCOPE,{force:true});console.log(JSON.stringify({command:'clear-scope',cleared:true},null,2));}
const cmd=process.argv[2]||'status';const fn={status,restore,freeze,'prepare-scope':collectScope,'prepare-drift-scope':collectDriftScope,'clear-scope':clear}[cmd];if(!fn)throw new Error(`Unknown command ${cmd}`);fn();
