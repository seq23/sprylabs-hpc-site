const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set([
  '.git',
  '.build',
  '.validation-cache',
  '.validation-runtime',
  '_ops',
  'coverage',
  'node_modules',
  'playwright-report',
  'releases',
  'reports',
  'templates',
  'test-results',
  'validation_cache',
  'validation_runtime'
]);
const CHECK_EXTS = new Set(['.html', '.js', '.xml']);
const FORBIDDEN_COVERAGE_LITERALS = [
  '/coverage/',
  '/coverage/index.html',
  'https://billionairehighperformancecoach.com/coverage/index.html',
  'https://spryexecutiveos.com/coverage/index.html',
  'https://billionairehighperformancecoach.com/coverage/',
  'https://spryexecutiveos.com/coverage/'
];

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relPath = path.relative(ROOT, full).replace(/\\/g, '/');
    if (relPath.startsWith('data/report_fixes/agent_runs/')) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && CHECK_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function isExternal(url) {
  return /^https?:\/\//i.test(url) || url.startsWith('//') || url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('sms:') || url.startsWith('data:') || url.startsWith('javascript:');
}
function extractAttrs(html) {
  const out = [];
  const re = /<(a|link|script|img)\b[^>]*(href|src)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[3]);
  return out;
}
function extractIds(html) {
  const ids = new Set();
  const re = /\sid=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

const sourceFiles = walk(ROOT);
const htmlFiles = sourceFiles.filter(f => f.endsWith('.html'));
const routes = new Map();
function addRoute(route, file) { routes.set(route.replace(/\/+/g, '/'), file); }
for (const file of htmlFiles) {
  const r = rel(file);
  addRoute('/' + r, file);
  if (r === 'index.html') addRoute('/', file);
  if (r.endsWith('/index.html')) {
    const base = '/' + r.slice(0, -'/index.html'.length);
    addRoute(base, file);
    addRoute(base + '/', file);
  }
  if (r.endsWith('.html')) addRoute('/' + r.slice(0, -'.html'.length), file);
}

const htmlCache = new Map();
const idCache = new Map();
function read(file) {
  if (!htmlCache.has(file)) htmlCache.set(file, fs.readFileSync(file, 'utf8'));
  return htmlCache.get(file);
}
function idsFor(file) {
  if (!idCache.has(file)) idCache.set(file, extractIds(read(file)));
  return idCache.get(file);
}
function resolveTarget(fromFile, rawPathPart) {
  let route;
  const clean = (rawPathPart || '').split('?')[0];
  if (!clean) return fromFile;
  if (clean.startsWith('/')) route = clean;
  else {
    const abs = path.resolve(path.dirname(fromFile), clean);
    route = '/' + path.relative(ROOT, abs).replace(/\\/g, '/');
  }
  route = route.replace(/\/+/g, '/');
  const base = route.replace(/\/$/, '');
  const candidates = [route, base, base + '.html', base + '/index.html'];
  for (const c of candidates) {
    if (routes.has(c)) return routes.get(c);
    const asFile = path.join(ROOT, c.replace(/^\//, ''));
    if (fs.existsSync(asFile)) return asFile;
  }
  return null;
}

const issues = [];
for (const file of sourceFiles) {
  const content = read(file);
  for (const needle of FORBIDDEN_COVERAGE_LITERALS) if (content.includes(needle)) issues.push(`${rel(file)}: forbidden coverage literal ${needle}`);
}

let checked = 0;
for (const file of htmlFiles) {
  const html = read(file);
  const selfIds = idsFor(file);
  for (const rawUrl of extractAttrs(html)) {
    if (!rawUrl || isExternal(rawUrl)) continue;
    checked++;
    if (rawUrl.startsWith('#')) {
      const frag = rawUrl.slice(1);
      if (frag && !selfIds.has(frag)) issues.push(`${rel(file)}: missing self anchor ${rawUrl}`);
      continue;
    }
    const [pathPart, frag = ''] = rawUrl.split('#');
    const targetFile = resolveTarget(file, pathPart);
    if (!targetFile) {
      issues.push(`${rel(file)}: missing internal target ${rawUrl}`);
      continue;
    }
    if (frag && targetFile.endsWith('.html') && !idsFor(targetFile).has(frag)) issues.push(`${rel(file)}: missing anchor target ${rawUrl}`);
  }
}

if (issues.length) {
  console.error('validate_internal_links failed:');
  for (const issue of issues) console.error(' - ' + issue);
  process.exit(1);
}
console.log(`validate_internal_links: OK (${htmlFiles.length} html files checked, ${checked} href/src values checked)`);

process.exit(0);
