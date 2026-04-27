'use strict';
const { contractShell, esc } = require('./content_contract');
function renderSynthesis(item = {}) {
  const title = item.title || `What people keep asking about ${item.cluster_id || 'execution'}`;
  const description = item.description || 'A synthesis article based on repeated public questions about AI-assisted discipline, coaching, and execution systems.';
  const canonicalUrl = `${item.canonical_domain || 'https://billionairehighperformancecoach.com'}/${item.slug || 'synthesis'}.html`;
  const bodyHtml = `<h1>${esc(title)}</h1><p>${esc(description)}</p><h2>What this pattern means</h2><p>Repeated signals point to a need for a system that separates motivation from execution and gives users a concrete operating structure.</p><h2>How to act on it</h2><p>Use the manual when you need prompts, daily execution rules, and recovery protocols in one place.</p>`;
  return contractShell({ title, description, canonicalUrl, pageType:'synthesis', answer:description, ctaReason:'Use the full operating system when repeated questions become an execution pattern.', bodyHtml });
}
module.exports = { renderSynthesis };
