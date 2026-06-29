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
  return path.posix.join(...parts).replace(/\/+ /g, '/').replace(/\/+/g, '/');
}

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'agent-signal';
}

export function safeScope(value = 'bhpc') {
  return slug(value || 'bhpc') || 'bhpc';
}

export function normalizedScopeKey(value = 'bhpc') {
  return safeScope(value).replace(/-/g, '_');
}

export function runKey(runDate, scope = 'bhpc') {
  return `${runDate}_${normalizedScopeKey(scope)}`;
}

export function sourceKey(runDate, scope = 'bhpc') {
  return `${runDate}-${safeScope(scope)}-agent`;
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
    for (const scopeDirName of fs.readdirSync(dateDir).sort()) {
      const scopeDir = path.join(dateDir, scopeDirName);
      if (!fs.statSync(scopeDir).isDirectory()) continue;
      const manifestAbs = path.join(scopeDir, 'agent_run_manifest.json');
      if (!fs.existsSync(manifestAbs)) continue;
      const manifestRel = posixJoin(AGENT_ROOT, date, scopeDirName, 'agent_run_manifest.json');
      const manifest = readJson(manifestRel, {});
      const scope = safeScope(manifest.scope || manifest.bucket || manifest.vertical || scopeDirName || 'bhpc');
      manifests.push({
        runDate: date,
        scope,
        scopeDirName,
        dirRel: posixJoin(AGENT_ROOT, date, scopeDirName),
        manifestRel,
        manifest,
      });
    }
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
  if (!raw || /^n\/?a$/i.test(raw)) return null;
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
  if (!raw || /^n\/?a$/i.test(raw)) return true;
  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://billionairehighperformancecoach.com');
    return new Set(policy.allowed_intended_winner_hosts || ['billionairehighperformancecoach.com', 'spryexecutiveos.com']).has(parsed.hostname);
  } catch { return true; }
}

function boolish(value) { return /^(y|yes|true|1|needed)$/i.test(String(value || '').trim()); }

function pick(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && String(row[key]).trim()) return row[key];
  }
  return '';
}

export function classifyRow(row, htmlDigestText = '', context = {}) {
  const combined = Object.values(row || {}).join(' ') + ' ' + htmlDigestText;
  const scope = safeScope(context.scope || row.scope || row.vertical || 'bhpc');
  const query = pick(row, ['query','prompt','question','search_query','keyword','topic','title','issue','finding','intended_query']) || `${scope} agent signal`;
  const cited = pick(row, ['cited_domain','cited_source','cited_sources','citation','source','source_domain']);
  const gap = pick(row, ['gap','issue','finding','recommendation','action','notes','why_worth_building','reason']);
  const intendedWinnerPage = pick(row, ['intended_winner_page','target_url','url','page','target_page','intended_page','recommended_url','winner_url']);
  const patchNeeded = boolish(pick(row, ['patch_needed_y_n','patch_needed','gap_found','fix_needed'])) || /patch|fix|not cited|gap|weak|missing|absent|outperform|free win|page fix|authority/i.test(combined);
  const fixRecommendation = pick(row, ['fix_recommendation','recommendation','action','notes','why_worth_building']) || gap || '';
  const actionTier = pick(row, ['action_tier','tier','category']);
  const primaryFixType = pick(row, ['primary_fix_type','gap_type','fix_type','recommended_cluster','cluster','category']);
  const policy = loadExactPolicy();
  const intendedPath = repoPathFromIntendedWinnerPage(intendedWinnerPage, policy);
  let operation = row.operation || 'CREATE_NEW_TARGET_PAGE';
  let blockedReason = '';
  if (patchNeeded && intendedWinnerPage && !allowedHostFromUrl(intendedWinnerPage, policy)) {
    operation = 'BLOCKED_EXTERNAL_DOMAIN';
    blockedReason = 'intended_winner_page_not_on_allowed_host';
  } else if (patchNeeded && intendedPath && fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'REPAIR_INTENDED_WINNER_PAGE';
  } else if (patchNeeded && intendedPath && !fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'CREATE_NEW_TARGET_PAGE';
  }
  const scoreRaw = pick(row, ['score','priority','severity','purchase_path_potential','priority_score','progress_level_1_4','level']);
  const numeric = Number(String(scoreRaw).replace(/[^0-9.]/g, ''));
  const score = Number.isFinite(numeric) && numeric > 0 ? Math.min(100, numeric <= 10 ? numeric * 10 : numeric) : (/gap|not cited|miss|fail|absent|weak|outperform|page fix/i.test(combined) ? 85 : 65);
  return {
    scope,
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
    implementation_path: intendedPath || `agent/${scope}/${slug(query)}.html`,
    score,
  };
}

function firstArtifactRel(dirRel, extensions = [], exclude = []) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return '';
  const files = fs.readdirSync(abs).sort();
  const excluded = new Set(exclude);
  const match = files.find(file => !excluded.has(file) && extensions.some(ext => file.toLowerCase().endsWith(ext)));
  return match ? posixJoin(dirRel, match) : '';
}

function resolveArtifactRel(entry, key, defaultFile, extensions) {
  const manifestValue = entry.manifest?.[key];
  if (manifestValue) return manifestValue;
  const defaultRel = posixJoin(entry.dirRel, defaultFile);
  if (defaultFile && fs.existsSync(path.join(ROOT, defaultRel))) return defaultRel;
  return firstArtifactRel(entry.dirRel, extensions, ['agent_run_manifest.json']);
}

