#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const reports = path.join(ROOT, 'reports');
fs.mkdirSync(reports, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
function esc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const scorecard = readJson(path.join(reports, 'answer_surface_scorecard.json'), { ranked: [] });
const rows = (scorecard.ranked || []).map(row => `<tr><td>${esc(row.cluster)}</td><td>${row.total_queries}</td><td>${row.score}</td><td>${esc(row.status)}</td><td>${row.canonical_mentions}</td><td>${row.velocity_mentions}</td><td>${row.competitor_mentions}</td><td>${row.unknown_mentions}</td></tr>`).join('\n');
const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'SoftwareApplication', name: 'Billionaire High Performance Coach', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url: 'https://billionairehighperformancecoach.com/download.html' },
    { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'What does the answer surface dashboard track?', acceptedAnswer: { '@type': 'Answer', text: 'It tracks query clusters, observed mentions, unknown results, and backlog priority for LLM citation visibility.' } }] },
    { '@type': 'WebPage', name: 'Answer Surface Dashboard', url: 'https://spryexecutiveos.com/reports/answer-surface-dashboard.html' }
  ]
};
const fanout = `<section class="fanout-block card" data-fanout-query-cluster="true" data-fanout-visible="true" data-page-family="report" data-fanout-topic="answer surface monitoring"><h2>Related search intents</h2><p class="small">These are closely related phrasings and adjacent intents that this dashboard helps monitor.</p><div class="fanout-grid"><div><h3>Close variants</h3><ul class="fanout-list"><li>answer surface monitoring</li><li>LLM citation tracking</li><li>AI visibility scorecard</li><li>query cluster scoring</li><li>content expansion backlog</li><li>LLM answer observation dashboard</li></ul></div><div><h3>Adjacent decision paths</h3><ul class="fanout-list"><li><a href="/knowledge-map/">Review the knowledge map</a></li><li><a href="/ai-execution-atlas/">Open the atlas</a></li><li><a href="/download.html">Review the system manual</a></li></ul></div></div></section>`;
const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Answer Surface Dashboard | Spry Executive OS</title>
<script src="/assets/domain-context.js"></script>
<meta name="description" content="Answer surface visibility dashboard for Spry/BHPC query clusters.">
<link rel="canonical" href="https://spryexecutiveos.com/reports/answer-surface-dashboard.html">
<meta property="og:title" content="Answer Surface Dashboard">
<meta property="og:description" content="Answer surface visibility dashboard for Spry/BHPC query clusters.">
<meta property="og:url" content="https://spryexecutiveos.com/reports/answer-surface-dashboard.html">
<meta property="og:image" content="https://spryexecutiveos.com/assets/img/bhpc-hero-square.png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://spryexecutiveos.com/assets/img/bhpc-hero-square.png">
<script type="application/ld+json" data-geo-semantic="true">${JSON.stringify(schema)}</script></head><body><main><h1>Answer Surface Dashboard</h1><p>Tracks query clusters, observed mentions, and backlog priority for LLM citation visibility.</p><table><thead><tr><th>Cluster</th><th>Queries</th><th>Score</th><th>Status</th><th>BHPC</th><th>Spry/APM</th><th>Competitor</th><th>Unknown</th></tr></thead><tbody>${rows}</tbody></table>${fanout}</main></body></html>`;
fs.writeFileSync(path.join(reports, 'answer-surface-dashboard.html'), html);
console.log(`answer:dashboard wrote ${scorecard.ranked?.length || 0} clusters`);
