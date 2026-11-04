'use strict';
// Finite publishing policy: new topic variants cannot silently recreate the
// retired surface. Source HTML stays available for editorial consolidation.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const content = JSON.parse(fs.readFileSync(path.join(root, 'data/seo/spry_rescue_guides.json')));
const HOST = 'https://spryexecutiveos.com';
const keepers = new Set([...content.guides.map(g => g.route), '/knowledge-map/', '/about']);
const { routeFor, hostFor } = require('./dual_domain_policy.cjs');
const normalize = r => '/' + String(r).replace(/^\/+/, '').replace(/\/index\.html$/, '/').replace(/\.html$/, '');
function isRetiredRoute(route) {
  if (/^\/(?:admin|agency|api|cdn-cgi|404)(?:\/|$)/.test(route)) return false;
  return hostFor(route) === HOST && !keepers.has(route);
}
function isRetiredFile(rel) {
  return rel.endsWith('.html') && isRetiredRoute(routeFor(rel));
}
function targetFor(route) {
  const s = route.toLowerCase();
  if (/^\/(?:author|about|citation-methodology)(?:\/|$)/.test(s)) return HOST + '/about';
  // Prefer a retained article with shared intent words before a broad family.
  // This sends synthetic variants back to their substantive original guide.
  const ignored = new Set(['a','an','the','and','or','of','to','for','in','on','with','without','how','what','is','are','i','my','your','you','it','can','do','be','s','spry','executive','os','bhpc','agent','insights','answers','guides','topics','use','system']);
  const words = value => new Set(value.split(/[^a-z0-9]+/).filter(w => w.length > 1 && !ignored.has(w)));
  const input = words(s);
  const matches = content.guides.map(g => {
    const terms = words(g.route);
    const shared = [...terms].filter(t => input.has(t)).length;
    return { g, shared, score: shared / Math.max(terms.size, input.size, 1) };
  }).filter(m => m.shared >= 2).sort((a,b) => b.score - a.score || b.shared - a.shared || a.g.route.localeCompare(b.g.route));
  if (matches[0]?.score >= 0.3) return HOST + matches[0].g.route;
  // Specific intent wins before general AI/system vocabulary.
  const order = ['phone-vortex', 'structured-conversations', 'reset-cycle', 'scorecard', 'deep-work', 'coaching-at-scale', 'coaching-prompts'];
  for (const id of order) {
    const g = content.guides.find(g => g.id === id);
    if (g.tags.some(t => s.includes(t))) return HOST + g.route;
  }
  return HOST + content.guides.find(g => g.id === 'executive-os').route;
}
module.exports = { content, HOST, keepers, normalize, isRetiredRoute, isRetiredFile, targetFor };
