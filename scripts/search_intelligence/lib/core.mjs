import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = process.cwd();
export const PUBLIC = path.resolve(ROOT, process.env.BHPC_PUBLIC_ROOT || 'site/public');
export const OK = 'OK';
export const DEGRADED = 'DEGRADED';
export const UNAVAILABLE = 'UNAVAILABLE';

export function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return fallback; }
}
export function writeJson(p, value) {
  const file = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export const stamp = () => new Date().toISOString();
export const id = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
export const sha256 = (s) => crypto.createHash('sha256').update(typeof s === 'string' ? s : JSON.stringify(s)).digest('hex');
export function routeToFile(route) {
  let r = String(route || '/').replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  if (r === '/' || !r) return 'index.html';
  if (r.endsWith('/')) return `${r.slice(1)}index.html`;
  return r.slice(1);
}
export function ownerMap() {
  const j = readJson('data/content_ownership_registry.json', { routes: [] });
  return new Map((j.routes || []).map((r) => [r.source_file, r]));
}
export function safePublicFile(route) {
  const rel = routeToFile(route);
  const p = path.resolve(PUBLIC, rel);
  if (!p.startsWith(path.resolve(PUBLIC) + path.sep)) throw new Error('route escapes public root');
  return { rel, path: p };
}
export function canonicalFromHtml(html, fallbackRoute = '/') {
  const m = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["'][^>]*>/i)
    || html.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']canonical["'][^>]*>/i);
  return m?.[1] || `https://billionairehighperformancecoach.com${fallbackRoute}`;
}
export function stripHtml(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
export function tokenize(s) {
  const stop = new Set(['with','from','that','this','what','when','where','which','your','about','into','using','used','best','system','should','would','could','have','does','need','ways','help','make','more','than','through','without','people','their']);
  return [...new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 3 && !stop.has(x)))];
}
export function providerOverall(states) {
  const vals = Object.values(states || {});
  if (vals.length && vals.every((x) => x === OK)) return OK;
  if (vals.some((x) => x === OK || x === DEGRADED)) return DEGRADED;
  return UNAVAILABLE;
}
