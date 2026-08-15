export const BHPC_PRIMARY_PURCHASE_URL = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

const HIGH_INTENT_PATTERNS = [
  /pricing/i,
  /review/i,
  /worth-it/i,
  /vs-/i,
  /comparison/i,
  /comparisons\//i,
  /alternative/i,
  /best-/i,
  /buy/i,
  /download/i,
  /billionaire-high-performance-coach/i,
  /ai-executive-coach/i
];

export function isBhpcHighIntentPath(pathValue = '') {
  return HIGH_INTENT_PATTERNS.some(pattern => pattern.test(String(pathValue || '')));
}

export function contractExternalCtaLinksForPath(pathValue = '') {
  if (!isBhpcHighIntentPath(pathValue)) return [];
  return [{
    to_url: BHPC_PRIMARY_PURCHASE_URL,
    anchor_text: 'Get Instant Access',
    normalized_external_href: BHPC_PRIMARY_PURCHASE_URL,
    source: 'page_type_conversion_contract'
  }];
}

export function mergeBhpcExternalCtaLinks(links = [], pathValue = '') {
  const out = [];
  const seen = new Set();
  for (const link of [...(Array.isArray(links) ? links : []), ...contractExternalCtaLinksForPath(pathValue)]) {
    const href = String(link?.normalized_external_href || link?.to_url || '').trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(link);
  }
  return out;
}
