import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeBhpcSeoExecution, isNoActionSeo} from '../lib/bhpc_seo_execution_contract.mjs';

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

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isBlankish(value) {
  const text = compact(value);
  return !text || /^n\/?a$/i.test(text) || /^none$/i.test(text);
}

function stringifyField(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyField).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const preferred = ['edit_instruction', 'gap', 'current_state', 'why_worth_building', 'recommendation', 'summary', 'notes'];
    const parts = [];
    for (const key of preferred) {
      const text = stringifyField(value[key]);
      if (text) parts.push(`${key.replace(/_/g, ' ')}: ${text}`);
    }
    if (parts.length) return parts.join(' | ');
    return Object.entries(value).map(([key, inner]) => {
      const text = stringifyField(inner);
      return text ? `${key.replace(/_/g, ' ')}: ${text}` : '';
    }).filter(Boolean).join(' | ');
  }
  return compact(value);
}

function pick(row, keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined) {
      const text = stringifyField(row[key]);
      if (!isBlankish(text)) return row[key];
    }
  }
  return '';
}

function pathFromRepoFilePath(value = '') {
  const raw = compact(value).replace(/^\/+/, '');
  if (!raw || /^n\/?a$/i.test(raw) || raw.includes('..') || path.isAbsolute(raw)) return '';
  if (/^https?:\/\//i.test(raw)) return repoPathFromIntendedWinnerPage(raw) || '';
  return raw;
}

function sourceSignature(row = {}, context = {}) {
  const basis = [
    context.source_section || row.source_section || row.category || '',
    row.query || row.title || '',
    row.repo_file_path || row.intended_winner_page || row.implementation_path || '',
    stringifyField(row.fix_recommendation || row.why_worth_building || row.recommendation || row.gap || ''),
  ].map(stringifyField).join('||').toLowerCase();
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

export function classifyRow(row, htmlDigestText = '', context = {}) {
  const seoNormalized = normalizeBhpcSeoExecution(row.seo_execution || (row.source_section === 'seo_execution' ? row : null), row);
  const seo = seoNormalized.seo_execution;
  const combined = stringifyField(row || {}) + ' ' + htmlDigestText;
  const scope = safeScope(context.scope || row.scope || row.vertical || 'bhpc');
  const queryValue = pick(row, ['query','prompt','question','search_query','keyword','topic','title','issue','finding','intended_query']) || `${scope} agent signal`;
  const query = stringifyField(queryValue);
  const cited = stringifyField(pick(row, ['cited_domain','cited_source','cited_sources','citation','source','source_domain']));
  const fixRecommendationRaw = seo?.exact_edit || pick(row, ['fix_recommendation','edit_instruction','recommendation','action','notes','why_worth_building','exact_edit']);
  const fixRecommendation = stringifyField(fixRecommendationRaw);
  const gapRaw = pick(row, ['gap','gap_found','issue','finding','recommendation','action','notes','why_worth_building','reason']) || (typeof row.fix_recommendation === 'object' ? row.fix_recommendation?.gap : '');
  const gap = stringifyField(gapRaw);
  const intendedWinnerPage = stringifyField(seo?.target_url || pick(row, ['intended_winner_page','page_url','target_url','url','page','target_page','intended_page','recommended_url','winner_url']));
  const declaredRepoPath = pathFromRepoFilePath(seo?.target_filepath || pick(row, ['repo_file_path','intended_winner_path','implementation_path','target_filepath']));
  const explicitMaintain = context.source_section === 'wins' || /^(maintain page|no action|no gap)$/i.test(compact(fixRecommendation)) || (/maintain page/i.test(compact(fixRecommendation)) && /no gap|cited directly|direct citation win/i.test(`${compact(fixRecommendation)} ${compact(gap)} ${combined}`));
  const patchNeeded = isNoActionSeo(seo) ? false : (seo ? ['repair_existing','build_new','consolidate'].includes(seo.page_decision) : (!explicitMaintain && (boolish(pick(row, ['patch_needed_y_n','patch_needed','fix_needed'])) || /patch|fix|not cited|gap|weak|missing|absent|outperform|page fix|authority|no incumbent/i.test(combined))));
  const actionTier = stringifyField(pick(row, ['action_tier','tier','category']));
  const primaryFixType = stringifyField(pick(row, ['primary_fix_type','gap_type','fix_type','recommended_cluster','cluster','category']));
  const policy = loadExactPolicy();
  const intendedPath = declaredRepoPath || repoPathFromIntendedWinnerPage(intendedWinnerPage, policy) || '';
  let operation = isNoActionSeo(seo) || explicitMaintain ? 'NO_ACTION_MAINTAIN' : (row.operation || 'CREATE_NEW_TARGET_PAGE');
  let blockedReason = '';
  if (operation !== 'NO_ACTION_MAINTAIN' && patchNeeded && intendedWinnerPage && !allowedHostFromUrl(intendedWinnerPage, policy)) {
    operation = 'BLOCKED_EXTERNAL_DOMAIN';
    blockedReason = 'intended_winner_page_not_on_allowed_host';
  } else if (operation !== 'NO_ACTION_MAINTAIN' && patchNeeded && intendedPath && fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'REPAIR_INTENDED_WINNER_PAGE';
  } else if (operation !== 'NO_ACTION_MAINTAIN' && patchNeeded && intendedPath && !fs.existsSync(path.join(ROOT, intendedPath))) {
    operation = 'CREATE_NEW_TARGET_PAGE';
  }
  const scoreRaw = pick(row, ['score','priority','severity','purchase_path_potential','purchase_path_potential_1_5','priority_score','progress_level_1_4','level']);
  const numeric = Number(String(scoreRaw).replace(/[^0-9.]/g, ''));
  const score = Number.isFinite(numeric) && numeric > 0 ? Math.min(100, numeric <= 10 ? numeric * 10 : numeric) : (/gap|not cited|miss|fail|absent|weak|outperform|page fix|free win/i.test(combined) ? 85 : 65);
  return {
    scope,
    query: query.trim().slice(0, 240),
    cited_source: cited.trim().slice(0, 180),
    gap: gap.trim().slice(0, 700),
    intended_winner_page: String(intendedWinnerPage || '').trim(),
    intended_winner_path: intendedPath || '',
    patch_needed: patchNeeded,
    fix_recommendation: (fixRecommendation || gap || '').trim().slice(0, 1200),
    action_tier: actionTier.trim(),
    primary_fix_type: primaryFixType.trim(),
    operation,
    blocked_reason: blockedReason,
    implementation_path: intendedPath || pathForAgentCreate(row, scope, query),
    source_section: context.source_section || row.source_section || row.category || '',
    source_signature: sourceSignature({...row, seo_execution: seo}, context),
    seo_execution_status: seoNormalized.status,
    seo_execution_errors: seoNormalized.errors,
    seo_execution: seo,
    recommended_page_type: seo?.recommended_page_type || compact(pick(row,['recommended_page_type'])),
    page_decision: seo?.page_decision || (operation === 'NO_ACTION_MAINTAIN' ? 'no_action' : ''),
    search_intent: seo?.search_intent || compact(pick(row,['search_intent'])),
    buyer_stage: seo?.buyer_stage || compact(pick(row,['buyer_stage'])),
    score,
  };
}

function pathForAgentCreate(row, scope, query) {
  const declared = pathFromRepoFilePath(row.implementation_path || row.repo_file_path || '');
  return declared || `agent/${scope}/${slug(query)}.html`;
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

function canonicalPagePathForOpportunity(item, scope) {
  const query = stringifyField(pick(item, ['query','title','topic','question'])) || `${scope} page opportunity`;
  const rootPath = `${slug(query)}.html`;
  if (fs.existsSync(path.join(ROOT, rootPath))) return rootPath;
  const family = /\?|how can|what systems|give me|why|when|should/i.test(query) ? 'answers' : 'insights';
  return `${family}/${slug(query)}.html`;
}

function pageSpecFromJsonItem(item, index, scope, runDate, sourceSection = 'json_pages_to_build') {
  const query = stringifyField(pick(item, ['query','title','topic','question'])) || `${scope} page spec ${index + 1}`;
  const cluster = stringifyField(pick(item, ['recommended_cluster','cluster','category'])) || 'agent-pages-to-build';
  const why = stringifyField(pick(item, ['why_worth_building','reason','recommendation','notes','gap']));
  const explicitPath = pathFromRepoFilePath(pick(item, ['implementation_path','repo_file_path','intended_winner_path']));
  const unsupportedPersonAttribution = /\bali abdaal\b/i.test(String(query)) && !pick(item, ['source_url','source_urls','evidence_url','evidence_urls','competitor_url']);
  return {
    id: `${runDate}-${scope}-${sourceSection}-${String(index + 1).padStart(3, '0')}`,
    scope,
    query: String(query).trim(),
    recommended_cluster: String(cluster).trim(),
    why_worth_building: why.trim(),
    implementation_path: explicitPath || canonicalPagePathForOpportunity(item, scope),
    operation: unsupportedPersonAttribution ? 'BLOCKED_UNSUPPORTED_PERSON_ATTRIBUTION' : 'CREATE_NEW_TARGET_PAGE',
    blocked_reason: unsupportedPersonAttribution ? 'creator-specific behavior claim lacks source evidence' : '',
    source: sourceSection,
    source_section: sourceSection,
    source_signature: sourceSignature({...item, source_section: sourceSection}, {source_section: sourceSection}),
    raw: item,
  };
}

function parseVelocityJson(payload, scope, runDate) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {rows: [], page_specs: [], scoreboard: null, json_vertical: ''};
  const categories = [
    ['results', 'result'],
    ['free_wins', 'free_win'],
    ['page_fixes', 'page_fix'],
    ['outperform', 'outperform'],
    ['authority_required', 'authority_required'],
    ['wins', 'win'],
    ['pending', 'pending'],
    ['pending_fixes', 'pending_fix'],
    ['seo_execution', 'seo_execution']
  ];
  const rows = [];
  for (const [key, category] of categories) {
    const items = Array.isArray(payload[key]) ? payload[key] : [];
    for (const item of items) {
      if (item && typeof item === 'object') rows.push({...item, category, source_section: key, vertical: payload.vertical || payload.scope || scope});
    }
  }
  const pageSpecSources = [
    ['pages_to_build', 'json_pages_to_build'],
    ['new_page_opportunities', 'json_new_page_opportunities']
  ];
  const page_specs = [];
  for (const [key, sourceSection] of pageSpecSources) {
    const items = Array.isArray(payload[key]) ? payload[key] : [];
    for (const item of items) {
      if (item && typeof item === 'object') page_specs.push(pageSpecFromJsonItem(item, page_specs.length, scope, runDate, sourceSection));
    }
  }
  return {rows, page_specs, scoreboard: payload.scoreboard || null, json_vertical: payload.vertical || payload.scope || '', site_health: payload.site_health ?? null};
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
  const csvRows = parseCsv(csvText).map(row => ({...row, source_section: 'csv'}));
  const jsonRows = (jsonDigest.rows || []).map(row => ({...row, source_section: row.source_section || 'json'}));
  const sourceRows = [...jsonRows, ...csvRows];
  const normalizedRows = sourceRows.map((row, index) => {
    const classified = classifyRow(row, htmlDigestText, {scope, source_section: row.source_section || 'unknown'});
    return {
      id: `${entry.runDate}-${scope}-${String(index + 1).padStart(3, '0')}`,
      ...classified,
      raw: row,
    };
  });
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
    json_seo_execution_count: (jsonPayload?.seo_execution || []).length,
    site_health: jsonDigest.site_health,
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
      seo_execution: (jsonPayload?.seo_execution || []).length,
      site_health: jsonDigest.site_health !== null,
    },
  };
}
