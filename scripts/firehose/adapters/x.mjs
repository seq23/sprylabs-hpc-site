import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'x';
export async function collect(config = {}) {
  const source = config.id || 'x';
  const mode = config.mode || 'api';
  const terms_status = config.terms_status || 'requires_credentials';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'requires credentials and API terms before live collection.');

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; requires credentials and API terms before live collection.'], status: 'PASS'});
}
