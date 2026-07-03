import fs from 'node:fs';
import path from 'node:path';
import {ROOT, repoPathFromIntendedWinnerPage} from '../agent_intake/bhpc_agent_common.mjs';
import {classifyBhpcPageFamily, pathForBhpcPageFamily} from './bhpc_page_family_router.mjs';

function safeRelative(rel = '') {
  const value = String(rel || '').replace(/^\/+/, '');
  if (!value || /^n\/?a(?:\/index\.html)?$/i.test(value) || value.includes('..') || path.isAbsolute(value)) return '';
  return value;
}

export function resolveBhpcAgentRoute(row = {}, {owner = null, policy = null} = {}) {
  const ownerPath = safeRelative(owner?.primary_page || '');
  const intendedPath = safeRelative(row.intended_winner_path || repoPathFromIntendedWinnerPage(row.intended_winner_page, policy) || '');
  const declaredPath = safeRelative(row.implementation_path || '');

  if (String(row.operation || '').startsWith('BLOCKED_')) {
    const pageFamily = classifyBhpcPageFamily(row);
    return {status: 'BLOCKED_SOURCE_ROW', page_family: pageFamily, implementation_path: declaredPath, blocked_reason: row.blocked_reason || row.operation};
  }

  const repairPath = ownerPath || intendedPath;
  if (repairPath) {
    const exists = fs.existsSync(path.join(ROOT, repairPath));
    const fallbackFamily = classifyBhpcPageFamily({...row, operation: exists ? 'REPAIR_INTENDED_WINNER_PAGE' : 'CREATE_NEW_TARGET_PAGE'});
    return {
      status: exists ? 'EXACT_EXISTING_REPAIR' : 'MISSING_INTENDED_CREATE',
      page_family: exists ? 'intended_winner_repair' : fallbackFamily,
      implementation_path: repairPath,
      blocked_reason: ''
    };
  }

  // Invalid legacy routes such as n/a/index.html are not allowed to create a placeholder path.
  // Re-route by query/page family instead of preserving the placeholder.
  const routeRow = {...row, operation: 'CREATE_NEW_TARGET_PAGE', intended_winner_path: '', implementation_path: ''};
  const pageFamily = classifyBhpcPageFamily(routeRow);
  const familyPath = safeRelative(pathForBhpcPageFamily(routeRow));
  if (!familyPath) return {status: 'BLOCKED_UNSAFE_ROUTE', page_family: pageFamily, implementation_path: '', blocked_reason: 'unsafe_or_empty_route'};
  return {status: 'FAMILY_ROUTED_CREATE', page_family: pageFamily, implementation_path: familyPath, blocked_reason: ''};
}
