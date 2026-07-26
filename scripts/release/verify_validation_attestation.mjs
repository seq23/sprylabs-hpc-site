#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const file=process.argv[2]||'.build/validation-attestation.json';const expected=process.argv[3]||process.env.EXPECTED_COMMIT_SHA||'';
if(!fs.existsSync(file)){console.error(`[verify-attestation] missing ${file}`);process.exit(1);}const a=JSON.parse(fs.readFileSync(file,'utf8'));
const errors=[];if(a.validation_status!=='PASS')errors.push('validation_status is not PASS');if(a.actionable_warnings!==0)errors.push('actionable_warnings is not zero');if(expected&&a.commit_sha!==expected)errors.push(`commit mismatch: ${a.commit_sha} != ${expected}`);
function sha(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
const actual={};for(const [rel,hash] of Object.entries(a.build_hashes||{})){if(rel.endsWith('validation-attestation.json'))continue;if(!fs.existsSync(rel))errors.push(`missing artifact file ${rel}`);else{actual[rel]=sha(rel);if(actual[rel]!==hash)errors.push(`hash mismatch ${rel}`);}}
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(actual)).digest('hex');if(fingerprint!==a.build_fingerprint)errors.push('build fingerprint mismatch');
if(errors.length){console.error('[verify-attestation] FAIL');for(const e of errors)console.error(' -',e);process.exit(1);}console.log(`[verify-attestation] PASS: commit=${a.commit_sha} files=${Object.keys(actual).length}`);
