#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,PUBLIC_ROOT,DIST_ROOT,CFG,readState} from './lib.mjs';
const errs=[];
function all(base){const out=[];(function rec(d,prefix=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const fp=path.join(d,e.name);const rel=prefix?`${prefix}/${e.name}`:e.name;if(e.isDirectory())rec(fp,rel);else out.push(rel)}})(base);return out.sort()}
function allStaged(){const out=[];for(const name of CFG.public_entries||[]){const p=path.join(ROOT,name);const st=fs.lstatSync(p,{throwIfNoEntry:false});if(!st)continue;if(st.isDirectory()){for(const rel of all(p))out.push(`${name}/${rel}`)}else out.push(name)}return out.sort()}
const stage=readState(); const staged=Boolean(stage?.active);
const a=staged?allStaged():all(PUBLIC_ROOT); const b=!staged&&fs.existsSync(DIST_ROOT)?all(DIST_ROOT):[];
if(!staged){if(JSON.stringify(a)!==JSON.stringify(b))errs.push(`file-set mismatch source=${a.length} dist=${b.length}`);for(const rel of a){const ss=fs.statSync(path.join(PUBLIC_ROOT,rel));const d=fs.statSync(path.join(DIST_ROOT,rel));if(ss.size!==d.size)errs.push(`size mismatch:${rel}`)}}
const compat=new Set(CFG.deploy_root_compat_entries||[]);
if(staged){for(const name of CFG.public_entries){const rootPath=path.join(ROOT,name);const st=fs.lstatSync(rootPath,{throwIfNoEntry:false});if(!st&&!compat.has(name))errs.push(`staged public entry missing:${name}`)}}
const srcHeaders=fs.readFileSync(path.join(PUBLIC_ROOT,'_headers'),'utf8').trimEnd(); const rootHeaders=fs.existsSync(path.join(ROOT,'_headers'))?fs.readFileSync(path.join(ROOT,'_headers'),'utf8').trimEnd():''; if(rootHeaders!==srcHeaders)errs.push('root _headers is not synchronized with site/public/_headers');
const srcRedirects=fs.readFileSync(path.join(PUBLIC_ROOT,'_redirects'),'utf8').trimEnd(); const rootRedirects=fs.existsSync(path.join(ROOT,'_redirects'))?fs.readFileSync(path.join(ROOT,'_redirects'),'utf8'):''; if(!rootRedirects.startsWith(srcRedirects))errs.push('root _redirects does not preserve source redirect rules');
if((rootRedirects.match(/\/\* \/site\/public\/:splat 200/g)||[]).length!==1)errs.push('root _redirects must contain exactly one source-layout catch-all proxy');
const synth=a.filter(x=>/^synthesis-.*\.html$/i.test(x)); const report={schema:'sprylabs-site-layout-proof-v2',mode:staged?'STAGED_COMPAT':'FINAL_PARITY',status:errs.length?'FAIL':'PASS',source_files:a.length,dist_files:staged?null:b.length,public_root_entries:CFG.public_entries.length,deploy_root_compat_entries:[...compat],synthesis_pages:synth.length,errors:errs};
fs.mkdirSync(path.join(ROOT,'reports/implementation'),{recursive:true});fs.writeFileSync(path.join(ROOT,'reports/implementation/site_layout_validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exit(errs.length?1:0);
