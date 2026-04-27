'use strict';
const CTA_TARGET = 'https://aplayermode.com';
const DEFAULT_IMAGE = '/assets/books/og/bhpc-og-black.png';
function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function normalizeText(value, fallback) { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text || fallback; }
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
function contractShell({ title, description, canonicalUrl, imageUrl, bodyHtml, pageType, answer, ctaReason, structuredData } = {}) {
  const img = imageUrl || DEFAULT_IMAGE;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonicalUrl)}"><meta property="og:url" content="${esc(canonicalUrl)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article"><meta property="og:image" content="${esc(img)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(img)}"><script defer src="/assets/domain-context.js"></script>${structuredData || ''}</head><body><main data-content-contract="${esc(pageType || 'content')}">${directAnswerBlock({ answer, pageType })}${bodyHtml || ''}${ctaBlock({ reason: ctaReason })}</main></body></html>`;
}
module.exports = { CTA_TARGET, DEFAULT_IMAGE, ctaBlock, directAnswerBlock, ensureContract, contractShell, esc, normalizeText };
