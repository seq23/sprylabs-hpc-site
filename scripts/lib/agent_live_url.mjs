import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { routeFor, hostFor } = require('./dual_domain_policy.cjs');
const KNOWN_HOSTS = new Set(['billionairehighperformancecoach.com', 'spryexecutiveos.com']);

function cleanRelative(value = '') {
  let rel = String(value || '').trim().replace(/^\/+/, '').replace(/\\/g, '/');
  rel = rel.replace(/^(?:billionairehighperformancecoach\.com|spryexecutiveos\.com)\//i, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) return '';
  return rel;
}

export function resolveAgentLiveUrl(entry = {}, publishedHostOverrides = new Map()) {
  const explicit = String(entry.intended_winner_page || '').trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      if (KNOWN_HOSTS.has(parsed.hostname)) return parsed.toString();
    } catch {
      // Fall through to implementation-path resolution.
    }
  }

  const rel = cleanRelative(entry.implementation_path || entry.intended_winner_path || '');
  if (!rel) return '';
  const route = routeFor(rel);
  return `${hostFor(route, publishedHostOverrides)}${route}`;
}
