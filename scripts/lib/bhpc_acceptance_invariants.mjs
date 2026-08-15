function clean(value = '') { return String(value || '').trim(); }
function scopeKey(value = '') { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bhpc'; }

export function bhpcAcceptanceRouteKey(entry = {}) {
  const path = clean(entry.implementation_path);
  if (!path) return '';
  return `${clean(entry.run_date)}|${scopeKey(entry.scope)}|${path}`;
}

export function findBhpcAcceptanceRouteConflicts(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = bhpcAcceptanceRouteKey(entry);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const conflicts = [];
  for (const [key, group] of groups) {
    const statuses = new Set(group.map(entry => entry.acceptance_status));
    if (statuses.has('REQUIRED') && statuses.has('BLOCKED')) {
      conflicts.push({
        key,
        acceptance_ids: group.map(entry => entry.id || entry.record_id).filter(Boolean),
        required_ids: group.filter(entry => entry.acceptance_status === 'REQUIRED').map(entry => entry.id || entry.record_id).filter(Boolean),
        blocked_ids: group.filter(entry => entry.acceptance_status === 'BLOCKED').map(entry => entry.id || entry.record_id).filter(Boolean)
      });
    }
  }
  return conflicts;
}
