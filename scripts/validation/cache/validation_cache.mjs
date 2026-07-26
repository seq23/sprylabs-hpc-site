#!/usr/bin/env node
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
const root=process.cwd(), cache=path.join(root,'.validation-cache','v1');
const cmd=process.argv[2]||'inspect';
if(cmd==='clear'){fs.rmSync(path.join(root,'.validation-cache'),{recursive:true,force:true});console.log('[validation:cache:clear] PASS');process.exit(0)}
const idx=path.join(cache,'page-index.json');let data={schema_version:'1.0',epoch:'page-audit-v1',entries:{}};try{data=JSON.parse(fs.readFileSync(idx,'utf8'))}catch{}
const entries=Object.values(data.entries||{});const out={status:'PASS',epoch:data.epoch||null,entries:entries.length,objects:fs.existsSync(path.join(cache,'objects'))?fs.readdirSync(path.join(cache,'objects')).length:0,cache_present:fs.existsSync(cache)};
fs.mkdirSync('artifacts/validation',{recursive:true});fs.writeFileSync('artifacts/validation/cache-summary.json',JSON.stringify(out,null,2)+'\n');console.log(`[validation:cache:inspect] PASS: entries=${out.entries}; present=${out.cache_present}`);
