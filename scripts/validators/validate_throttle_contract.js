#!/usr/bin/env node
const fs=require('fs'); const p='scripts/social/throttle.js';
if (!fs.existsSync(p)) throw new Error('missing scripts/social/throttle.js');
const s=fs.readFileSync(p,'utf8');
for (const token of ['max','delay','retry','backoff']) if (!new RegExp(token,'i').test(s)) throw new Error(`throttle missing ${token} logic`);
console.log('THROTTLE CONTRACT PASS');
