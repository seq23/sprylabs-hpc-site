import fs from 'node:fs';
import path from 'node:path';

const INTERNAL_HOSTS = new Set([
  'spryexecutiveos.com',
  'billionairehighperformancecoach.com'
]);

function normalizedHost(hostname = '') {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
}

function parseInternalUrl(value = '', base = 'https://spryexecutiveos.com') {
  const raw = String(value || '').trim();
  if (!raw || /^(?:javascript|data|mailto|tel):/i.test(raw)) return null;
  try {
    const url = new URL(raw, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!INTERNAL_HOSTS.has(normalizedHost(url.hostname))) return null;
    return url;
  } catch {
    return null;
  }
}

function pathFromUrl(url) {
  const pathname = url.pathname || '/';
  if (pathname === '/') return 'index.html';
  if (pathname.endsWith('/')) return `${pathname.replace(/^\/+/, '')}index.html`;
  return pathname.replace(/^\/+/, '');
}

function htmlDecode(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function textOnly(value = '') {
  return htmlDecode(String(value).replace(/<[^>]+>/g, ' '));
}

export function resolveBhpcInternalLinkAction(action = {}) {
  const from = parseInternalUrl(action.from_url || '');
  const to = parseInternalUrl(action.to_url || '');
  const anchorText = String(action.anchor_text || '').replace(/\s+/g, ' ').trim();
  if (!from) return {status: 'REJECTED', reason: 'invalid_or_non_internal_from_url', action};
  if (!to) return {status: 'REJECTED', reason: 'invalid_or_non_internal_to_url', action};
  if (!anchorText) return {status: 'REJECTED', reason: 'missing_anchor_text', action};
  const fromHost = normalizedHost(from.hostname);
  const toHost = normalizedHost(to.hostname);
  const suffix = `${to.pathname || '/'}${to.search || ''}${to.hash || ''}`;
  const href = fromHost === toHost ? suffix : to.href;
  const mutation = {
    status: 'RESOLVED',
    from_url: from.href,
    to_url: to.href,
    from_host: fromHost,
    to_host: toHost,
    from_path: pathFromUrl(from),
    target_path: pathFromUrl(to),
    href,
    anchor_text: anchorText,
    cross_domain: fromHost !== toHost
  };
  mutation.key = [mutation.from_host, mutation.from_path, mutation.to_url, mutation.anchor_text.toLowerCase()].join('::');
  return mutation;
}

export function compileBhpcInternalLinkMutations(entries = []) {
  const mutations = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const action of entry.required_internal_links || []) {
      const resolved = resolveBhpcInternalLinkAction(action);
      if (resolved.status !== 'RESOLVED') {
        rejected.push({record_id: entry.record_id || entry.id || '', ...resolved});
        continue;
      }
      if (seen.has(resolved.key)) continue;
      seen.add(resolved.key);
      mutations.push({record_id: entry.record_id || entry.id || '', acceptance_id: entry.id || '', ...resolved});
    }
  }
  return {mutations, rejected};
}

export function anchorPairs(html = '') {
  const pairs = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html)))) pairs.push({href: htmlDecode(match[1]), anchor_text: textOnly(match[2])});
  return pairs;
}

export function hasBhpcInternalLinkMutation(html = '', mutation = {}) {
  const wantedText = String(mutation.anchor_text || '').toLowerCase();
  return anchorPairs(html).some(pair => pair.href === mutation.href && pair.anchor_text.toLowerCase() === wantedText);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function managedSectionPattern(runDate = '') {
  const safe = String(runDate).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:\\r?\\n[\\t ]*)*<nav\\b[^>]*data-bhpc-agent-link-run=["']${safe}["'][\\s\\S]*?<\\/nav>(?:[\\t ]*\\r?\\n)*`, 'gi');
}

export function applyBhpcInternalLinkMutations({root = process.cwd(), entries = [], runDate = ''} = {}) {
  const compiled = compileBhpcInternalLinkMutations(entries);
  const errors = compiled.rejected.map(item => `${item.record_id || 'unknown'}:${item.reason}`);
  const groups = new Map();
  for (const mutation of compiled.mutations) {
    if (!groups.has(mutation.from_path)) groups.set(mutation.from_path, []);
    groups.get(mutation.from_path).push(mutation);
  }
  const applied = [];
  const satisfied = [];
  const touchedPaths = [];
  for (const [fromPath, mutations] of groups) {
    const abs = path.join(root, fromPath);
    if (!fs.existsSync(abs)) {
      for (const mutation of mutations) errors.push(`${mutation.record_id}:missing_internal_link_source:${fromPath}`);
      continue;
    }
    const before = fs.readFileSync(abs, 'utf8');
    const alreadyComplete = mutations.every(mutation => hasBhpcInternalLinkMutation(before, mutation));
    if (alreadyComplete) {
      satisfied.push(...mutations);
      continue;
    }
    let after = before.replace(managedSectionPattern(runDate), '\n');
    const missing = mutations.filter(mutation => !hasBhpcInternalLinkMutation(after, mutation));
    for (const mutation of mutations.filter(mutation => !missing.includes(mutation))) satisfied.push(mutation);
    if (missing.length) {
      const links = missing.map(mutation => `<li><a href="${escapeHtml(mutation.href)}" data-bhpc-agent-link-record="${escapeHtml(mutation.record_id)}">${escapeHtml(mutation.anchor_text)}</a></li>`).join('');
      const section = `<nav class="bhpc-agent-link-repair" data-bhpc-agent-link-repair="true" data-bhpc-agent-link-run="${escapeHtml(runDate)}" aria-label="Related Spry and BHPC guidance"><h2>Related guidance</h2><ul>${links}</ul></nav>`;
      if (/<\/body>/i.test(after)) after = after.replace(/\s*<\/body>/i, `\n${section}\n</body>`);
      else after = `${after.replace(/\s+$/, '')}\n${section}\n`;
      applied.push(...missing);
    }
    if (after !== before) {
      fs.writeFileSync(abs, after);
      touchedPaths.push(fromPath);
    }
  }
  for (const mutation of compiled.mutations) {
    const abs = path.join(root, mutation.from_path);
    if (!fs.existsSync(abs)) continue;
    if (!hasBhpcInternalLinkMutation(fs.readFileSync(abs, 'utf8'), mutation)) {
      errors.push(`${mutation.record_id}:internal_link_mutation_not_proven:${mutation.from_path}:${mutation.href}:${mutation.anchor_text}`);
    }
  }
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    run_date: runDate,
    status: errors.length ? 'FAIL' : 'PASS',
    mutation_count: compiled.mutations.length,
    applied_count: applied.length,
    already_satisfied_count: satisfied.length,
    rejected_count: compiled.rejected.length,
    touched_paths: [...new Set(touchedPaths)].sort(),
    mutations: compiled.mutations,
    rejected: compiled.rejected,
    errors
  };
}
