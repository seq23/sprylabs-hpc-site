import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'bluesky';
export async function collect(config = {}) {
  const source = config.id || 'bluesky';
  const mode = config.mode || 'firehose';
  const terms_status = config.terms_status || 'requires_review';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'requires ATProto/firehose terms review before live collection.');

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; requires ATProto/firehose terms review before live collection.'], status: 'PASS'});
}
