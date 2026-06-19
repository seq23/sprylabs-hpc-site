import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const ROOT = process.cwd();
export function readJson(rel){return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));}
export function exists(rel){return fs.existsSync(path.join(ROOT,rel));}
export function fail(message, details=[]){console.error(message); for(const d of details) console.error(` - ${d}`); process.exit(1);}
export function pass(message){console.log(message);}
export function writeSummary(testId, payload){
  const runId=process.env.PROOF_RUN_ID || 'container-current';
  const dir=path.join(ROOT,'artifacts','diagnostics',runId,testId); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({test_id:testId,generated_at:new Date().toISOString(),...payload},null,2)+'\n');
}
export function sha256File(file){const h=crypto.createHash('sha256'); h.update(fs.readFileSync(file)); return h.digest('hex');}
