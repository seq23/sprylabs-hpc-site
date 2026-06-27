import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = process.cwd();
export const AGENT_ROOT = 'data/report_fixes/agent_runs';
export const NORMALIZED_ROOT = 'data/report_fixes/normalized_agent_runs';
export const SOCIAL_RUNS_ROOT = 'data/social/runs';
export const EXACT_POLICY_PATH = 'data/report_fixes/agent_exact_implementation_policy.json';
export const VALID_STATUSES = new Set(['READY_FOR_ABSORPTION', 'ABSORBED', 'QUARANTINED']);

export function posixJoin(...parts) {
  return path.posix.join(...parts).replace(/\/+/g, '/');
}

export function readJson(rel, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch { return fallback; }
}

export function writeJson(rel, payload) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

export function writeText(rel, body) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

export function hashFile(rel) {
  return fs.existsSync(path.join(ROOT, rel)) ? crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex') : null;
}

export function htmlToText(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'bhpc-agent-signal';
}

export function parseCsv(text = '') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  row.push(field);
  if (row.some(cell => String(cell).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(header => slug(header).replace(/-/g, '_'));
  return rows
    .filter(cells => cells.some(cell => String(cell).trim()))
    .map(cells => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || '').trim()])));
}

export function findAgentManifests() {
  const root = path.join(ROOT, AGENT_ROOT);
  if (!fs.existsSync(root)) return [];
  const manifests = [];
  for (const date of fs.readdirSync(root).sort()) {
    const dateDir = path.join(root, date);
    if (!fs.statSync(dateDir).isDirectory()) continue;
    const bhpcDir = path.join(dateDir, 'bhpc');
    const manifestAbs = path.join(bhpcDir, 'agent_run_manifest.json');
    if (!fs.existsSync(manifestAbs)) continue;
    manifests.push({
      runDate: date,
      scope: 'bhpc',
      dirRel: posixJoin(AGENT_ROOT, date, 'bhpc'),
      manifestRel: posixJoin(AGENT_ROOT, date, 'bhpc', 'agent_run_manifest.json'),
      manifest: readJson(posixJoin(AGENT_ROOT, date, 'bhpc', 'agent_run_manifest.json'), {}),
    });
  }
  return manifests;
}

export function loadExactPolicy() {
  return readJson(EXACT_POLICY_PATH, {
    schema_version: '1.0',
    effective_from: '9999-12-31',
    retroactive_processing: false,
    process_manifest_statuses: ['READY_FOR_ABSORPTION'],
    allowed_intended_winner_hosts: ['billionairehighperformancecoach.com', 'spryexecutiveos.com'],
    block_unresolved_patch_rows: true
  });
}

export function manifestAllowedByExactPolicy(entry, policy = loadExactPolicy()) {
  const statuses = new Set(policy.process_manifest_statuses || ['READY_FOR_ABSORPTION']);
  if (!statuses.has(String(entry.manifest?.status || ''))) return false;
  if (policy.retroactive_processing === false && entry.runDate && policy.effective_from && entry.runDate < policy.effective_from) return false;
  return true;
}

export function repoPathFromIntendedWinnerPage(url, policy = loadExactPolicy()) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://billionairehighperformancecoach.com');
    const allowed = new Set(policy.allowed_intended_winner_hosts || ['billionairehighperformancecoach.com', 'spryexecutiveos.com']);
    if (!allowed.has(parsed.hostname)) return null;
    let p = parsed.pathname.replace(/^\//, '');
    if (!p) p = 'index.html';
    if (p.endsWith('/')) p += 'index.html';
    if (!/\.html$/.test(p) && !p.endsWith('/index.html')) p = p.replace(/\/$/, '') + '/index.html';
    return p;
  } catch {
    return raw.replace(/^\//, '');
  }
}

export function allowedHostFromUrl(url, policy = loadExactPolicy()) {
  const raw = String(url || '').trim();
  if (!raw) return true;
  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://billionairehighperformancecoach.com');
    return new Set(policy.allowed_intended_winner_hosts || ['billionairehighperformancecoach.com', 'spryexecutiveos.com']).has(parsed.hostname);
  } catch { return true; }
}

function boolish(value) { return /^(y|yes|true|1|needed)$/i.test(String(value || '').trim()); }

