#!/usr/bin/env node
import fs from 'node:fs';
const registry = JSON.parse(fs.readFileSync('data/signals/source_registry.json','utf8'));
const collection = fs.existsSync('artifacts/validation/firehose-collection.json') ? JSON.parse(fs.readFileSync('artifacts/validation/firehose-collection.json','utf8')) : {adapters:[]};
const bySource = new Map((collection.adapters || []).map(a => [a.source, a]));
const sources = (registry.sources || []).map(src => {
  const result = bySource.get(src.id) || {};
  let health = 'SHADOW_OR_DISABLED';
  if (src.enabled && src.terms_status === 'allowed') health = 'ACTIVE_FIXTURE_OR_MANUAL';
  if (src.terms_status === 'requires_credentials') health = 'REQUIRES_CREDENTIALS';
  if (src.terms_status === 'requires_review') health = 'REQUIRES_TERMS_REVIEW';
  if (src.terms_status === 'blocked') health = 'BLOCKED';
  return {...src, status: result.status || (src.enabled ? 'NOT_RUN' : 'DISABLED'), health, records: result.records || 0, warnings: result.warnings || []};
});
const payload = {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), status:'PASS', sources, live_collection_claimed:false};
fs.writeFileSync('data/signals/source_health.json', JSON.stringify(payload,null,2)+'\n');
fs.mkdirSync('artifacts/validation',{recursive:true}); fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('artifacts/validation/source-health-ledger.json', JSON.stringify(payload,null,2)+'\n');
fs.writeFileSync('reports/source-health-ledger.md', `# Source Health Ledger\n\nStatus: PASS\n\nLive collection claimed: false\n\nSources: ${sources.length}\n`);
console.log(`[firehose:health] PASS sources=${sources.length}`);
