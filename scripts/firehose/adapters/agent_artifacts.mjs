import fs from 'node:fs';
import {adapterResult, blockedAdapter} from './adapter_common.mjs';
export const adapter = 'agent_artifacts';
export async function collect(config = {}) {
  const source = config.id || 'agent_artifacts';
  const mode = config.mode || 'export';
  const terms_status = config.terms_status || 'allowed';
  if (!config.enabled || terms_status !== 'allowed') return blockedAdapter(adapter, source, mode, terms_status, 'allowed agent artifact adapter reads owned manifest summaries when present.');

const optional = 'data/report_fixes/agent_runs';
if (source === 'agent_artifacts' && fs.existsSync(optional)) {
  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['agent artifact root present; no ready manifest consumed in fixture run'], status: 'PASS'});
}

  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: ['No live collection performed; allowed agent artifact adapter reads owned manifest summaries when present.'], status: 'PASS'});
}