export function classifyRow(row, htmlDigestText = '') {
  const combined = Object.values(row || {}).join(' ') + ' ' + htmlDigestText;
  const query = row.query || row.prompt || row.question || row.search_query || row.keyword || row.topic || row.title || row.issue || row.finding || 'BHPC agent signal';
  const cited = row.cited_domain || row.cited_source || row.cited_sources || row.citation || row.source || '';
  const gap = row.gap || row.issue || row.finding || row.recommendation || row.action || row.notes || '';
  const intendedWinnerPage = row.intended_winner_page || row.target_url || row.url || row.page || row.target_page || row.intended_page || '';
  const patchNeeded = boolish(row.patch_needed_y_n || row.patch_needed || row.gap_found || row.fix_needed) || /patch|fix|not cited|gap|weak|missing|absent/i.test(combined);
  const fixRecommendation = row.fix_recommendation || row.recommendation || row.action || row.notes || gap || '';
  const actionTier = row.action_tier || row.tier || '';
  const primaryFixType = row.primary_fix_type || row.gap_type || row.fix_type || '';
  const policy = loadExactPolicy();
  const intendedPath = repoPathFromIntendedWinnerPage(intendedWinnerPage, policy);
  let operation = 'CREATE_NEW_TARGET_PAGE';
  let blockedReason = '';
  if (patchNeeded && intendedWinnerPage && !allowedHostFromUrl(intendedWinnerPage, policy)) {
    operation = 'BLOCKED_EXTERNAL_DOMAIN';
    blockedReason = 'intended_winner_page_not_on_allowed_host';
  } else if (patchNeeded && intendedPath && fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'REPAIR_INTENDED_WINNER_PAGE';
  } else if (patchNeeded && intendedPath && !fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'CREATE_NEW_TARGET_PAGE';
  }
  const scoreRaw = row.score || row.priority || row.severity || row.purchase_path_potential || row.priority_score || '';
  const numeric = Number(String(scoreRaw).replace(/[^0-9.]/g, ''));
  const score = Number.isFinite(numeric) && numeric > 0 ? Math.min(100, numeric <= 10 ? numeric * 10 : numeric) : (/gap|not cited|miss|fail|absent|weak/i.test(combined) ? 85 : 65);
  return {
    query: String(query).trim().slice(0, 240),
    cited_source: String(cited).trim().slice(0, 180),
    gap: String(gap).trim().slice(0, 420),
    intended_winner_page: String(intendedWinnerPage || '').trim(),
    intended_winner_path: intendedPath || '',
    patch_needed: patchNeeded,
    fix_recommendation: String(fixRecommendation || '').trim().slice(0, 700),
    action_tier: String(actionTier || '').trim(),
    primary_fix_type: String(primaryFixType || '').trim(),
    operation,
    blocked_reason: blockedReason,
    implementation_path: intendedPath || `agent/${slug(query)}.html`,
    score,
  };
}

export function digestManifest(entry) {
  const manifest = entry.manifest || {};
  const csvRel = manifest.csv_path || posixJoin(entry.dirRel, 'bhpc.csv');
  const htmlRel = manifest.html_path || posixJoin(entry.dirRel, 'bhpc.html');
  const csvText = fs.existsSync(path.join(ROOT, csvRel)) ? fs.readFileSync(path.join(ROOT, csvRel), 'utf8') : '';
  const htmlText = fs.existsSync(path.join(ROOT, htmlRel)) ? fs.readFileSync(path.join(ROOT, htmlRel), 'utf8') : '';
  const htmlDigestText = htmlToText(htmlText).slice(0, 6000);
  const rows = parseCsv(csvText);
  const normalizedRows = rows.map((row, index) => ({
    id: `${entry.runDate}-bhpc-${String(index + 1).padStart(3, '0')}`,
    ...classifyRow(row, htmlDigestText),
    raw: row,
  }));
  if (!normalizedRows.length && htmlDigestText) {
    normalizedRows.push({
      id: `${entry.runDate}-bhpc-001`,
      query: 'BHPC citation digest follow-up',
      cited_source: '',
      gap: htmlDigestText.slice(0, 420),
      intended_winner_page: '',
      intended_winner_path: '',
      patch_needed: false,
      fix_recommendation: htmlDigestText.slice(0, 420),
      action_tier: 'digest',
      primary_fix_type: 'digest',
      operation: 'CREATE_NEW_TARGET_PAGE',
      implementation_path: 'agent/bhpc-citation-digest-follow-up.html',
      blocked_reason: '',
      score: 70,
      raw: {source: 'html_digest_only'},
    });
  }
  return {
    csvRel,
    htmlRel,
    csv_sha256: fs.existsSync(path.join(ROOT, csvRel)) ? hashFile(csvRel) : null,
    html_sha256: fs.existsSync(path.join(ROOT, htmlRel)) ? hashFile(htmlRel) : null,
    html_digest_text: htmlDigestText,
    rows: normalizedRows,
  };
}
