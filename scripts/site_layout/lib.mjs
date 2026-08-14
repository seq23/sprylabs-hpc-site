import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const ROOT=process.cwd();
export const CFG=JSON.parse(fs.readFileSync(path.join(ROOT,'config/site_layout.json'),'utf8'));
export const PUBLIC_ROOT=path.join(ROOT,CFG.source_root);
export const DIST_ROOT=path.join(ROOT,CFG.deploy_output);
export const STATE_FILE=path.join(ROOT,'.build','site-layout-stage.json');
export function readState(){try{return JSON.parse(fs.readFileSync(STATE_FILE,'utf8'))}catch{return null}}
export function writeState(v){fs.mkdirSync(path.dirname(STATE_FILE),{recursive:true});fs.writeFileSync(STATE_FILE,JSON.stringify(v,null,2)+'\n')}
export function sha256File(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
export function resolveRuntimePath(rel,env=process.env){
  const normalized=String(rel||'').replace(/\\/g,'/').replace(/^\.\//,'');
  if(env.BHPC_LAYOUT_STAGE_ACTIVE==='1'){
    if(normalized==='site/public' || normalized.startsWith('site/public/')){
      const suffix=normalized==='site/public'?'':normalized.slice('site/public/'.length);
      return path.resolve(ROOT,env.BHPC_PUBLIC_ROOT||CFG.source_root,suffix);
    }
    if(normalized==='dist' || normalized.startsWith('dist/')){
      const suffix=normalized==='dist'?'':normalized.slice('dist/'.length);
      return path.resolve(ROOT,env.BHPC_DEPLOY_ROOT||CFG.deploy_output,suffix);
    }
  }
  return path.resolve(ROOT,normalized);
}
export function rm(p){fs.rmSync(p,{recursive:true,force:true})}
export function copyTree(src,dst){rm(dst);fs.cpSync(src,dst,{recursive:true,dereference:true,preserveTimestamps:true})}
