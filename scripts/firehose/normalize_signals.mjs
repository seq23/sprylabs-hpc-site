#!/usr/bin/env node
import fs from 'node:fs';
const inputPath = 'data/signals/raw/latest_firehose_collection.json';
if (!fs.existsSync(inputPath)) throw new Error('Missing raw collection; run firehose:collect first.');
const input = JSON.parse(fs.readFileSync(inputPath,'utf8'));
const normalized = (input.records || []).map((r, index) => ({
  normalized_id: r.signal_id || `normalized_${index+1}`,
  source: r.source || r.collection_source || 'unknown',
  source_url: r.source_url || null,
  captured_at: r.captured_at || input.generated_at,
  query: String(r.query || '').trim(),
  audience: r.audience || 'unknown',
  intent: r.intent || 'unknown',
  page_family: r.page_family || 'answer',
  candidate_action: r.candidate_action || 'block',
  route_owner: r.route_owner || null,
  title: r.title || r.query || `Signal ${index+1}`,
  aeo_role: r.aeo_role || null,
  geo_role: r.geo_role || null,
  seo_role: r.seo_role || null,
  traffic_intent: r.traffic_intent || 'unknown',
  source_basis: Array.isArray(r.source_basis) ? r.source_basis : ['unspecified fixture basis'],
  risk_level: r.risk_level || 'medium',
  atom_type: r.atom_type || null,
  blocked_reason: r.candidate_action === 'block' ? 'Blocked or quarantined by fixture policy' : null
}));
const errors = [];
for (const item of normalized) {
  for (const field of ['normalized_id','query','candidate_action','page_family','source_basis']) if (!item[field] || (Array.isArray(item[field]) && !item[field].length)) errors.push(`${item.normalized_id}: missing ${field}`);
}
fs.mkdirSync('data/signals/normalized',{recursive:true}); fs.mkdirSync('artifacts/validation',{recursive:true}); fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('data/signals/normalized/latest_normalized_signals.json', JSON.stringify({schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), records:normalized}, null, 2)+'\n');
fs.writeFileSync('artifacts/validation/signal-normalization.json', JSON.stringify({schema_version:'1.4', status:errors.length?'FAIL':'PASS', normalized_count:normalized.length, required_actions:[...new Set(normalized.map(x=>x.candidate_action))], errors}, null, 2)+'\n');
fs.writeFileSync('reports/signal-normalization.md', `# Signal Normalization\n\nStatus: ${errors.length?'FAIL':'PASS'}\n\nNormalized records: ${normalized.length}\n`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`[firehose:normalize] PASS normalized=${normalized.length}`);
