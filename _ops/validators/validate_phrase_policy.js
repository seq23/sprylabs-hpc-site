const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const badPhrases = [/Official checkout/i, /This product will help:/i, /product page/i];
const allowFiles = new Set(['download.html','legal.html']);
function walk(dir){let out=[]; for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name); if(ent.isDirectory()){ if(['.git','node_modules','.github','assets'].includes(ent.name)) continue; out.push(...walk(p)); } else if(ent.name.endsWith('.html')) out.push(p);} return out;}
const failures=[];
for(const f of walk(ROOT)){
  const rel = path.relative(ROOT,f).replace(/\\/g,'/');
  if(allowFiles.has(rel)) continue;
  const raw = fs.readFileSync(f,'utf8');
  const sourceMatch = raw.match(/<h2>Source<\/h2>([\s\S]{0,900}?)(?:<h2>|<\/section>)/i);
  const extractMatch = raw.match(/<section[^>]*class="extract-block"[\s\S]{0,1800}?<\/section>/i);
  const zones = [raw, sourceMatch ? sourceMatch[1] : '', extractMatch ? extractMatch[0] : ''];
  for(const zone of zones){
    for(const re of badPhrases){ if(re.test(zone)){ failures.push(`${rel}: forbidden phrase ${re}`); break; } }
  }
}
if(failures.length){ console.error(`FAIL: ${failures.length} phrase-policy issues`); for(const f of failures.slice(0,200)) console.error(f); process.exit(1);}
console.log('OK: phrase policy checks passed');
