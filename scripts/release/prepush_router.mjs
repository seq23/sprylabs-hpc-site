import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const local=process.env.RELEASE_EXECUTION_ENV==='local';
const command=local?'release:prepush:local':'release:prepush:container';
console.log(`[release:prepush] selected profile: ${local?'local':'container'}`);
fs.mkdirSync('artifacts/diagnostics/prepush',{recursive:true});
fs.writeFileSync('artifacts/diagnostics/prepush/profile.json',JSON.stringify({profile:local?'local':'container',command,generated_at:new Date().toISOString()},null,2)+'\n');
const r=spawnSync('npm',['run',command],{stdio:'inherit',env:process.env}); process.exit(r.status??1);
