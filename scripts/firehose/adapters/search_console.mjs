import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'search_console';
export async function collect(config = {}) {
  const source = config.id || 'search_console';
  const mode = config.mode || 'export';
  const terms_status = config.terms_status || 'requires_credentials';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'requires owned Search Console credentials/export before live collection.');

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; requires owned Search Console credentials/export before live collection.'], status: 'PASS'});
}
