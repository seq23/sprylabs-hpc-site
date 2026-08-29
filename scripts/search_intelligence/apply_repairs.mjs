#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {readJson,writeJson,stamp,ownerMap,safePublicFile} from './lib/core.mjs';
const apply=process.argv.includes('--write')||process.env.SEARCH_SELF_HEAL_WRITE==='1';const r=readJson('data/search_intelligence/repair_candidates.json',{candidates:[]});const owners=ownerMap();const ledger=readJson('data/search_intelligence/repair_ledger.json',{schema_version:'1.1',repairs:[]});const existing=new Set((ledger.repairs||[]).map(x=>x.repair_id));const receipts=[];const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
// A ledger entry used to retire a repair_id permanently. That made the loop one-shot:
// once applied, a repair was never re-attempted even if the page later lost the block,
// so stripping every search-intelligence block off a governed page produced
// "mode=WRITE receipts=0" and a green validator. The ledger records what was DONE; it
// is not evidence of what is currently TRUE on the page. So skip a ledgered repair only
// while its block is still present, and re-apply the moment it is actually absent.
const blockPresent=(c)=>{const f=safePublicFile(c.owned_route);return fs.existsSync(f.path)&&fs.readFileSync(f.path,'utf8').includes(`data-search-intelligence-repair="${c.repair_id}"`);};
for(const c of r.candidates||[]){if(existing.has(c.repair_id)&&blockPresent(c))continue;const f=safePublicFile(c.owned_route);const own=owners.get(f.rel);if(own?.owner==='paid_agent'||own?.protected===true){receipts.push({...c,status:'BLOCKED_AGENT_OWNED'});continue}if(!fs.existsSync(f.path)){receipts.push({...c,status:'BLOCKED_MISSING_PAGE'});continue}const before=fs.readFileSync(f.path,'utf8');let after=before;
  if(c.repair_type==='snippet_alignment'){
    const oldTitle=(after.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[,''])[1];const queryTitle=`${c.query} | Spry Executive OS`;if(oldTitle&&!oldTitle.toLowerCase().includes(String(c.query).toLowerCase()))after=after.replace(/<title[^>]*>[\s\S]*?<\/title>/i,`<title>${esc(queryTitle.slice(0,90))}</title>`);
    const newDesc=`${c.query}: practical Spry Executive OS guidance, decision criteria, and next actions for readers evaluating this problem.`.slice(0,158);after=after.replace(/<meta\b([^>]*?)name=["']description["']([^>]*?)content=["'][^"']*["']([^>]*?)>/i,`<meta$1name="description"$2content="${esc(newDesc)}"$3>`);
  }
  if(!after.includes(`data-search-intelligence-repair="${c.repair_id}"`)){
    const comps=(c.competitor_domains||[]).slice(0,3).map(esc);const comparison=comps.length?` Search observations also referenced ${comps.join(', ')}; this page therefore clarifies the owned Spry/BHPC approach without claiming a numerical search rank.`:'';
    const block=`<section class="search-intelligence-repair" data-search-intelligence-repair="${c.repair_id}"><h2>${esc(c.query)}</h2><p>${esc(c.current_description||c.current_title||'This page explains the relevant Spry Executive OS framework and the practical decision it supports.')} ${comparison}</p><p><strong>Decision use:</strong> use the framework on this page to compare the problem, the operating constraint, and the next executable action before adding another tool or reset.</p></section>`;after=after.replace(/<\/main>/i,`${block}</main>`);if(after===before)after=after.replace(/<\/body>/i,`${block}</body>`);
  }
  const changed=after!==before;if(apply&&changed)fs.writeFileSync(f.path,after);const rec={...c,status:apply?(changed?'APPLIED':'NO_CHANGE'):'DRY_RUN',applied_at:stamp(),before_sha256:sha(before),after_sha256:sha(apply?after:before),rollback:{type:'content_hash',restore_sha256:sha(before)},validation_required:true,publishes:false,mutates_publishing_cadence:false};receipts.push(rec);
}
// Reconcile the ledger with what is actually on the pages. A row saying APPLIED whose
// block is gone AND which no current candidate proposes cannot be re-applied - the
// target query set has moved on - so leaving it as APPLIED makes the ledger state a
// falsehood the new presence check would fail on forever. Two such rows already existed
// on main (repair_8099f050f264327c, repair_cba9990eadccb102): the one-shot skip lost
// them silently and nothing noticed. Recording them as SUPERSEDED is the truthful state:
// applied once, no longer present, nothing proposing it now.
const candidateIds=new Set((r.candidates||[]).map(x=>x.repair_id));
const reapplied=new Set(receipts.filter(x=>x.status==='APPLIED').map(x=>x.repair_id));
let superseded=0;
if(apply){
  for(const row of ledger.repairs||[]){
    if(row.status!=='APPLIED'||reapplied.has(row.repair_id)||candidateIds.has(row.repair_id))continue;
    const rel=row.owned_file||row.source_file;
    if(!rel)continue;
    const f=safePublicFile(row.owned_route||rel);
    const present=fs.existsSync(f.path)&&fs.readFileSync(f.path,'utf8').includes(`data-search-intelligence-repair="${row.repair_id}"`);
    if(!present){row.status='SUPERSEDED';row.superseded_at=stamp();row.superseded_reason='block absent from the page and no current repair candidate proposes it';superseded++;}
  }
}
if(apply){ledger.repairs=[...(ledger.repairs||[]),...receipts.filter(x=>['APPLIED','NO_CHANGE'].includes(x.status))];writeJson('data/search_intelligence/repair_ledger.json',ledger)}writeJson('data/search_intelligence/repair_apply_receipt.json',{schema_version:'1.1',generated_at:stamp(),mode:apply?'WRITE':'DRY_RUN',repairs:receipts});console.log(`[search:repair:apply] mode=${apply?'WRITE':'DRY_RUN'} receipts=${receipts.length} reapplied=${reapplied.size} superseded=${superseded}`);
