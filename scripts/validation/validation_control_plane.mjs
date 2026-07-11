import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const ROOT=process.cwd();
export function readJson(file){return JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));}
export function writeJson(file,value){fs.writeFileSync(path.join(ROOT,file),JSON.stringify(value,null,2)+'\n');}
export function packageScripts(){return readJson('package.json').scripts||{};}
export function governedScriptNames(){return Object.keys(packageScripts()).filter(name=>name.startsWith('validate:')||name.startsWith('release:')||name.startsWith('postdeploy:')||name.startsWith('postcleanup:')||name.startsWith('citation:')||['guardrails:all','full:loop','build:all','build:generated-content'].includes(name));}
export function discover(){
 const pkg=packageScripts(); const registry=readJson('_validation_registry.json').records||[];
 const active=new Map(registry.filter(r=>['ADMITTED','NOT_APPLICABLE'].includes(r.status)).map(r=>[r.command,r]));
 const discovered=governedScriptNames().map(name=>({name,command:`npm run ${name}`,definition:pkg[name],registered:active.has(`npm run ${name}`)}));
 return {discovered,unregistered:discovered.filter(x=>!x.registered),orphaned:registry.filter(r=>['ADMITTED','NOT_APPLICABLE'].includes(r.status)&&r.command.startsWith('npm run ')&&!pkg[r.command.slice(8)])};
}
export function runCommand(command,env=process.env){const governedEnv={...env,PYTHONDONTWRITEBYTECODE:'1'}; const r=spawnSync('bash',['-lc',command],{stdio:'inherit',env:governedEnv}); return r.status??2;}
export function normalizeStatus(code){return code===0?'PASS':code===1?'FAIL':'INTERNAL_ERROR';}
