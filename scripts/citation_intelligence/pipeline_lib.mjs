import fs from 'node:fs';
export function readJson(path) { return JSON.parse(fs.readFileSync(path,'utf8')); }
export function writeJson(path, payload) { fs.mkdirSync(path.split('/').slice(0,-1).join('/') || '.', {recursive:true}); fs.writeFileSync(path, JSON.stringify(payload,null,2)+'\n'); }
export function normalizeSlug(text) { return String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'untitled'; }
export function loadNormalized() { return readJson('data/signals/normalized/latest_normalized_signals.json').records || []; }
export function buildClusters(records) {
 const groups = new Map();
 for (const r of records) {
  const key = `${r.page_family}:${r.intent}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
 }
 return [...groups.entries()].map(([key, items], i)=>({cluster_id:`spry_cluster_${String(i+1).padStart(3,'0')}`, key, page_family:items[0].page_family, intent:items[0].intent, signals:items.map(x=>x.normalized_id), representative_query:items[0].query, risk_level:items.some(x=>x.risk_level==='high')?'high':items.some(x=>x.risk_level==='medium')?'medium':'low'}));
}
export function scoreRecords(records) {
 return records.map((r,i)=>{
  const base = {create:78, repair:72, atom_update:68, internal_link_update:62, answer_block_update:65, entity_context_update:65, schema_update:58, source_update:57, distribution_update:56, block:0, quarantine:0}[r.candidate_action] ?? 30;
  const riskPenalty = r.risk_level === 'high' ? 40 : r.risk_level === 'medium' ? 10 : 0;
  return {...r, score: Math.max(0, base - riskPenalty), score_basis:['action value','traffic intent','Spry authority fit','risk penalty']};
 });
}
export function candidateFromScore(r) {
 const action = r.risk_level === 'high' || ['block','quarantine'].includes(r.candidate_action) ? 'block' : r.candidate_action;
 const route = r.route_owner || `/${normalizeSlug(r.query)}.html`;
 return {candidate_id:`candidate_${r.normalized_id}`, action, route_owner:route, title:r.title, query:r.query, page_family:r.page_family, source_basis:r.source_basis, expected_aeo_geo_seo_role:{aeo:r.aeo_role, geo:r.geo_role, seo:r.seo_role}, traffic_intent:r.traffic_intent, risk_level:r.risk_level, score:r.score, validation_requirements:['claim safety','atom contract','release plan integrity','structural graph live policy'], status:action==='block'?'BLOCKED':'CANDIDATE'};
}
export function planFromCandidates(candidates) {
 const selected=[]; const blocked=[];
 for (const c of candidates) {
  if (c.status==='BLOCKED' || c.risk_level==='high' || c.action==='block') blocked.push({...c, decision:'blocked', reason:'unsafe, high-risk, or quarantined candidate'});
  else if (selected.length < 4) selected.push({...c, decision:'selected', reason:'highest-value fixture candidate within shadow-mode daily cap'});
  else blocked.push({...c, decision:'not_selected', reason:'daily fixture cap reached'});
 }
 return {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), mode:'SHADOW_MODE', external_telemetry_present:false, selected, blocked, summary:{release_units_planned:candidates.length, selected_units:selected.length, blocked_units:blocked.length, public_mutation:'NO_PUBLIC_MUTATION_SHADOW_MODE'}};
}