function parseVelocityJson(payload, scope, runDate) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {rows: [], page_specs: [], scoreboard: null, json_vertical: ''};
  const categories = [
    ['free_wins', 'free_win'],
    ['page_fixes', 'page_fix'],
    ['outperform', 'outperform'],
    ['authority_required', 'authority_required'],
    ['wins', 'win'],
    ['pending', 'pending']
  ];
  const rows = [];
  for (const [key, category] of categories) {
    const items = Array.isArray(payload[key]) ? payload[key] : [];
    for (const item of items) {
      if (item && typeof item === 'object') rows.push({...item, category, vertical: payload.vertical || scope});
    }
  }
  const page_specs = (Array.isArray(payload.pages_to_build) ? payload.pages_to_build : []).map((item, index) => {
    const query = pick(item, ['query','title','topic','question']) || `${scope} page spec ${index + 1}`;
    const cluster = pick(item, ['recommended_cluster','cluster','category']) || 'agent-pages-to-build';
    return {
      id: `${runDate}-${scope}-page-${String(index + 1).padStart(3, '0')}`,
      scope,
      query: String(query).trim(),
      recommended_cluster: String(cluster).trim(),
      why_worth_building: String(pick(item, ['why_worth_building','reason','recommendation','notes']) || '').trim(),
      implementation_path: `agent/${scope}/${slug(query)}.html`,
      operation: 'CREATE_NEW_TARGET_PAGE',
      source: 'json_pages_to_build',
      raw: item,
    };
  });
  return {rows, page_specs, scoreboard: payload.scoreboard || null, json_vertical: payload.vertical || ''};
}

export function digestManifest(entry) {
  const scope = safeScope(entry.scope || entry.manifest?.scope || entry.manifest?.bucket || entry.manifest?.vertical || 'bhpc');
  const csvRel = resolveArtifactRel(entry, 'csv_path', `${scope}.csv`, ['.csv']);
  const htmlRel = resolveArtifactRel(entry, 'html_path', `${scope}.html`, ['.html', '.htm']);
  const jsonRel = resolveArtifactRel(entry, 'json_path', `${scope}.json`, ['.json']);
  const csvText = csvRel && fs.existsSync(path.join(ROOT, csvRel)) ? fs.readFileSync(path.join(ROOT, csvRel), 'utf8') : '';
  const htmlText = htmlRel && fs.existsSync(path.join(ROOT, htmlRel)) ? fs.readFileSync(path.join(ROOT, htmlRel), 'utf8') : '';
  const jsonPayload = jsonRel && fs.existsSync(path.join(ROOT, jsonRel)) ? readJson(jsonRel, null) : null;
  const jsonDigest = parseVelocityJson(jsonPayload, scope, entry.runDate);
  const htmlDigestText = htmlToText(htmlText).slice(0, 6000);
  const csvRows = parseCsv(csvText);
  const sourceRows = csvRows.length ? csvRows : jsonDigest.rows;
  const normalizedRows = sourceRows.map((row, index) => ({
    id: `${entry.runDate}-${scope}-${String(index + 1).padStart(3, '0')}`,
    ...classifyRow(row, htmlDigestText, {scope}),
    raw: row,
  }));
  if (!normalizedRows.length && htmlDigestText) {
    normalizedRows.push({
      id: `${entry.runDate}-${scope}-001`,
      scope,
      query: `${scope} citation digest follow-up`,
      cited_source: '',
      gap: htmlDigestText.slice(0, 420),
      intended_winner_page: '',
      intended_winner_path: '',
      patch_needed: false,
      fix_recommendation: htmlDigestText.slice(0, 420),
      action_tier: 'digest',
      primary_fix_type: 'digest',
      operation: 'CREATE_NEW_TARGET_PAGE',
      implementation_path: `agent/${scope}/citation-digest-follow-up.html`,
      blocked_reason: '',
      score: 70,
      raw: {source: 'html_digest_only'},
    });
  }
  return {
    scope,
    csvRel,
    htmlRel,
    jsonRel,
    csv_sha256: csvRel && fs.existsSync(path.join(ROOT, csvRel)) ? hashFile(csvRel) : null,
    html_sha256: htmlRel && fs.existsSync(path.join(ROOT, htmlRel)) ? hashFile(htmlRel) : null,
    json_sha256: jsonRel && fs.existsSync(path.join(ROOT, jsonRel)) ? hashFile(jsonRel) : null,
    html_digest_text: htmlDigestText,
    rows: normalizedRows,
    csv_row_count: csvRows.length,
    json_fix_row_count: jsonDigest.rows.length,
    json_pages_to_build_count: jsonDigest.page_specs.length,
    json_scoreboard_total: jsonDigest.scoreboard?.total ?? null,
    json_scoreboard: jsonDigest.scoreboard,
    json_vertical: jsonDigest.json_vertical,
    page_specs: jsonDigest.page_specs,
    artifact_shape: {
      csv: Boolean(csvRel),
      html: Boolean(htmlRel),
      json: Boolean(jsonRel),
      json_scoreboard: Boolean(jsonDigest.scoreboard),
      pages_to_build: jsonDigest.page_specs.length,
    },
  };
}
