import {slug} from '../agent_intake/bhpc_agent_common.mjs';
import {BHPC_AGENT_BLOCK_TYPES, blockTypesForAgentText} from './bhpc_agent_block_schema.mjs';
import {resolveBhpcAgentRoute} from './bhpc_agent_route_resolver.mjs';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values.map(clean).filter(Boolean)) {
    const key = value.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(value); }
  }
  return out;
}

function phraseCandidates(text = '') {
  const value = clean(text);
  const quoted = [...value.matchAll(/["“”'‘’]([^"“”'‘’]{4,90})["“”'‘’]/g)].map(match => match[1]);
  const afterDefine = [...value.matchAll(/(?:defines?|titled|called|named)\s+([^.,;:]{6,90})/gi)].map(match => match[1]);
  const named = [...value.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){1,7})\b/g)].map(match => match[1]);
  const firstSentence = value.split(/[.!?]/)[0] || value;
  return unique([...quoted, ...afterDefine, ...named, firstSentence.slice(0, 110)]).slice(0, 8);
}

function tableColumnsFor(types = []) {
  if (types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)) {
    return ['Decision criterion', 'What the page must clarify', 'Implementation evidence'];
  }
  return [];
}

function minimumRowsFor(types = []) {
  return types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE) ? 3 : 0;
}

export function buildBhpcAcceptanceEntry(row = {}, context = {}) {
  const query = clean(row.query || row.title || 'BHPC agent signal');
  const fix = clean(row.fix_recommendation || row.recommendation || row.gap || row.why_worth_building || query);
  const gap = clean(row.gap || row.issue || row.finding || '');
  const combined = [query, fix, gap, row.primary_fix_type, row.action_tier].map(clean).join(' ');
  const route = resolveBhpcAgentRoute(row, context);
  const requiredBlockTypes = blockTypesForAgentText(combined);
  const phrases = phraseCandidates(`${query}. ${fix}. ${gap}`);
  const requiredStrings = unique([
    query,
    fix,
    'BHPC agent recommendation',
    'Agent-directed implementation',
    'Agent source instruction',
    ...phrases,
    route.page_family === 'fallback_gap_fill' ? 'fallback gap fill' : '',
    requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE) ? 'Decision criterion' : '',
    requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.CHECKLIST) ? 'Implementation checklist' : '',
    requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.PROTOCOL) ? 'Operating protocol' : '',
    requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.SOURCE_BLOCK) ? 'Citation and authority signals' : '',
    requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.CTA_CALLOUT) ? 'Conversion path' : ''
  ]).slice(0, 14);
  const blocked = Boolean(route.blocked_reason || String(route.status).startsWith('BLOCKED'));
  return {
    id: row.id || `${row.run_date || 'unknown'}-${slug(query)}`,
    record_id: row.id || `${row.run_date || 'unknown'}-${slug(query)}`,
    run_date: row.run_date || context.run_date || '',
    scope: row.scope || context.scope || 'bhpc',
    query,
    source_gap: gap,
    source_fix_instruction: fix,
    action_tier: clean(row.action_tier || ''),
    primary_fix_type: clean(row.primary_fix_type || ''),
    operation: row.operation || (route.page_family === 'intended_winner_repair' ? 'REPAIR_INTENDED_WINNER_PAGE' : 'CREATE_NEW_TARGET_PAGE'),
    intended_winner_page: row.intended_winner_page || '',
    intended_winner_path: row.intended_winner_path || '',
    implementation_path: route.implementation_path,
    route_status: route.status,
    route_resolution: route.route_resolution || null,
    page_family: route.page_family,
    acceptance_status: blocked ? 'BLOCKED' : 'REQUIRED',
    blocked_reason: route.blocked_reason || '',
    required_heading: `Agent recommendation implementation: ${query}`.slice(0, 180),
    required_block_types: requiredBlockTypes,
    required_strings: requiredStrings,
    table_columns_exact: tableColumnsFor(requiredBlockTypes),
    min_table_rows: minimumRowsFor(requiredBlockTypes),
    placement: route.page_family === 'intended_winner_repair' ? 'before_closing_body' : 'page_body',
    proof_selector: `[data-bhpc-agent-record="${row.id || slug(query)}"]`,
    raw_hash_basis: clean(JSON.stringify(row.raw || row)).slice(0, 1000)
  };
}
