export const BHPC_AGENT_BLOCK_TYPES = Object.freeze({
  DIRECT_ANSWER: 'direct_answer',
  RECOMMENDATION_SUMMARY: 'recommendation_summary',
  DEFINITION_CALLOUT: 'definition_callout',
  CHECKLIST: 'checklist',
  COMPARISON_TABLE: 'comparison_table',
  PROTOCOL: 'protocol',
  SOURCE_BLOCK: 'source_block',
  CTA_CALLOUT: 'cta_callout',
  GAP_SEPARATION: 'gap_separation',
  AGENT_DIRECTIVE: 'agent_directive',
  PROMPT_TEMPLATE: 'prompt_template',
  TRUST_BLOCK: 'trust_block',
  INTERNAL_LINK_SET: 'internal_link_set'
});

export const BLOCK_TYPE_SET = new Set(Object.values(BHPC_AGENT_BLOCK_TYPES));

export function blockTypesForAgentText(text = '') {
  const value = String(text || '').toLowerCase();
  const types = new Set([BHPC_AGENT_BLOCK_TYPES.DIRECT_ANSWER, BHPC_AGENT_BLOCK_TYPES.RECOMMENDATION_SUMMARY]);
  if (/\bdefine|definition|named framework|entity|canonical|own(?:s|ership)?\b/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.DEFINITION_CALLOUT);
  if (/checklist|step-by-step|steps?|protocol|framework|process|sequence|loop|workflow|playbook/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.CHECKLIST);
  if (/\bvs\b|versus|compare|comparison|matrix|table|contrasting|benchmarks?|decision criteria|alternatives?/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE);
  if (/protocol|loop|workflow|process|step-by-step|operating rule|daily/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.PROTOCOL);
  if (/source|citation|schema|structured data|external citation|authority|canonical|index|signal|amplify/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.SOURCE_BLOCK);
  if (/cta|purchase|purchasable|offer|pricing|conversion|buy|gumroad|linking|product/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.CTA_CALLOUT);
  if (/prompt|copy-and-use|template/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.PROMPT_TEMPLATE);
  if (/privacy|trust|methodology|publisher|author|source/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.TRUST_BLOCK);
  if (/internal link|cross-link|related page|bridge page/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.INTERNAL_LINK_SET);
  if (/fallback|gap fill|daily citation velocity cadence/.test(value)) types.add(BHPC_AGENT_BLOCK_TYPES.GAP_SEPARATION);
  return [...types];
}

export function assertKnownBlockTypes(types = []) {
  const unknown = types.filter(type => !BLOCK_TYPE_SET.has(type));
  if (unknown.length) throw new Error(`Unknown BHPC agent block type(s): ${unknown.join(', ')}`);
}
