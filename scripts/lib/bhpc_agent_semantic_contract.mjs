import {requiredBlockTypesForPageFamily} from './bhpc_agent_block_schema.mjs';

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function normalizeBhpcSemanticText(value = '') {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function uniqueBhpcSemanticValues(values = []) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const value = clean(raw);
    const key = normalizeBhpcSemanticText(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

export function bhpcSourceRecordIds(entry = {}) {
  return uniqueBhpcSemanticValues([
    entry.record_id || entry.id,
    ...(entry.source_record_ids || []),
    ...(entry.source_entry_ids || [])
  ]);
}

export function requiredBlockTypesForBhpcEntry(entry = {}) {
  return uniqueBhpcSemanticValues([
    ...(entry.required_block_types || []),
    ...requiredBlockTypesForPageFamily(entry.page_family)
  ]);
}

export function bhpcSemanticEntryKey(entry = {}) {
  return [
    clean(entry.run_date),
    clean(entry.scope),
    clean(entry.implementation_path).toLowerCase(),
    clean(entry.operation),
    clean(entry.page_family),
    normalizeBhpcSemanticText(entry.query),
    normalizeBhpcSemanticText(entry.required_heading),
    normalizeBhpcSemanticText(entry.source_fix_instruction)
  ].join('::');
}

export function groupBhpcSemanticEntries(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = bhpcSemanticEntryKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()].map(group => {
    const primary = group.find(entry => entry.seo_execution_status === 'VALID') || group[0];
    return {
      primary,
      entries: group,
      record_ids: uniqueBhpcSemanticValues(group.flatMap(bhpcSourceRecordIds)),
      required_strings: uniqueBhpcSemanticValues(group.flatMap(entry => entry.required_strings || [])),
      required_block_types: uniqueBhpcSemanticValues(group.flatMap(requiredBlockTypesForBhpcEntry))
    };
  });
}

export function renderBhpcRecordEvidence(entries = []) {
  return groupBhpcSemanticEntries(entries).map(group => {
    const entry = group.primary;
    const recordIds = group.record_ids;
    const markers = recordIds
      .map(id => `<span hidden data-bhpc-agent-record="${escapeHtml(id)}"></span>`)
      .join('');
    const visibleCopy = uniqueBhpcSemanticValues([
      entry.query,
      entry.required_heading,
      ...(group.required_strings || [])
    ]);
    const paragraphs = visibleCopy
      .map(value => `<p class="bhpc-agent-evidence-copy">${escapeHtml(value)}</p>`)
      .join('');
    return `<article class="bhpc-agent-record-evidence" data-bhpc-agent-evidence="true" data-bhpc-agent-record="${escapeHtml(recordIds[0] || '')}">${markers}<h3>${escapeHtml(entry.required_heading || entry.query || 'Practical implementation')}</h3>${paragraphs}</article>`;
  }).join('\n');
}
