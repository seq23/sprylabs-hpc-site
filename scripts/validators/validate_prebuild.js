#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'data/intake/build_backlog.json'),'utf8')); const items=data.items||[];
const slugs=new Set();
for (const item of items){
  const text=[item.cluster_id, ...(item.queries||[]), item.meta?.monetization_alignment, item.meta?.conversion_path].filter(Boolean).join(' ').trim();
  if (text.split(/\s+/).filter(Boolean).length < 2) throw new Error(`prebuild failed weak query clarity: ${item.cluster_id}`);
  if (!item.required_links || item.required_links.length < 1) throw new Error(`prebuild failed missing link target: ${item.cluster_id}`);
  if (!/coach|system|accountability|comparison|betterup|culture|hone|executive|life|planning|decision/i.test(text)) throw new Error(`prebuild failed monetization alignment: ${item.cluster_id}`);
  const slug=String(item.cluster_id).toLowerCase(); if (slugs.has(slug)) throw new Error(`prebuild duplicate cluster: ${slug}`); slugs.add(slug);
}
console.log(`PREBUILD CONTRACT PASS: ${items.length} items cleared`);
