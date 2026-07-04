#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {readJson} from './adapters/adapter_common.mjs';
const registry = readJson('data/signals/source_registry.json');
const fixture = readJson('data/signals/fixtures/raw_signals.json');
const results = [];
results.push({adapter:'fixture', source:'fixture_raw_signals', mode:'fixture', terms_status:'allowed', collected_at:new Date().toISOString(), records: fixture.fixture_records || [], errors:[], warnings:['offline fixture records used'], status:'PASS'});
const adapterDir = 'scripts/firehose/adapters';
for (const source of registry.sources || []) {
  if (source.adapter === 'fixture') continue;
  const modPath = path.resolve(`${adapterDir}/${source.adapter}.mjs`);
  if (!fs.existsSync(modPath)) {
    results.push({adapter:source.adapter, source:source.id, mode:source.mode, terms_status:source.terms_status, collected_at:new Date().toISOString(), records:[], errors:[`missing adapter ${modPath}`], warnings:[], status:'FAIL'});
    continue;
  }
  const mod = await import(modPath);
  results.push(await mod.collect(source));
}
const allRecords = results.flatMap(r => (r.records || []).map(record => ({...record, collected_by:r.adapter, collection_source:r.source})));
const ledger = fs.existsSync('data/signals/firehose_ledger.json') ? JSON.parse(fs.readFileSync('data/signals/firehose_ledger.json','utf8')) : {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', runs:[]};
const run = {run_id:`firehose-${Date.now()}`, generated_at:new Date().toISOString(), status:results.some(r=>r.status==='FAIL')?'FAIL':'PASS', adapters:results.map(r=>({adapter:r.adapter, source:r.source, status:r.status, terms_status:r.terms_status, records:(r.records||[]).length, warnings:r.warnings||[], errors:r.errors||[]})), record_count:allRecords.length};
ledger.runs = [...(ledger.runs||[]), run].slice(-30);
fs.mkdirSync('data/signals/raw',{recursive:true}); fs.mkdirSync('artifacts/validation',{recursive:true}); fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('data/signals/raw/latest_firehose_collection.json', JSON.stringify({schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', ...run, records:allRecords}, null, 2)+'\n');
fs.writeFileSync('data/signals/firehose_ledger.json', JSON.stringify(ledger, null, 2)+'\n');
fs.writeFileSync('artifacts/validation/firehose-collection.json', JSON.stringify({schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', ...run}, null, 2)+'\n');
fs.writeFileSync('reports/firehose-collection.md', `# Firehose Collection\n\nStatus: ${run.status}\n\nRecords: ${run.record_count}\n\nLive sources remain disabled, credential-gated, or terms-gated unless authority exists.\n`);
if (run.status !== 'PASS') process.exit(1);
console.log(`[firehose:collect] PASS records=${run.record_count}`);
