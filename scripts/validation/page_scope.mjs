#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export const ROOT = process.cwd();
export const DEFAULT_SCOPE_FILE = path.join(ROOT, 'artifacts/validation/changed-page-scope.json');
const PUBLIC_PREFIX = 'site/public/';

export function normalizeRel(value = '') {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}
export function normalizeRoute(value = '') {
  let v = String(value || '').trim();
  if (!v) return '';
  if (!v.startsWith('/')) v = `/${v}`;
  if (v === '/') return '/';
  if (v.endsWith('.html')) return v;
  return `${v.replace(/\/$/, '')}/`;
}
export function routeFromPath(value = '') {
  const rel = normalizeRel(value);
  if (!rel) return '';
  if (rel.endsWith('/index.html')) return normalizeRoute(`/${rel.slice(0, -'index.html'.length)}`);
  return normalizeRoute(`/${rel}`);
}
export function readJson(relOrAbs, fallback = null) {
  try {
    const fp = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return fallback;
  }
}
export function activeCitablePaths(root = ROOT) {
  const fp = path.join(root, 'data/citation/citable_pages.json');
  const payload = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return new Set((payload.pages || [])
    .filter(row => (row.status || 'ACTIVE') === 'ACTIVE' && row.path)
    .map(row => normalizeRel(row.path)));
}
export function mapChangedFilesToCitablePaths(changedFiles, citablePaths) {
  const out = new Set();
  for (const raw of changedFiles || []) {
    const file = normalizeRel(raw);
    const candidates = [file];
    if (file.startsWith(PUBLIC_PREFIX)) candidates.push(file.slice(PUBLIC_PREFIX.length));
    for (const rel of candidates) if (citablePaths.has(rel)) out.add(rel);
  }
  return out;
}
function gitLines(args, root = ROOT) {
  const text = execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  return text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}
