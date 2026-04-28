#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const files=fs.readdirSync(process.cwd()).filter(f=>f.endsWith('.html')).slice(0,40);
let checked=0; for (const f of files){ const s=fs.readFileSync(f,'utf8'); if (!/<h1[\s>]/i.test(s)) throw new Error(`missing h1: ${f}`); if (!/<p[\s>]/i.test(s)) throw new Error(`missing paragraph answer surface: ${f}`); checked++; }
console.log(`EXTRACTABILITY PASS: sampled ${checked} root html pages`);
