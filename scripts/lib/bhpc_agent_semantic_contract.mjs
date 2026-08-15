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
  // Public rendering is keyed by the reader-facing semantic target, not by
  // which source representation (JSON/CSV/page-spec) carried the instruction.
  // This keeps duplicate intake records from leaking into repeated visible copy
  // while preserving every source record id in provenance metadata.
  return [
    clean(entry.run_date),
    clean(entry.scope),
    clean(entry.implementation_path).toLowerCase(),
    normalizeBhpcSemanticText(entry.query),
    normalizeBhpcSemanticText(entry.required_heading)
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
    const recordIds = group.record_ids;
    const evidenceUrls = uniqueBhpcSemanticValues(group.entries.flatMap(entry => entry.evidence_urls || []));
    const markers = recordIds
      .map(id => `<span hidden data-bhpc-agent-record="${escapeHtml(id)}"></span>`)
      .join('');
    const provenance = JSON.stringify({record_ids: recordIds, evidence_urls: evidenceUrls}).replace(/</g, '\u003c');
    return `<span class="bhpc-agent-record-evidence" hidden data-bhpc-agent-evidence="true" data-bhpc-agent-record="${escapeHtml(recordIds[0] || '')}">${markers}</span><script type="application/json" data-bhpc-agent-provenance>${provenance}</script>`;
  }).join('\n');
}

export function renderBhpcVisibleSourceEvidence(entries = []) {
  const requiredDomains = uniqueBhpcSemanticValues(entries.flatMap(entry => entry.evidence_required_domains || []));
  if (!requiredDomains.length) return '';
  const urls = uniqueBhpcSemanticValues(entries.flatMap(entry => entry.evidence_urls || []));
  const matches = urls.filter(url => {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      return requiredDomains.some(domain => {
        const wanted = String(domain).toLowerCase().replace(/^www\./, '');
        return host === wanted || host.endsWith(`.${wanted}`);
      });
    } catch { return false; }
  }).slice(0, 6);
  if (!matches.length) return '';
  const links = matches.map(url => {
    let label = url;
    try {
      const parsed = new URL(url);
      label = `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    } catch {}
    return `<li><a href="${escapeHtml(url)}" rel="nofollow noopener">${escapeHtml(label)}</a></li>`;
  }).join('');
  return `<aside class="bhpc-agent-source-evidence" data-bhpc-agent-source-evidence="true"><h3>First-party source evidence</h3><p>This page uses the following first-party sources to support the named-method attribution. The ChatGPT workflow below is an adaptation, not a claim that the creator prescribed this AI workflow.</p><ul>${links}</ul></aside>`;
}
