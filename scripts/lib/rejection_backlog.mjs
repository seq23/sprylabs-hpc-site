// The bounded rejection ledger every admission gate appends to. Extracted from
// scripts/programmatic/run_lane.mjs so the exact-agent created-page gate
// (scripts/agent_intake/admit_bhpc_agent_created_pages.mjs) records its rejections
// in the SAME ledger with the SAME compaction, rather than keeping its own list.
import fs from 'node:fs';
import path from 'node:path';

export const REJECTION_BACKLOG_PATH='data/programmatic/rejection_backlog.json';
const MAX_REJECTION_BACKLOG_RECORDS=2500;
const MAX_REJECTION_BACKLOG_BYTES=8*1024*1024;
export function compactRejectionBacklog(backlog,incoming=[]){
 const current=Array.isArray(backlog.rejections)?backlog.rejections:[];
 const all=[...current,...incoming].sort((a,b)=>String(a.rejected_at||'').localeCompare(String(b.rejected_at||''))||String(a.run_id||'').localeCompare(String(b.run_id||''))||String(a.path||'').localeCompare(String(b.path||'')));
 const next={...backlog};
 next.schema_version=next.schema_version||'1.0';
 next.updated_at=new Date().toISOString();
 next.compaction_note='Rejected candidates are retained as a bounded operational ledger so generated workflows cannot create root-deployed files that exceed Cloudflare Pages asset limits. Older detailed rows are summarized in compaction_summary.';
 next.compaction_policy={max_records:MAX_REJECTION_BACKLOG_RECORDS,max_bytes:MAX_REJECTION_BACKLOG_BYTES};
 const priorSummary=next.compaction_summary||{};
 const priorByLane=priorSummary.by_lane||{};
 function summarize(rows){
  const byLane={};
  for(const row of rows){const key=String(row.lane||'unknown');byLane[key]=(byLane[key]||0)+1;}
  return byLane;
 }
 let retained=all.slice(-MAX_REJECTION_BACKLOG_RECORDS);
 let compacted=all.slice(0,Math.max(0,all.length-retained.length));
 let candidate={...next,rejections:retained};
 for(;;){
  const encoded=JSON.stringify(candidate,null,2)+'\n';
  if(Buffer.byteLength(encoded)<=MAX_REJECTION_BACKLOG_BYTES||retained.length<=250)break;
  const drop=Math.max(100,Math.ceil(retained.length*0.1));
  compacted=[...compacted,...retained.slice(0,drop)];
  retained=retained.slice(drop);
  candidate={...candidate,rejections:retained};
 }
 const byLane=summarize(compacted);
 candidate.compaction_summary={
  total_compacted_count:Number(priorSummary.total_compacted_count||0)+compacted.length,
  latest_compacted_at:compacted.length?new Date().toISOString():(priorSummary.latest_compacted_at||null),
  by_lane:Object.fromEntries([...new Set([...Object.keys(priorByLane),...Object.keys(byLane)])].sort().map(key=>[key,Number(priorByLane[key]||0)+Number(byLane[key]||0)])),
  retained_count:retained.length
 };
 return candidate;
}
export function writeRejectionBacklog(incoming,root=process.cwd()){
 const file=path.join(root,REJECTION_BACKLOG_PATH);
 const backlog=JSON.parse(fs.readFileSync(file,'utf8'));
 const compacted=compactRejectionBacklog(backlog,incoming);
 fs.writeFileSync(file,JSON.stringify(compacted,null,2)+'\n');
}
