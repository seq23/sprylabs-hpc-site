import fs from 'node:fs';
export function nowIso() { return new Date().toISOString(); }
export function readJson(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
export function adapterResult({adapter, source, mode, terms_status, records = [], errors = [], warnings = [], status = 'PASS'}) {
  return {adapter, source, mode, terms_status, collected_at: nowIso(), records, errors, warnings, status};
}
export function blockedAdapter(adapter, source, mode, terms_status, reason) {
  const status = terms_status === 'blocked' ? 'BLOCKED' : 'WARN';
  return adapterResult({adapter, source, mode, terms_status, records: [], warnings: [reason], status});
}
