import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './bhpc_agent_common.mjs';

function decodeHtml(value = '') {
  return String(value || '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function visibleText(html = '') {
  return decodeHtml(String(html || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+\bhidden\b[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function normalizeSemanticText(value = '') {
  return visibleText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeHtml(value = '') {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function unique(values = []) {
  const seen = new Set();
  const output = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    const key = normalizeSemanticText(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

export function semanticEvidenceKey(entry = {}) {
  return [
    entry.run_date,
    entry.scope,
    entry.implementation_path,
    entry.operation,
    normalizeSemanticText(entry.query),
    normalizeSemanticText(entry.required_heading),
    normalizeSemanticText(entry.source_fix_instruction),
    [...(entry.required_block_types || [])].map(String).sort().join('|')
  ].join('::');
}

export function groupSemanticEvidence(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = semanticEvidenceKey(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.values()].map(group => ({
    primary: group[0],
    record_ids: unique(group.map(entry => entry.record_id || entry.id)),
    required_strings: unique(group.flatMap(entry => entry.required_strings || [])),
    required_block_types: unique(group.flatMap(entry => entry.required_block_types || []))
  }));
}

function evidenceSection(group) {
  const entry = group.primary;
  const recordMarkers = group.record_ids
    .map(id => `<span hidden data-bhpc-agent-record="${escapeHtml(id)}"></span>`)
    .join('');
  const requiredCopy = unique([
    entry.query,
    entry.required_heading,
    ...(group.required_strings || [])
  ]);
  const paragraphs = requiredCopy.map(value => `<p>${escapeHtml(value)}</p>`).join('');
  return `<section class="bhpc-agent-record-evidence" data-bhpc-agent-evidence="true" data-bhpc-agent-record="${escapeHtml(group.record_ids[0] || '')}">${recordMarkers}<h3>${escapeHtml(entry.required_heading || entry.query || 'Practical implementation')}</h3>${paragraphs}</section>`;
}

export function renderSemanticEvidence(entries = []) {
  return groupSemanticEvidence(entries).map(evidenceSection).join('\n');
}

export function ensureSemanticEvidenceForPath(rel, entries = []) {
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return {changed: false, reason: 'unsafe_path'};
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return {changed: false, reason: 'missing_file'};
  const before = fs.readFileSync(abs, 'utf8');
  const withoutEvidence = before.replace(/(?:\r?\n[\t ]*)*<section\b[^>]*class=["'][^"']*bhpc-agent-record-evidence[^"']*["'][\s\S]*?<\/section>(?:[\t ]*\r?\n)*/gi, '\n');
  const rendered = renderSemanticEvidence(entries).trim();
  const after = /<\/body>/i.test(withoutEvidence)
    ? withoutEvidence.replace(/[\t ]*(?:\r?\n[\t ]*)*<\/body>/i, `\n${rendered}\n</body>`)
    : `${withoutEvidence.trimEnd()}\n${rendered}\n`;
  if (after !== before) fs.writeFileSync(abs, after);
  return {changed: after !== before, evidence_groups: groupSemanticEvidence(entries).length};
}