function gitJsonAtHead(rel, root = ROOT) {
  try {
    const text = execFileSync('git', ['show', `HEAD:${rel}`], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function recordMap(payload, kind) {
  const map = new Map();
  if (!payload) return map;
  if (kind === 'citable') {
    for (const row of payload.pages || []) if (row?.path) map.set(normalizeRel(row.path), row);
  } else if (kind === 'query') {
    for (const row of payload.queries || []) if (row?.primary_page) {
      const key = `${normalizeRel(row.primary_page)}\u0000${String(row.query || row.id || '')}`;
      map.set(key, row);
    }
  } else if (kind === 'admission') {
    for (const row of [...(payload.pages || []), ...(payload.records || [])]) if (row?.path) map.set(normalizeRel(row.path), row);
  }
  return map;
}
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
}
function changedRegistryPaths(currentPayload, headPayload, kind) {
  const now = recordMap(currentPayload, kind);
  const before = recordMap(headPayload, kind);
  const impacted = new Set();
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const a = now.get(key), b = before.get(key);
    if (stable(a) === stable(b)) continue;
    if (kind === 'query') impacted.add(normalizeRel((a || b)?.primary_page));
    else impacted.add(normalizeRel((a || b)?.path || key));
  }
  impacted.delete('');
  return impacted;
}
function activeMutationRoutes(root = ROOT) {
  const fp = path.join(root, 'data/release/active_mutation_scope.json');
  if (!fs.existsSync(fp)) return null;
  const payload = readJson(fp, {routes: []}) || {routes: []};
  return new Set((payload.routes || []).map(normalizeRoute).filter(Boolean));
}
export function buildScope({changedFiles = [], citablePaths, registryImpacts = [], authorizedRoutes = null, source = 'fixture'}) {
  const paths = mapChangedFilesToCitablePaths(changedFiles, citablePaths);
  for (const rel of registryImpacts) if (citablePaths.has(normalizeRel(rel))) paths.add(normalizeRel(rel));
  const sortedPaths = [...paths].sort();
  const routes = sortedPaths.map(routeFromPath);
  const repairPaths = authorizedRoutes === null
    ? sortedPaths
    : sortedPaths.filter(rel => authorizedRoutes.has(routeFromPath(rel)));
  return {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    status: 'READY',
    mode: 'changed',
    source,
    changed_files: [...new Set(changedFiles.map(normalizeRel))].sort(),
    paths: sortedPaths,
    routes,
    repair_paths: repairPaths,
    repair_routes: repairPaths.map(routeFromPath),
    active_mutation_scope_present: authorizedRoutes !== null,
    authorized_routes: authorizedRoutes === null ? [] : [...authorizedRoutes].sort(),
    unrepairable_changed_paths: sortedPaths.filter(rel => !repairPaths.includes(rel))
  };
}
export function captureChangedPageScope({root = ROOT, output = DEFAULT_SCOPE_FILE} = {}) {
  const citablePaths = activeCitablePaths(root);
  const authorizedRoutes = activeMutationRoutes(root);
  let changedFiles = [];
  let source = '';
  let gitAvailable = false;
  try {
    const inside = gitLines(['rev-parse', '--is-inside-work-tree'], root)[0] === 'true';
    if (inside) {
      gitAvailable = true;
      changedFiles = [...new Set([
        ...gitLines(['diff', '--name-only', '--diff-filter=ACMRTUXBD', 'HEAD', '--'], root),
        ...gitLines(['ls-files', '--others', '--exclude-standard'], root)
      ])];
      source = 'git-diff-head';
    }
  } catch {}

  const registryImpacts = new Set();
  if (gitAvailable) {
    const registrySpecs = [
      ['data/citation/citable_pages.json', 'citable'],
      ['data/citation/query_registry.json', 'query'],
      ['data/content/page_admission_registry.json', 'admission']
    ];
    for (const [rel, kind] of registrySpecs) {
      if (!changedFiles.includes(rel)) continue;
      const current = readJson(path.join(root, rel), null);
      const head = gitJsonAtHead(rel, root);
      for (const p of changedRegistryPaths(current, head, kind)) registryImpacts.add(p);
    }
  } else if (authorizedRoutes !== null) {
    const byRoute = new Map([...citablePaths].map(rel => [routeFromPath(rel), rel]));
    for (const route of authorizedRoutes) if (byRoute.has(route)) registryImpacts.add(byRoute.get(route));
    source = 'active-mutation-scope-fallback';
  }

  if (!gitAvailable && authorizedRoutes === null) {
    const payload = {
      schema_version: '1.0', generated_at: new Date().toISOString(), status: 'UNAVAILABLE', mode: 'changed',
      source: 'none', reason: 'changed-page validation requires a Git worktree or data/release/active_mutation_scope.json',
      changed_files: [], paths: [], routes: [], repair_paths: [], repair_routes: [], active_mutation_scope_present: false,
      authorized_routes: [], unrepairable_changed_paths: []
    };
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }

  const payload = buildScope({changedFiles, citablePaths, registryImpacts, authorizedRoutes, source});
  payload.git_available = gitAvailable;
  payload.registry_impacted_paths = [...registryImpacts].sort();
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
export function readCapturedScope(scopeFile = process.env.VALIDATION_PAGE_SCOPE_FILE || DEFAULT_SCOPE_FILE) {
  const payload = readJson(scopeFile, null);
  if (!payload || payload.status !== 'READY') throw new Error(`changed-page scope unavailable: ${scopeFile}`);
  return payload;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outArg = process.argv.find(x => x.startsWith('--output='));
  const output = outArg ? path.resolve(outArg.slice('--output='.length)) : DEFAULT_SCOPE_FILE;
  const payload = captureChangedPageScope({output});
  console.log(`[validation:page-scope] ${payload.status}: source=${payload.source}; changed_files=${payload.changed_files.length}; pages=${payload.paths.length}; repairable=${payload.repair_paths.length}`);
  if (payload.status !== 'READY') process.exit(2);
}
