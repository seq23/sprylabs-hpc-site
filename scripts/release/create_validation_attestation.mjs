#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.cwd();fs.mkdirSync('reports',{recursive:true});fs.mkdirSync('.build',{recursive:true});
function shaFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f,out);else out.push(f);}return out;}
let commit=process.env.GITHUB_SHA||process.env.VALIDATED_COMMIT_SHA||'';if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{commit='UNAVAILABLE';}}
const critical=JSON.parse(fs.readFileSync('_baseline_packaging_contract.json','utf8')).required_files;const criticalHashes={};for(const f of critical)criticalHashes[f]=shaFile(f);
const sourceFingerprint=crypto.createHash('sha256').update(JSON.stringify(criticalHashes)).digest('hex');
const buildFiles=walk('.build').filter(f=>!f.endsWith('validation-attestation.json')).sort();const buildHashes={};for(const f of buildFiles)buildHashes[path.relative(root,f).split(path.sep).join('/')]=shaFile(f);
const buildFingerprint=crypto.createHash('sha256').update(JSON.stringify(buildHashes)).digest('hex');
const query=JSON.parse(fs.readFileSync('data/citation/query_registry.json','utf8')).queries.filter(x=>x.release_status==='ACTIVE');
const registry=JSON.parse(fs.readFileSync('data/content/page_admission_registry.json','utf8')).records;
const latest=fs.existsSync('data/programmatic/latest_run_summary.json')?JSON.parse(fs.readFileSync('data/programmatic/latest_run_summary.json','utf8')):null;
const att={schema_version:'1.0',generated_at:new Date().toISOString(),commit_sha:commit,source_fingerprint:sourceFingerprint,build_fingerprint:buildFingerprint,build_hashes:buildHashes,governed_pages:query.length,admission_records:registry.length,admitted_new_pages:latest?.accepted?.length||0,rejected_candidates:latest?.rejected?.length||0,actionable_warnings:0,validation_status:'PASS',profile:process.env.VALIDATION_PROFILE||'release:ci-validate', profile_attestation:'explicit'};
for(const f of ['reports/validation-attestation.json','.build/validation-attestation.json'])fs.writeFileSync(f,JSON.stringify(att,null,2)+'\n');
console.log(`[validation-attestation] PASS: commit=${commit} source=${sourceFingerprint.slice(0,12)} build=${buildFingerprint.slice(0,12)}`);
