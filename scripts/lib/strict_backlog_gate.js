const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const DEFAULT_BACKLOG = path.join(ROOT, 'data/intake/build_backlog.json');
const MIN_SCORE = Number(process.env.STRICT_BACKLOG_MIN_SCORE || '0.55');
function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
  catch { return fallback; }
}
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function loadBacklog(file = DEFAULT_BACKLOG) {
  const data = readJson(file, { items: [] });
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new Error('STRICT GENERATION BLOCKED: build backlog is empty or missing');
  return items;
}
function matches(item, candidate) {
  const id = normalize(candidate.id || candidate.cluster_id || candidate.cluster || candidate.slug || candidate.route || candidate.target_file || candidate.title);
  const fields = [item.id, item.cluster_id, item.cluster, item.slug, item.route, ...(item.target_pages || []), ...(item.queries || [])].map(normalize);
  return fields.includes(id) || fields.some(f => f && id && (f.includes(id) || id.includes(f)));
}
function assertBacklogApproved(candidate, opts = {}) {
  const minScore = Number(opts.minScore ?? MIN_SCORE);
  const backlog = loadBacklog(opts.backlogFile || DEFAULT_BACKLOG);
  const match = backlog.find(item => matches(item, candidate));
  if (!match) throw new Error(`STRICT GENERATION BLOCKED: item is not in backlog (${candidate.slug || candidate.cluster_id || candidate.title || 'unknown'})`);
  if (String(match.status || 'approved') !== 'approved') throw new Error(`STRICT GENERATION BLOCKED: backlog item is not approved (${match.id || match.cluster_id})`);
  if (Number(match.score || 0) < minScore) throw new Error(`STRICT GENERATION BLOCKED: backlog score below threshold (${match.score} < ${minScore})`);
  return match;
}
module.exports = { assertBacklogApproved, loadBacklog };
