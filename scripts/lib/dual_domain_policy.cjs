'use strict';

// Canonical route ownership contract shared by repair and validation.
// Keep this policy path-based and idempotent; generated migrations must not
// rewrite route literals inside this file.

function routeFor(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) return `/${normalized.slice(0, -'/index.html'.length)}/`;
  return `/${normalized}`;
}

function hostFor(route, publishedHostOverrides = new Map()) {
  if (publishedHostOverrides.has(route)) return publishedHostOverrides.get(route);
  if (route === '/') return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/answers/phase4/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/use-cases/phase4/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/platforms/phase4/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/brand-defense/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/comparisons/bhpc-vs-')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/whitepapers/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/methods/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/glossary/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/vs/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/case-studies/')) return 'https://billionairehighperformancecoach.com';
  return 'https://spryexecutiveos.com';
}

module.exports = {routeFor, hostFor};
