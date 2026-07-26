#!/usr/bin/env node
const fs=require('fs'), path=require('path'); const ROOT=process.cwd();
const p=path.join(ROOT,'data/intake/build_backlog.json');
if (!fs.existsSync(p)) throw new Error('missing data/intake/build_backlog.json');
const data=JSON.parse(fs.readFileSync(p,'utf8')); const items=data.items||[];
if (!items.length) throw new Error('backlog empty');
const seen=new Set();
for (const item of items){
  const id=item.cluster_id || item.id;
  if (!id) throw new Error('backlog item missing cluster_id/id');
  if (seen.has(id)) throw new Error(`duplicate backlog cluster ${id}`);
  seen.add(id);
  if (item.status !== 'approved') throw new Error(`non-approved backlog item included: ${id}`);
  if (Number(item.score || 0) < Number(data.threshold || 0.55)) throw new Error(`low score backlog item included: ${id}`);
  if (!Array.isArray(item.queries) || !item.queries.length) throw new Error(`backlog item missing queries: ${id}`);
}
console.log(`BACKLOG CONTRACT PASS: ${items.length} approved items`);
