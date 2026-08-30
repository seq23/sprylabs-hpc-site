import {adapterResult, blockedAdapter} from './adapter_common.mjs';

// This adapter cannot produce demand records, and saying so is the whole point.
//
// It used to have two branches - "agent artifact root present" and "not present"
// - that both returned []. Registered `enabled: true` in
// data/signals/source_registry.json, it made the firehose look like it had three
// live sources when only the fixture and the operator's manual import can ever
// emit anything. That is what left `release:plan` stopping on
// ALL_CANDIDATES_FIXTURE_ONLY with no way for a reader to tell a configuration
// gap from a broken collector.
//
// The artifacts it names are not a firehose source and must not become one.
// data/report_fixes/agent_runs and data/report_fixes/normalized_agent_runs are a
// PROTECTED, separated domain: scripts/search_intelligence/prove_agent_separation.mjs
// hashes every file under them and fails the search-intelligence cycle if a
// runtime pass changes one, and the runs carry status ABSORBED because
// scripts/agent_intake/ has already consumed them. Re-emitting absorbed,
// hash-protected agent output into the public page factory would cross that
// boundary and duplicate content another pipeline already owns.
//
// So this stays a declared boundary, never a producer. `producing: false` is read
// by validate_signal_source_producers.mjs, which fails if a source claims to be
// an enabled non-fixture producer and then cannot produce.
export const adapter = 'agent_artifacts';
export const producing = false;

export async function collect(config = {}) {
  const source = config.id || 'agent_artifacts';
  const mode = config.mode || 'export';
  const terms_status = config.terms_status || 'allowed';
  if (!config.enabled || terms_status !== 'allowed') {
    return blockedAdapter(adapter, source, mode, terms_status,
      'agent artifacts are a protected, already-absorbed domain consumed by scripts/agent_intake; this adapter is a boundary declaration, not a firehose producer.');
  }
  return adapterResult({
    adapter, source, mode, terms_status, records: [], status: 'PASS',
    warnings: ['NOT_A_PRODUCING_SOURCE: agent artifacts are hash-protected by prove_agent_separation and already absorbed by scripts/agent_intake; this adapter never emits demand records.'],
  });
}
