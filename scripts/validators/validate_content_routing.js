#!/usr/bin/env node
const fs=require('fs'); const p='data/query_metadata.json'; const d=JSON.parse(fs.readFileSync(p,'utf8')); const items=d.items||[];
for (const item of items){ if (!item.path) throw new Error('query metadata item missing path'); if (!item.query_target) throw new Error(`query metadata item missing query_target for ${item.path}`); if (!item.content_family) throw new Error(`query metadata item missing content_family for ${item.path}`); }
console.log(`CONTENT ROUTING CONTRACT PASS: ${items.length} mapped items`);
