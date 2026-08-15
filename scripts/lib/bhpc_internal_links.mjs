const INTERNAL_HOSTS = new Set([
  'spryexecutiveos.com',
  'billionairehighperformancecoach.com'
]);

const APPROVED_EXTERNAL_CTA_HOSTS = new Set([
  'sprylabs.gumroad.com',
  'aplayermode.com'
]);

function normalizedHost(hostname = '') {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function parseHttpUrl(value = '', base = 'https://spryexecutiveos.com') {
  const raw = String(value || '').trim();
  if (!raw || /^(?:javascript|data|mailto|tel):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function normalizeBhpcInternalLinkHref(value = '') {
  const url = parseHttpUrl(value);
  if (!url) return '';
  const host = normalizedHost(url.hostname);
  if (!INTERNAL_HOSTS.has(host)) return '';
  return `${url.pathname || '/'}${url.search || ''}${url.hash || ''}`;
}

export function normalizeBhpcExternalCtaHref(value = '') {
  const url = parseHttpUrl(value);
  if (!url) return '';
  const host = normalizedHost(url.hostname);
  if (!APPROVED_EXTERNAL_CTA_HOSTS.has(host)) return '';
  return url.href;
}

export function partitionBhpcInternalLinkActions(actions = []) {
  const internal = [];
  const external_ctas = [];
  const rejected = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    const target = action?.to_url || '';
    const internalHref = normalizeBhpcInternalLinkHref(target);
    if (internalHref) {
      internal.push({...action, normalized_internal_href: internalHref});
      continue;
    }
    const externalHref = normalizeBhpcExternalCtaHref(target);
    if (externalHref) {
      external_ctas.push({...action, normalized_external_href: externalHref});
      continue;
    }
    if (action?.to_url || action?.anchor_text) rejected.push(action);
  }
  return {internal, external_ctas, rejected};
}

export function isBhpcInternalLink(value = '') {
  return Boolean(normalizeBhpcInternalLinkHref(value));
}
