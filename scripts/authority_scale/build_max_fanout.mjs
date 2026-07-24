#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const ROOT=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/authority_scale/fanout_dimensions.json'),'utf8'));
const OUT=path.join(ROOT,'data/authority_scale/fanout_100k');
const target=Number(process.argv.find(x=>x.startsWith('--target='))?.split('=')[1] || cfg.minimum_materialized_reference_runway || cfg.reference_materialization_target || 100000);
const preferred=['topics','intent_patterns','audiences','modifiers','formats','geographies','buyer_stages','planning_stages'];
const dims=preferred.filter(k=>Array.isArray(cfg[k])&&cfg[k].length);
let capacity=1n; for(const k of dims) capacity*=BigInt(cfg[k].length);
if(capacity<BigInt(target)) throw new Error(`fanout capacity ${capacity} below target ${target}`);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clean=s=>String(s).replace(/\s+/g,' ').replace(/\s+([,?.])/g,'$1').trim();
function comboAt(n){let x=BigInt(n),o={};for(const k of dims){const a=cfg[k];o[k]=a[Number(x%BigInt(a.length))];x/=BigInt(a.length);}return o;}
function queryOf(c){let q=String(c.intent_patterns||'{topic}').replaceAll('{topic}',c.topics||'').replaceAll('{audience}',c.audiences||'').replaceAll('{geography}',c.geographies||'');const extras=[];if(c.audiences&&!q.toLowerCase().includes(String(c.audiences).toLowerCase()))extras.push(`for ${c.audiences}`);if(c.modifiers&&!q.toLowerCase().includes(String(c.modifiers).toLowerCase()))extras.push(c.modifiers);if(c.geographies&&!q.toLowerCase().includes(String(c.geographies).toLowerCase()))extras.push(`in ${c.geographies}`);return clean([q,...extras].join(' '));}
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
const repo=cfg.repo||JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8')).name||path.basename(ROOT);
const seen=new Set();let cursor=0,produced=0,records=[],shards=[];const size=10000;
function flush(){if(!records.length)return;const part=shards.length;const name=`part-${String(part).padStart(5,'0')}.jsonl.gz`;const raw=Buffer.from(records.map(r=>JSON.stringify(r)).join('\n')+'\n');const gz=zlib.gzipSync(raw,{level:9,mtime:0});fs.writeFileSync(path.join(OUT,name),gz);shards.push({part,path:name,record_count:records.length,compressed_bytes:gz.length,uncompressed_bytes:raw.length,sha256:hash(gz),first_id:records[0].opportunity_id,last_id:records.at(-1).opportunity_id});records=[];}
while(produced<target){if(BigInt(cursor)>=capacity)throw new Error(`exhausted capacity at ${produced}`);const c=comboAt(cursor++);const query=queryOf(c);const key=query.toLowerCase();if(seen.has(key))continue;seen.add(key);records.push({opportunity_id:`maxfanout_${String(produced+1).padStart(6,'0')}_${hash(query).slice(0,10)}`,query,intent_pattern:c.intent_patterns||null,topic:c.topics||null,audience:c.audiences||null,modifier:c.modifiers||null,geography:c.geographies||null,recommended_format:c.formats||null,semantic_cluster:String(c.topics||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),disposition:'OPPORTUNITY_ONLY',page_admission_status:'NOT_EVALUATED',source:'deterministic_max_fanout_v2'});produced++;if(records.length>=size)flush();}
flush();const aggregate=hash(Buffer.from(shards.map(s=>`${s.part}:${s.record_count}:${s.sha256}`).join('\n')));const index={schema_version:'1.1',repo,standard:cfg.standard||'MAXIMUM_FANOUT_PLUS_100K_SURFACING_ACCELERATION',generated_at:'2026-07-24T00:00:00.000Z',capacity_policy:'NO_ARBITRARY_UPPER_CEILING_ON_LEGITIMATE_OPPORTUNITY_DISCOVERY',theoretical_combinations:capacity.toString(),theoretical_combination_capacity:capacity.toString(),record_count:target,materialized_reference_runway:target,unique_exact_queries:seen.size,page_quota:false,compression:'gzip_jsonl',shard_count:shards.length,aggregate_sha256:aggregate,shards};fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify(index,null,2)+'\n');console.log(`MAX FANOUT BUILT ${repo}: ${target} unique opportunities; capacity=${capacity}; shards=${shards.length}`);
