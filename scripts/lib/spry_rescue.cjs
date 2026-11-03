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
  // Specific intent wins before general AI/system vocabulary.
  const order = ['phone-vortex', 'structured-conversations', 'reset-cycle', 'scorecard', 'deep-work', 'coaching-at-scale', 'coaching-prompts'];
  for (const id of order) {
    const g = content.guides.find(g => g.id === id);
    if (g.tags.some(t => s.includes(t))) return HOST + g.route;
  }
  return HOST + content.guides.find(g => g.id === 'executive-os').route;
}
module.exports = { content, HOST, keepers, normalize, isRetiredRoute, isRetiredFile, targetFor };
