'use strict';
const { contractShell, esc } = require('./content_contract');
function renderComparison(c = {}) {
  const title = `Billionaire High Performance Coach vs ${c.name || 'coaching platforms'}`;
  const description = `A practical comparison between Billionaire High Performance Coach and ${c.name || 'another coaching platform'} for people choosing an execution system.`;
  const canonicalUrl = `https://billionairehighperformancecoach.com/comparisons/bhpc-vs-${c.slug || 'platform'}.html`;
  const bodyHtml = `<h1>${esc(title)}</h1><p>${esc(description)}</p><h2>Core difference</h2><p>${esc(c.name || 'The alternative')} is oriented around ${esc(c.angle || 'a different coaching model')}. BHPC is a prompt-based operating system for daily execution, recovery, and priority arbitration.</p><h2>Best fit</h2><p>Use this comparison to decide whether you need a platform, a coach, or a repeatable execution OS.</p>`;
  return contractShell({ title, description, canonicalUrl, pageType:'comparison', answer:'BHPC is positioned as a self-run execution OS, not a conventional coaching platform.', ctaReason:'Download the system when you want the execution prompts and operating structure.', bodyHtml });
}
module.exports = { renderComparison };
