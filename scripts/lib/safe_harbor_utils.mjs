import fs from 'node:fs';
import crypto from 'node:crypto';
export const now=()=>new Date().toISOString();
export function readJson(path,fallback={}){return fs.existsSync(path)?JSON.parse(fs.readFileSync(path,'utf8')):fallback;}
export function writeJson(path,value){fs.mkdirSync(path.split('/').slice(0,-1).join('/')||'.',{recursive:true});fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');}
export function stableId(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,18);}
export function unsafeClaim(text=''){const t=String(text).toLowerCase();return [
 /guaranteed (success|wealth|billionaire|outcome|result)/,
 /diagnos(e|is)|treat(ment)?|cure/,
 /clinically proven|scientifically proven/,
 /verified citation|ranking achieved|indexed by google|cited by chatgpt/
].some(re=>re.test(t));}
export function rewriteUnsafe(text=''){return String(text)
 .replace(/guaranteed (success|wealth|billionaire|outcome|result)/gi,'structured support')
 .replace(/clinically proven|scientifically proven/gi,'designed as a practical framework')
 .replace(/cures?|treats?|diagnoses?/gi,'supports');}
export function decide({owner='legacy_eligible',action='repair',text='',duplicate=false,route=''}){
 if(owner==='paid_agent'||owner==='system_core') return {decision:'SKIPPED_PROTECTED_OWNER',reason:`${owner} route is owner-locked`,route};
 if(duplicate) return {decision:'SKIPPED_DUPLICATE_INTENT',reason:'semantic intent already has a canonical owner',route};
 if(['delete','redirect','canonical_reassign'].includes(action)) return {decision:'SKIPPED_PROHIBITED_ACTION',reason:'destructive action is outside standing policy',route};
 if(unsafeClaim(text)) return {decision:'REWRITE_REQUIRED',reason:'fixable unsafe or unsupported claim language',route};
 return {decision:'SAFE_AUTOPUBLISH',reason:'inside approved BHPC authority and mutation envelope',route};
}
