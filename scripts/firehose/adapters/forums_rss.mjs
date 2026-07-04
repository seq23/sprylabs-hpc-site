import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'forums_rss';
export async function collect(config = {}) {
  const source = config.id || 'forums_rss';
  const mode = config.mode || 'rss';
  const terms_status = config.terms_status || 'requires_review';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'requires terms review before live RSS/forum collection.');

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; requires terms review before live RSS/forum collection.'], status: 'PASS'});
}
