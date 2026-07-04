import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'manual_import';
export async function collect(config = {}) {
  const source = config.id || 'manual_import';
  const mode = config.mode || 'manual';
  const terms_status = config.terms_status || 'allowed';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'allowed manual import reads data/signals/manual_import.json when present.');

const optional = 'data/signals/manual_import.json';
if (source === 'manual_import' && fs.existsSync(optional)) {
  const payload = JSON.parse(fs.readFileSync(optional, 'utf8'));
  return adapterResult({adapter, source, mode, terms_status, records: Array.isArray(payload.records) ? payload.records : [], warnings: ['manual import consumed'], status: 'PASS'});
}

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; allowed manual import reads data/signals/manual_import.json when present.'], status: 'PASS'});
}
