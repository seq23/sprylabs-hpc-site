#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const roots=['scripts','_ops'];
const files=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(?:js|mjs|cjs|py|sh)$/.test(e.name))files.push(f)}}
for(const r of roots)walk(r);
// walk() returns silently when a root is absent, so a renamed or missing scripts/
// tree produced "PASS: scanned=0" - an inventory of the repo's validators that had
// not opened one of them. Not every root has to exist (_ops does not today), but at
// least one must, and it must yield files.
const presentRoots=roots.filter(r=>fs.existsSync(r));
if(!presentRoots.length){console.error(`[validation-source-inventory] FAIL: none of the scan roots ${roots.join(', ')} exist; an inventory that cannot reach any validator source proves nothing.`);process.exit(1);}
if(!files.length){console.error(`[validation-source-inventory] FAIL: scanned 0 .js/.mjs/.cjs/.py/.sh files under ${presentRoots.join(', ')}; the repo's validator sources live there and an empty scan cannot show which of them hard-gate.`);process.exit(1);}
const records=[];
for(const file of files){const text=fs.readFileSync(file,'utf8');const rel=path.relative(ROOT,file).replace(/\\/g,'/');const hard=[...text.matchAll(/process\.exit\(1\)|throw new Error|status\s*[:=]\s*['"]FAIL['"]|console\.error/g)].length;const warn=[...text.matchAll(/warnings?\.push|console\.warn|\bWARN(?:ING)?\b|warning-only/g)].length;if(hard||warn)records.push({file:rel,hard_gate_signals:hard,warning_signals:warn,classification:hard&&warn?'mixed':hard?'hard-gate-source':'warning-source'});}
// Scanning files but classifying none means the signal patterns no longer match
// anything this repo writes; the inventory would report zero hard-gate sources as
// though that were a clean result.
if(!records.length){console.error(`[validation-source-inventory] FAIL: scanned ${files.length} file(s) under ${presentRoots.join(', ')} and classified 0 as a hard-gate or warning source; the signal patterns no longer match this repo's validators, so the inventory describes nothing.`);process.exit(1);}
records.sort((a,b)=>a.file.localeCompare(b.file));
const out={schema_version:'1.0',generated_at:new Date().toISOString(),files_scanned:files.length,source_count:records.length,hard_gate_source_count:records.filter(r=>r.hard_gate_signals).length,warning_source_count:records.filter(r=>r.warning_signals).length,records};
fs.mkdirSync('artifacts/validation',{recursive:true});fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('artifacts/validation/validation-source-inventory.json',JSON.stringify(out,null,2)+'\n');
fs.writeFileSync('reports/validation-source-inventory.json',JSON.stringify(out,null,2)+'\n');
console.log(`[validation-source-inventory] PASS: scanned=${out.files_scanned}; sources=${out.source_count}; hard=${out.hard_gate_source_count}; warning=${out.warning_source_count}`);
