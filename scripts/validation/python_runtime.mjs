#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=process.cwd();
const RUNTIME=path.join(ROOT,'.validation-runtime');
const VENV=path.join(RUNTIME,'venv');
const PY=process.platform==='win32'?path.join(VENV,'Scripts','python.exe'):path.join(VENV,'bin','python3');
const PIP=process.platform==='win32'?path.join(VENV,'Scripts','pip.exe'):path.join(VENV,'bin','pip');
const REQ=path.join(ROOT,'requirements-validation.txt');
const MARKER=path.join(RUNTIME,'runtime-identity.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const reqHash=()=>sha(fs.readFileSync(REQ));
function basePython(){return process.env.PYTHON_BOOTSTRAP_BIN||'python3'}
function run(cmd,args,opts={}){const r=spawnSync(cmd,args,{stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PIP_DISABLE_PIP_VERSION_CHECK:'1'},...opts});return r.status??2}
function probe(){if(!fs.existsSync(PY))return null;const code=`import json,sys,bs4,lxml,yaml; from bs4 import BeautifulSoup; BeautifulSoup('<p>x</p>','lxml'); print(json.dumps({'python':sys.version.split()[0],'bs4':bs4.__version__,'lxml':lxml.__version__,'yaml':yaml.__version__}))`;const r=spawnSync(PY,['-c',code],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});if(r.status!==0)return null;try{return JSON.parse(r.stdout.trim())}catch{return null}}
export function managedPython(){return PY}
export function ensureRuntime(){
 if(!fs.existsSync(REQ))throw new Error('requirements-validation.txt is missing');
 const wanted=reqHash(); let marker=null; try{marker=JSON.parse(fs.readFileSync(MARKER,'utf8'))}catch{}
 let identity=probe();
 if(!identity||marker?.requirements_sha256!==wanted){
  fs.rmSync(VENV,{recursive:true,force:true});fs.mkdirSync(RUNTIME,{recursive:true});
  let code=run(basePython(),['-m','venv',VENV]);if(code!==0)throw new Error('unable to create validation virtual environment');
  code=run(PIP,['install','-r',REQ]);if(code!==0)throw new Error('unable to install pinned validation dependencies');
  identity=probe();if(!identity)throw new Error('managed validation runtime failed parser probe');
 }
 const final={schema_version:'1.0',requirements_sha256:wanted,...identity,python_executable:path.relative(ROOT,PY),parser:'lxml',yaml:identity.yaml};
 fs.mkdirSync(RUNTIME,{recursive:true});fs.writeFileSync(MARKER,JSON.stringify(final,null,2)+'\n');
 fs.mkdirSync(path.join(ROOT,'artifacts','validation'),{recursive:true});fs.writeFileSync(path.join(ROOT,'artifacts','validation','python-runtime.json'),JSON.stringify({status:'PASS',...final},null,2)+'\n');
 return final;
}
function main(){const [cmd,...args]=process.argv.slice(2);try{
 if(cmd==='bootstrap'||cmd==='preflight'){const id=ensureRuntime();console.log(`[validation:python-runtime] PASS: Python ${id.python}; bs4 ${id.bs4}; lxml ${id.lxml}`);return 0}
 if(cmd==='run'){ensureRuntime();if(!args.length)throw new Error('run requires a Python script or arguments');return run(PY,args)}
 if(cmd==='identity'){console.log(JSON.stringify(ensureRuntime(),null,2));return 0}
 throw new Error('usage: python_runtime.mjs bootstrap|preflight|run <script> [args...]|identity');
 }catch(e){console.error(`[validation:python-runtime] FAIL: ${e.message}`);return 1}}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exit(main());
