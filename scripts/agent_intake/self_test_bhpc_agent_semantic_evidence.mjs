#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  groupSemanticEvidence,
  normalizeSemanticText,
  renderSemanticEvidence,
  semanticEvidenceKey
} from './bhpc_agent_semantic_evidence.mjs';

const base = {
  run_date: '2026-08-01',
  scope: 'bhpc',
  implementation_path: 'insights/example.html',
  operation: 'REPAIR_INTENDED_WINNER_PAGE',
  required_block_types: ['direct_answer']
};

const first = {
  ...base,
  id: 'record-001',
  record_id: 'record-001',
  query: 'How do I build a realistic morning routine?',
  required_heading: 'A realistic morning routine',
  source_fix_instruction: 'Add a minimum viable routine.',
  required_strings: ['How do I build a realistic morning routine?', 'A realistic morning routine']
};
const duplicate = {...first, id: 'record-002', record_id: 'record-002'};
const distinct = {
  ...base,
  id: 'record-003',
  record_id: 'record-003',
  query: 'How do I recover after an interrupted morning?',
  required_heading: 'Recovery after interruption',
  source_fix_instruction: 'Add an interruption recovery protocol.',
  required_strings: ['How do I recover after an interrupted morning?', 'Recovery after interruption'],
  required_block_types: ['protocol']
};

assert.equal(semanticEvidenceKey(first), semanticEvidenceKey(duplicate));
assert.notEqual(semanticEvidenceKey(first), semanticEvidenceKey(distinct));

const groups = groupSemanticEvidence([first, duplicate, distinct]);
assert.equal(groups.length, 2, 'exact duplicates consolidate while distinct requirements remain');
assert.deepEqual(groups[0].record_ids, ['record-001', 'record-002']);

const html = renderSemanticEvidence([first, duplicate, distinct]);
assert.match(html, /data-bhpc-agent-record="record-001"/);
assert.match(html, /data-bhpc-agent-record="record-002"/);
assert.match(html, /data-bhpc-agent-record="record-003"/);
assert.match(normalizeSemanticText(html), /realistic morning routine/);
assert.match(normalizeSemanticText(html), /recovery after interruption/);
assert.equal((html.match(/bhpc-agent-record-evidence/g) || []).length, 2);

const rerendered = renderSemanticEvidence([first, duplicate, distinct]);
assert.equal(html, rerendered, 'rendering is byte deterministic');

console.log('[bhpc-agent-semantic-evidence:self-test] PASS: duplicate consolidation, distinct record proof, visible strings, and deterministic rendering');
