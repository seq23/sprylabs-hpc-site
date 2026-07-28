import {slug, safeScope} from '../agent_intake/bhpc_agent_common.mjs';

function textFor(row = {}) {
  return [row.query, row.gap, row.fix_recommendation, row.primary_fix_type, row.action_tier, row.operation, row.recommended_page_type, row.seo_execution?.canonical_page_type]
    .map(value => String(value || ''))
    .join(' ')
    .toLowerCase();
}

export function classifyBhpcPageFamily(row = {}) {
  const operation = String(row.operation || '');
  const text = textFor(row);
  const scope = safeScope(row.scope || 'bhpc');
  if (operation === 'NO_ACTION_MAINTAIN') return 'no_action';
  if (operation === 'REPAIR_INTENDED_WINNER_PAGE' || row.intended_winner_path) return 'intended_winner_repair';
  const pageType = String(row.seo_execution?.canonical_page_type || row.recommended_page_type || '').toLowerCase();
  if (['comparison','alternatives','evaluation_framework'].includes(pageType)) return 'comparison_page';
  if (['faq','use_case'].includes(pageType)) return 'answer_page';
  if (['product_explanation','pricing_or_inclusions','privacy_or_trust','installation_guide','methodology'].includes(pageType)) return 'authority_insight';
  if (/fallback|gap fill|daily citation velocity cadence/.test(text)) return 'fallback_gap_fill';
  if (/\bvs\b|versus|compare|comparison|matrix|alternatives?|betterup|therapist|coach/.test(text)) return 'comparison_page';
  if (/\?|what is|how to|can i|should i|do i|when should|why does/.test(String(row.query || '').toLowerCase())) return 'answer_page';
  if (/authority|required|canonical|schema|source|citation|entity/.test(text)) return 'authority_insight';
  if (/cluster|synthesis|topic/.test(text)) return 'cluster_page';
  return `${scope}_insight`;
}

export function pathForBhpcPageFamily(row = {}) {
  const querySlug = slug(row.query || row.title || 'bhpc-agent-signal');
  const family = classifyBhpcPageFamily(row);
  if (family === 'intended_winner_repair' && row.intended_winner_path) return row.intended_winner_path;
  if (family === 'comparison_page') return `comparisons/${querySlug}.html`;
  if (family === 'answer_page') return `answers/${querySlug}.html`;
  if (family === 'cluster_page') return `clusters/${querySlug}.html`;
  if (family === 'fallback_gap_fill') return `insights/${querySlug}.html`;
  return `insights/${querySlug}.html`;
}
