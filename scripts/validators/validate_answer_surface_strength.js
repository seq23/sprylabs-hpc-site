#!/usr/bin/env node
'use strict';
const fs=require('fs'); const path=require('path'); const root=process.cwd();
const file=path.join(root,'reports/answer_surface_scorecard.json');
if(!fs.existsSync(file)){console.error('[validate_answer_surface_strength] FAIL: scorecard missing; run build:all');process.exit(1);}
let data; try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){console.error(`[validate_answer_surface_strength] FAIL: invalid scorecard: ${e.message}`);process.exit(1);}
const rows=Array.isArray(data.ranked)?data.ranked:[]; const failures=[]; let unobserved=0;
for(const row of rows){
  if(!row.cluster||typeof row.score!=='number'||!['strong','weak','unknown','not_observed','mentioned_not_cited','cited','regressed'].includes(row.status)) failures.push(`malformed row: ${JSON.stringify(row).slice(0,180)}`);
  const noEvidence=(row.unknown_mentions===row.total_queries)||(row.status==='unknown')||(row.status==='not_observed');
  if(noEvidence) unobserved++;
  else if(row.status==='regressed') failures.push(`${row.cluster}: evidence-backed citation regression`);
}
if(failures.length){console.error(`[validate_answer_surface_strength] FAIL: ${failures.length} issue(s)`); failures.forEach(x=>console.error(` - ${x}`)); process.exit(1);}
console.log(`[validate_answer_surface_strength] OK: ${rows.length} clusters structurally valid; INFO NOT_OBSERVED=${unobserved}`);
