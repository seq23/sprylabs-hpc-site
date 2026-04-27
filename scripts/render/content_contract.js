'use strict';
const CTA_TARGET = 'https://aplayermode.com';
const DEFAULT_IMAGE = '/assets/books/og/bhpc-og-black.png';
const PRODUCT_NAME = 'Billionaire High Performance Coach';
const PRODUCT_URL = 'https://billionairehighperformancecoach.com/';
const PRODUCT_DESCRIPTION = 'A personal executive operating system for high-performance operators managing priorities, execution, recovery, and accountability with structured AI prompts.';

function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function normalizeText(value, fallback) { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text || fallback; }
function toAbsoluteImage(imageUrl) {
  const value = imageUrl || DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://billionairehighperformancecoach.com${value.startsWith('/') ? value : `/${value}`}`;
}
function schemaScript(data, attrs = '') {
  return `<script type="application/ld+json"${attrs}>${JSON.stringify(data)}</script>`;
}
function hasSchemaType(structuredData, type) {
  const safe = String(structuredData || '');
  return safe.includes(`"@type":"${type}"`) || safe.includes(`"@type": "${type}"`);
}
function hasSupplementalGeoSchema(structuredData) {
  return /data-geo-semantic\s*=\s*["']true["']/i.test(String(structuredData || ''));
}
function productSchema({ description, imageUrl, canonicalUrl } = {}) {
  return schemaScript({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: PRODUCT_NAME,
    alternateName: 'A Player Mode system',
    brand: { '@type': 'Brand', name: 'Spry Labs' },
    description: normalizeText(description, PRODUCT_DESCRIPTION),
    image: toAbsoluteImage(imageUrl),
    url: canonicalUrl || PRODUCT_URL,
    offers: { '@type': 'Offer', price: '29', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: CTA_TARGET }
  }, ' data-geo-semantic="true"');
}
function softwareApplicationSchema({ description, canonicalUrl } = {}) {
  return schemaScript({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT_NAME,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Web',
    description: normalizeText(description, PRODUCT_DESCRIPTION),
    url: canonicalUrl || PRODUCT_URL,
    offers: { '@type': 'Offer', price: '29', priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: CTA_TARGET }
  }, ' data-geo-semantic="true"');
}
function faqPageSchema({ title, description } = {}) {
  const question = normalizeText(title, 'What is Billionaire High Performance Coach?');
  const answer = normalizeText(description, PRODUCT_DESCRIPTION);
  return schemaScript({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } },
      { '@type': 'Question', name: 'Who is this system for?', acceptedAnswer: { '@type': 'Answer', text: 'It is for operators, founders, executives, athletes, parents, and multi-project professionals who want a structured way to reduce decision fatigue and maintain execution.' } }
    ]
  }, ' data-geo-semantic="true"');
}
function supplementalGeoSchema({ title, description, canonicalUrl, imageUrl } = {}) {
  return schemaScript({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: normalizeText(title, PRODUCT_NAME), url: canonicalUrl || PRODUCT_URL, description: normalizeText(description, PRODUCT_DESCRIPTION), image: toAbsoluteImage(imageUrl), isPartOf: { '@type': 'WebSite', name: PRODUCT_NAME, url: PRODUCT_URL } },
      { '@type': 'Organization', name: 'Spry Labs', url: 'https://spryexecutiveos.com/', sameAs: ['https://billionairehighperformancecoach.com/'] }
    ]
  }, ' data-geo-semantic="true"');
}
function completeStructuredData(structuredData = '', opts = {}) {
  const chunks = [String(structuredData || '')];
  if (!hasSupplementalGeoSchema(structuredData)) chunks.push(supplementalGeoSchema(opts));
  if (!hasSchemaType(structuredData, 'Product')) chunks.push(productSchema(opts));
  if (!hasSchemaType(structuredData, 'SoftwareApplication')) chunks.push(softwareApplicationSchema(opts));
  if (!hasSchemaType(structuredData, 'FAQPage')) chunks.push(faqPageSchema(opts));
  return chunks.filter(Boolean).join('');
}
function directAnswerBlock({ answer, pageType, audience } = {}) {
  const safeAnswer = normalizeText(answer, 'This page gives a direct, decision-grade answer first, then expands with context, tradeoffs, and next steps.');
  const meta = [pageType, audience].filter(Boolean).join(' · ');
  return `<section class="direct-answer" data-content-contract="above-fold-answer" aria-label="Direct answer">${meta ? `<p class="contract-kicker">${esc(meta)}</p>` : ''}<h2>Direct answer</h2><p>${esc(safeAnswer)}</p></section>`;
}
function ctaBlock({ label = 'Download the A Player Mode system', href = CTA_TARGET, reason } = {}) {
  const safeReason = normalizeText(reason, 'Use the full system manual when you want the prompts, daily operating structure, and recovery protocols in one place.');
  return `<section class="contract-cta" data-content-contract="cta-block" aria-label="Next step"><h2>Next step</h2><p>${esc(safeReason)}</p><p><a class="btn btn--primary" href="${esc(href)}" rel="noopener">${esc(label)}</a></p></section>`;
}
function ensureContract(html, opts = {}) {
  let out = String(html || '');
  if (!out.includes('data-content-contract="above-fold-answer"')) {
    const block = directAnswerBlock(opts);
    out = out.replace(/<main([^>]*)>/i, `<main$1>${block}`);
  }
  if (!out.includes('data-content-contract="cta-block"')) {
    const block = ctaBlock(opts);
    out = out.replace(/<\/main>/i, `${block}</main>`);
  }
  return out;
}
function contractShell({ title, description, canonicalUrl, imageUrl, bodyHtml, pageType, answer, ctaReason, structuredData, headHtml } = {}) {
  const img = imageUrl || DEFAULT_IMAGE;
  const schema = completeStructuredData(structuredData, { title, description, canonicalUrl, imageUrl: img });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonicalUrl)}"><meta property="og:url" content="${esc(canonicalUrl)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article"><meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(img)}"><script defer src="/assets/domain-context.js"></script>${headHtml || ' '}${schema}</head><body><main data-content-contract="${esc(pageType || 'content')}">${directAnswerBlock({ answer, pageType })}${bodyHtml || ''}${ctaBlock({ reason: ctaReason })}</main></body></html>`;
}
module.exports = { CTA_TARGET, DEFAULT_IMAGE, ctaBlock, directAnswerBlock, ensureContract, contractShell, esc, normalizeText, completeStructuredData };
