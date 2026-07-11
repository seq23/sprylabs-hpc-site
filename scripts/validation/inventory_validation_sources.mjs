#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const roots=['scripts','_ops'];
const files=[];
function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else if(/\.(?:js|mjs|cjs|py|sh)$/.test(e.name))files.push(f)}}
for(const r of roots)walk(r);
const records=[];
for(const file of files){const text=fs.readFileSync(file,'utf8');const rel=path.relative(ROOT,file).replace(/\\/g,'/');const hard=[...text.matchAll(/process\.exit\(1\)|throw new Error|status\s*[:=]\s*['"]FAIL['"]|console\.error/g)].length;const warn=[...text.matchAll(/warnings?\.push|console\.warn|\bWARN(?:ING)?\b|warning-only/g)].length;if(hard||warn)records.push({file:rel,hard_gate_signals:hard,warning_signals:warn,classification:hard&&warn?'mixed':hard?'hard-gate-source':'warning-source'});}
records.sort((a,b)=>a.file.localeCompare(b.file));
const out={schema_version:'1.0',generated_at:new Date().toISOString(),files_scanned:files.length,source_count:records.length,hard_gate_source_count:records.filter(r=>r.hard_gate_signals).length,warning_source_count:records.filter(r=>r.warning_signals).length,records};
fs.mkdirSync('artifacts/validation',{recursive:true});fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('artifacts/validation/validation-source-inventory.json',JSON.stringify(out,null,2)+'\n');
fs.writeFileSync('reports/validation-source-inventory.json',JSON.stringify(out,null,2)+'\n');
console.log(`[validation-source-inventory] PASS: scanned=${out.files_scanned}; sources=${out.source_count}; hard=${out.hard_gate_source_count}; warning=${out.warning_source_count}`);
