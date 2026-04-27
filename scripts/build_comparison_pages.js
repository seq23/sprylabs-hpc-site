#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path');
const { CTA_TARGET, AUTHORITY_DOMAIN } = require('./lib/audience_frame');
const { renderComparison } = require('./render/render_comparison');
const ROOT=process.cwd();
const COMPETITORS=[
  {slug:'betterup',name:'BetterUp',angle:'enterprise coaching and behavior-change platform'},
  {slug:'hone',name:'Hone',angle:'live leadership training and coaching platform'},
  {slug:'culture-amp',name:'Culture Amp',angle:'employee engagement and performance platform'}
];
function esc(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function render(c){
  return renderComparison(c);
}
function main(){
  const dir=path.join(ROOT,'comparisons'); fs.mkdirSync(dir,{recursive:true});
  const manifest={generated_at:new Date().toISOString(),items:[]};
  for(const c of COMPETITORS){
    const file=`bhpc-vs-${c.slug}.html`;
    fs.writeFileSync(path.join(dir,file),render(c));
    manifest.items.push({competitor:c.name,path:`comparisons/${file}`,canonical_target:`${AUTHORITY_DOMAIN}/comparisons/${file}`,cta_target:CTA_TARGET,audience:['founder','executive','athlete','parent'],intent:'comparison'});
  }
  fs.mkdirSync(path.join(ROOT,'data'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'data','comparison_pages.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`comparison: rendered ${manifest.items.length} competitor pages`);
}
if(require.main===module) main();
