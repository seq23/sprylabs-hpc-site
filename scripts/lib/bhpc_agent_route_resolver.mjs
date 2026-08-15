import fs from 'node:fs';
import path from 'node:path';
import {ROOT, repoPathFromIntendedWinnerPage, readJson, slug, loadExactPolicy} from '../agent_intake/bhpc_agent_common.mjs';
import {classifyBhpcPageFamily, pathForBhpcPageFamily} from './bhpc_page_family_router.mjs';

function safeRelative(rel = '') {
  let value = String(rel || '').replace(/^\/+/, '');
  value = value.replace(/^(?:billionairehighperformancecoach\.com|spryexecutiveos\.com)\//i, '');
  if (!value || /^n\/?a(?:\/index\.html)?$/i.test(value) || value.includes('..') || path.isAbsolute(value)) return '';
  return value;
}

function clean(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function pathKey(value = '') {
  return clean(String(value || '').replace(/index\.html$/i, '').replace(/\.html$/i, '').replace(/[/-]+/g, ' '));
}

function basenamePathKey(value = '') {
  return pathKey(path.basename(String(value || '')));
}

function levenshtein(a = '', b = '') {
  const x = clean(a);
  const y = clean(b);
  if (!x && !y) return 0;
  if (!x) return y.length;
  if (!y) return x.length;
  const prev = Array.from({length: y.length + 1}, (_, i) => i);
  const curr = Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= y.length; j += 1) prev[j] = curr[j];
  }
  return prev[y.length];
}

function similarity(a = '', b = '') {
  const x = clean(a);
  const y = clean(b);
  if (!x || !y) return 0;
  const maxLen = Math.max(x.length, y.length, 1);
  const edit = 1 - (levenshtein(x, y) / maxLen);
  const ax = new Set(x.split(' ').filter(Boolean));
  const by = new Set(y.split(' ').filter(Boolean));
  const inter = [...ax].filter(token => by.has(token)).length;
  const union = new Set([...ax, ...by]).size || 1;
  const token = inter / union;
  return Math.max(edit, token);
}

function walkHtml(dir = ROOT, prefix = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (['.git','node_modules','.wrangler','.cache','dist'].includes(name)) continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) out.push(...walkHtml(abs, rel));
    else if (/\.html$/i.test(name) && !rel.startsWith('reports/') && !rel.startsWith('artifacts/')) out.push(rel);
  }
  return out;
}

function activeRegistryRows(registryRows = null) {
  const rows = Array.isArray(registryRows)
    ? registryRows
    : (readJson('data/citation/query_registry.json', {queries: []}).queries || []);
  return rows
    .filter(row => row && row.release_status === 'ACTIVE' && row.primary_page && fs.existsSync(path.join(ROOT, row.primary_page)))
    .map(row => ({
      path: safeRelative(row.primary_page),
      labels: [row.query, ...(Array.isArray(row.aliases) ? row.aliases : [])].filter(Boolean),
      query_id: row.query_id || ''
    }));
}

function isNewPageSpec(row = {}) {
  return /pages?_to_build|new_page_opportunities|page_spec/i.test([
    row.source_section,
    row.primary_fix_type,
    row.action_tier,
    row.source,
    row.operation
  ].join(' '));
}

function hasPageFixIntent(row = {}) {
  if (isNewPageSpec(row)) return false;
  return /page fix|repair|existing|intended|completeness|structure|clarity|authority|outperform/i.test([
    row.action_tier,
    row.primary_fix_type,
    row.source_section,
    row.operation,
    row.fix_recommendation,
    row.gap
  ].join(' '));
}

function bestMatch(candidates = [], threshold = 0.92) {
  const sorted = candidates.filter(c => c.path && c.score >= threshold).sort((a, b) => b.score - a.score);
  if (!sorted.length) return null;
  const [best, second] = sorted;
  if (second && second.path !== best.path && (best.score - second.score) < 0.025) {
    return {ambiguous: true, best, second, alternatives: sorted.slice(0, 5)};
  }
  return {ambiguous: false, best, alternatives: sorted.slice(0, 5)};
}

function resolvePathTypo(candidatePath = '') {
  const direct = safeRelative(candidatePath);
  if (!direct || fs.existsSync(path.join(ROOT, direct))) return null;
  const directKey = pathKey(direct);
  const directBaseKey = basenamePathKey(direct);
  const candidates = walkHtml().map(existing => ({
    path: existing,
    score: Math.max(
      similarity(directKey, pathKey(existing)),
      directBaseKey ? similarity(directBaseKey, basenamePathKey(existing)) : 0
    ),
    matched_on: 'path_or_basename_slug_similarity'
  }));
  return bestMatch(candidates, 0.93);
}

function resolveRegistryTypo(row = {}, registryRows = null) {
  if (!hasPageFixIntent(row)) return null;
  const query = clean(row.query || row.title || row.topic || '');
  if (!query) return null;
  const candidates = [];
  for (const owner of activeRegistryRows(registryRows)) {
    for (const label of owner.labels) {
      candidates.push({
        path: owner.path,
        score: similarity(query, label),
        matched_on: 'query_registry_similarity',
        label,
        query_id: owner.query_id
      });
    }
  }
  return bestMatch(candidates, 0.91);
}

