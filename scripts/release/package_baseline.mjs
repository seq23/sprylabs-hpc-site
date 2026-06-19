import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(); const outDir=process.env.OUTPUT_DIR||'/mnt/data';
const critical=JSON.parse(fs.readFileSync('_baseline_packaging_contract.json','utf8')).required_files;
const hashes={}; for(const f of critical)hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sourceFingerprint=crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
fs.writeFileSync('_artifact_validation_manifest.json',JSON.stringify({schema_version:'1.0',generated_at:new Date().toISOString(),profile:'container',source_tree_fingerprint:sourceFingerprint,critical_file_hashes:hashes,artifact_zip_sha256:'SEE_SIDECAR_SHA256',local_browser_validation:'NOT_EXECUTED',required_local_command:'npm run release:prepush:local',repair_note:'Unified programmatic admission across manual and workflow-generated lanes, registry-driven redirect normalization, candidate quarantine, deterministic clean rebuild proof, validated CI artifact handoff to distribution, full CTA enforcement, final-render schema parity, Node 24 workflows, and compact 24-check browser validation.'},null,2)+'\n');
const short=sourceFingerprint.slice(0,8); const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'2-digit',day:'2-digit',year:'2-digit'}).format(new Date()).replaceAll('/','-'); const name=`sprylabs-hpc-site-main_BASELINE_${date}_${short}.zip`; const zip=path.join(outDir,name); try{fs.rmSync(zip,{force:true});}catch{}
const parent=path.dirname(root),base=path.basename(root);
execFileSync('zip',['-q','-r',zip,base,'-x',`${base}/.git/*`,`${base}/node_modules/*`,`${base}/.env`,`${base}/.env.*`,`${base}/.auth/*`,`${base}/logs/*`,`${base}/artifacts/diagnostics/*`,`${base}/test-results/*`,`${base}/playwright-report/*`,`${base}/reports/*`,`${base}/coverage/*`,`${base}/.build/*`,`${base}/data/authority/*`,`${base}/data/answer_surface/*`,`${base}/data/answer_surface_monitoring/*`,`${base}/data/backlog/*`,`${base}/data/intake/source_ingestion/*`,`${base}/*/__pycache__/*`,`${base}/*/*/__pycache__/*`,`${base}/*/*/*/__pycache__/*`,`${base}/*.pyc`,`${base}/*/*.pyc`,`${base}/*/*/*.pyc`,`${base}/*/*/*/*.pyc`],{cwd:parent});
const zipHash=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex'); fs.writeFileSync(`${zip}.sha256`,`${zipHash}  ${path.basename(zip)}\n`); console.log(JSON.stringify({zip,sha256:zipHash,source_fingerprint:sourceFingerprint},null,2));
