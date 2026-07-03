#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','templates','data','_ops','reports','artifacts','scripts','docs','fixtures'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f,out);else if(e.isFile()&&e.name.endsWith('.html'))out.push(f);}return out;}
function writeJson(rel,payload){const f=path.join(ROOT,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(payload,null,2)+'\n');}
const errors=[];let scanned=0;let semantic=0;
for(const file of walk(ROOT)){const rel=path.relative(ROOT,file).split(path.sep).join('/');const html=fs.readFileSync(file,'utf8');scanned+=1;if(!/<html[\s>]/i.test(html)&&!/<main[\s>]/i.test(html))errors.push(`${rel}:missing_html_or_main`);if(/\{\{[^}]+\}\}|<%|%>|TODO_PLACEHOLDER/i.test(html))errors.push(`${rel}:unresolved_template_or_placeholder`);if(html.includes('data-bhpc-agent-semantic="true"')){semantic+=1;if(!/data-bhpc-agent-block="direct_answer"/.test(html))errors.push(`${rel}:semantic_agent_section_without_direct_answer_block`);}}
const report={schema_version:'1.0',generated_at:new Date().toISOString(),status:errors.length?'FAIL':'PASS',scanned_html_files:scanned,semantic_agent_pages:semantic,errors};
writeJson('artifacts/validation/bhpc-browser-structural.json',report);
if(errors.length){console.error(`[validate:bhpc-browser-structural] FAIL: ${errors.length} issue(s)`);for(const e of errors.slice(0,80))console.error(` - ${e}`);process.exit(1);}console.log(`[validate:bhpc-browser-structural] PASS: scanned=${scanned}; semantic_pages=${semantic}`);