function typoBlocked(match, reason) {
  return {
    status: 'BLOCKED_AMBIGUOUS_FUZZY_ROUTE',
    page_family: 'blocked_route_resolution',
    implementation_path: '',
    blocked_reason: `${reason}: ${match.best?.path || 'unknown'} vs ${match.second?.path || 'unknown'}`,
    route_resolution: match
  };
}

export function resolveBhpcAgentRoute(row = {}, {owner = null, policy = null, registryRows = null} = {}) {
  const activePolicy = policy || loadExactPolicy();
  const ownerPath = safeRelative(owner?.primary_page || '');
  const intendedPath = safeRelative(row.intended_winner_path || repoPathFromIntendedWinnerPage(row.intended_winner_page, activePolicy) || '');
  const declaredPath = safeRelative(row.implementation_path || '');

  if (String(row.operation || '').startsWith('BLOCKED_')) {
    const pageFamily = classifyBhpcPageFamily(row);
    return {status: 'BLOCKED_SOURCE_ROW', page_family: pageFamily, implementation_path: declaredPath, blocked_reason: row.blocked_reason || row.operation};
  }

  // An explicit intended public URL is stronger than a registry owner path.
  // Registry rows may contain a legacy host-prefixed repo path; never let that
  // create a duplicate /<hostname>/ route instead of repairing the live route.
  const repairPath = intendedPath || ownerPath;
  if (repairPath) {
    const exists = fs.existsSync(path.join(ROOT, repairPath));
    if (exists) {
      return {status: ownerPath ? 'EXACT_OWNER_REPAIR' : 'EXACT_EXISTING_REPAIR', page_family: 'intended_winner_repair', implementation_path: repairPath, blocked_reason: ''};
    }
    if (!isNewPageSpec(row)) {
      const typo = resolvePathTypo(repairPath);
      if (typo?.ambiguous) return typoBlocked(typo, 'ambiguous intended path typo resolution');
      if (typo?.best) {
        return {status: 'TYPO_RESOLVED_EXISTING_REPAIR', page_family: 'intended_winner_repair', implementation_path: typo.best.path, blocked_reason: '', route_resolution: typo};
      }
    }
    const fallbackFamily = classifyBhpcPageFamily({...row, operation: 'CREATE_NEW_TARGET_PAGE'});
    return {
      status: 'MISSING_INTENDED_CREATE',
      page_family: fallbackFamily,
      implementation_path: repairPath,
      blocked_reason: ''
    };
  }

  if (declaredPath) {
    const exists = fs.existsSync(path.join(ROOT, declaredPath));
    const declaredCreateIntent = String(row.source_intent_operation || row.operation || '') === 'CREATE_NEW_TARGET_PAGE' && !row.intended_winner_page && !row.intended_winner_path;
    if (exists && declaredCreateIntent) {
      const declaredFamily = classifyBhpcPageFamily({...row, operation: 'CREATE_NEW_TARGET_PAGE', intended_winner_path: ''});
      return {status: 'DECLARED_CREATE_EXISTING', page_family: declaredFamily, implementation_path: declaredPath, blocked_reason: ''};
    }
    if (exists) {
      return {status: 'DECLARED_EXISTING_REPAIR', page_family: 'intended_winner_repair', implementation_path: declaredPath, blocked_reason: ''};
    }
    if (!isNewPageSpec(row)) {
      const typo = resolvePathTypo(declaredPath);
      if (typo?.ambiguous) return typoBlocked(typo, 'ambiguous declared path typo resolution');
      if (typo?.best) {
        return {status: 'TYPO_RESOLVED_DECLARED_REPAIR', page_family: 'intended_winner_repair', implementation_path: typo.best.path, blocked_reason: '', route_resolution: typo};
      }
    }
    const declaredFamily = classifyBhpcPageFamily({...row, operation: 'CREATE_NEW_TARGET_PAGE'});
    return {status: 'DECLARED_CREATE', page_family: declaredFamily, implementation_path: declaredPath, blocked_reason: ''};
  }


  const exactQuerySlugPath = `${slug(row.query || row.title || '')}.html`;
  if (exactQuerySlugPath !== '.html' && fs.existsSync(path.join(ROOT, exactQuerySlugPath))) {
    return {status: 'EXACT_QUERY_SLUG_REPAIR', page_family: 'intended_winner_repair', implementation_path: exactQuerySlugPath, blocked_reason: ''};
  }

  const registryTypo = resolveRegistryTypo(row, registryRows);
  if (registryTypo?.ambiguous) return typoBlocked(registryTypo, 'ambiguous query registry typo resolution');
  if (registryTypo?.best) {
    return {status: 'TYPO_RESOLVED_REGISTRY_REPAIR', page_family: 'intended_winner_repair', implementation_path: registryTypo.best.path, blocked_reason: '', route_resolution: registryTypo};
  }

  // Invalid legacy routes such as n/a/index.html are not allowed to create a placeholder path.
  // Re-route by query/page family instead of preserving the placeholder.
  const routeRow = {...row, operation: 'CREATE_NEW_TARGET_PAGE', intended_winner_path: '', implementation_path: ''};
  const pageFamily = classifyBhpcPageFamily(routeRow);
  const familyPath = safeRelative(pathForBhpcPageFamily(routeRow));
  if (!familyPath) return {status: 'BLOCKED_UNSAFE_ROUTE', page_family: pageFamily, implementation_path: '', blocked_reason: 'unsafe_or_empty_route'};
  return {status: 'FAMILY_ROUTED_CREATE', page_family: pageFamily, implementation_path: familyPath, blocked_reason: ''};
}
