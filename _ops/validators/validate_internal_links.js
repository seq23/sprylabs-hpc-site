const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'templates', '_ops']);
const HTML_FILES = [];
const SOURCE_FILES = [];
const CHECK_EXTS = new Set(['.html', '.js', '.json', '.xml']);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !CHECK_EXTS.has(ext)) continue;
    SOURCE_FILES.push(full);
    if (ext === '.html') HTML_FILES.push(full);
  }
}
walk(ROOT);

const issues = [];

function extractIds(content) {
  const ids = new Set();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.add(m[1]);
  return ids;
}

function normalizeTargetPath(fromFile, rawPathPart) {
  let targetPath;
  if (rawPathPart === '') return fromFile;
  if (rawPathPart.startsWith('/')) targetPath = path.join(ROOT, rawPathPart.slice(1));
  else targetPath = path.resolve(path.dirname(fromFile), rawPathPart);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) return targetPath;
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    const indexPath = path.join(targetPath, 'index.html');
    if (fs.existsSync(indexPath)) return indexPath;
  }
  if (rawPathPart.endsWith('/')) {
    const indexPath = path.join(targetPath, 'index.html');
    if (fs.existsSync(indexPath)) return indexPath;
  }
  return targetPath;
}

function checkForbiddenCoverageLiterals(file, content) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const forbidden = [
    '/coverage/index.html',
    'https://billionairehighperformancecoach.com/coverage/index.html',
    'https://spryexecutiveos.com/coverage/index.html',
    'https://billionairehighperformancecoach.com/coverage/'
  ];
  for (const needle of forbidden) {
    if (content.includes(needle)) issues.push(`${rel}: forbidden coverage literal ${needle}`);
  }
}

for (const file of SOURCE_FILES) {
  const content = fs.readFileSync(file, 'utf8');
  checkForbiddenCoverageLiterals(file, content);
}

for (const file of HTML_FILES) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');
  const selfIds = extractIds(html);
  const regex = /<(a|link|script|img)\b[^>]*(href|src)="([^"]+)"/g;
  let m;

  while ((m = regex.exec(html)) !== null) {
    const url = m[3];
    if (!url) continue;
    if (/^https?:\/\//.test(url) || url.startsWith('mailto:') || url.startsWith('data:') || url.startsWith('javascript:')) continue;

    if (url.startsWith('#')) {
      const frag = url.slice(1);
      if (frag && !selfIds.has(frag)) issues.push(`${rel}: missing self anchor ${url}`);
      continue;
    }

    const parts = url.split('#');
    const pathPart = parts[0];
    const frag = parts[1] || '';
    const targetPath = normalizeTargetPath(file, pathPart);

    if (!fs.existsSync(targetPath)) {
      issues.push(`${rel}: missing internal target ${url}`);
      continue;
    }

    if (frag && targetPath.endsWith('.html')) {
      const ids = extractIds(fs.readFileSync(targetPath, 'utf8'));
      if (!ids.has(frag)) issues.push(`${rel}: missing anchor target ${url}`);
    }
  }
}

if (issues.length) {
  console.error('validate_internal_links failed:');
  for (const issue of issues) console.error(' - ' + issue);
  process.exit(1);
}
console.log(`validate_internal_links: OK (${HTML_FILES.length} html files checked)`);
