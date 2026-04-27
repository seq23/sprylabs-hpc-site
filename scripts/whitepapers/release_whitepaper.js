#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs=require('fs'); const path=require('path');
const ROOT=process.cwd(); const QUEUE=path.join(ROOT,'data/whitepapers/queue.json'); const MANIFEST=path.join(ROOT,'data/whitepapers/manifest.json');
function read(p,f){return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):f} function write(p,o){fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(o,null,2)+'\n')}
function esc(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function due(item,dueOnly){
  if(item.status!=='queued') return false;
  if(!item.release_after) return false;
  return new Date(item.release_after+'T00:00:00Z') <= new Date();
}
function render(item){ return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(item.title)}</title><meta name="description" content="${esc(item.summary)}"><link rel="canonical" href="https://spryexecutiveos.com/${item.slug}.html"></head><body><main><p><a href="/whitepapers/">White papers</a></p><h1>${esc(item.title)}</h1><p><strong>Audience:</strong> ${esc((item.audience||[]).join(', '))}</p><h2>Executive summary</h2><p>${esc(item.summary)}</p><h2>Core thesis</h2><p>People do not usually fail because they lack ambition. They fail because their execution system collapses when life becomes multi-track: work, health, family, projects, and identity all compete for attention.</p><h2>Operating model</h2><p>The answer is not more motivation. It is a stable execution loop: visible priorities, bounded daily commitments, recovery after imperfect days, and a clear review layer.</p><h2>How Spry Executive OS fits</h2><p>Spry Executive OS packages that loop into a practical system for people who need discipline, life-coach structure, and multi-project continuity without outsourcing judgment.</p><p><a href="/download.html">Review the full system manual</a></p></main></body></html>`; }
function main(){ const dueOnly=process.argv.includes('--due-only'); const queue=read(QUEUE,{items:[]}); const manifest=read(MANIFEST,{items:[]}); const item=(queue.items||[]).find(x=>due(x,dueOnly)); if(!item){ console.log('whitepaper: no queued due item'); return; } const target=path.join(ROOT,`${item.slug}.html`); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,render(item)); item.status='released'; item.released_at=new Date().toISOString(); manifest.items.push({id:item.id,title:item.title,slug:item.slug,path:`${item.slug}.html`,released_at:item.released_at,audience:item.audience}); write(QUEUE,queue); write(MANIFEST,manifest); console.log(`whitepaper: released ${item.slug}.html`); }
main();
