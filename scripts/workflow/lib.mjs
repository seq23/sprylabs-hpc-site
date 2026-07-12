import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = process.cwd();
const SKIP = new Set(['.git','node_modules','artifacts','reports','.build','coverage','test-results','playwright-report','.cache','.tmp','.validation-cache','.validation-runtime']);

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function workflowContracts() {
  const payload = readJson('data/workflows/workflow_contracts.json');
  return payload.governed_workflows || [];
}

export function workflowContract(id) {
  const contract = workflowContracts().find(item => item.id === id);
  if (!contract) throw new Error(`Unknown governed workflow: ${id}`);
  return contract;
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function listFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(absolute, out);
    else if (entry.isFile()) out.push(path.relative(ROOT, absolute).split(path.sep).join('/'));
  }
  return out;
}

export function globToRegExp(glob) {
  let source = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        source += '.*';
        i += 1;
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${source}$`);
}

export function matches(rel, patterns = []) {
  return patterns.some(pattern => globToRegExp(pattern).test(rel));
}

export function snapshot() {
  const result = new Map();
  for (const rel of listFiles()) {
    const body = fs.readFileSync(path.join(ROOT, rel));
    result.set(rel, {sha256: sha256(body), bytes: body.length});
  }
  return result;
}

export function selectedSnapshot(snapshotMap, patterns) {
  const records = [];
  for (const [file, meta] of snapshotMap.entries()) {
    if (matches(file, patterns)) records.push({file, ...meta});
  }
  return records.sort((a, b) => a.file.localeCompare(b.file));
}

export function changedFiles(before, after) {
  const files = new Set([...before.keys(), ...after.keys()]);
  const changed = [];
  for (const file of files) {
    const left = before.get(file);
    const right = after.get(file);
    if (!left && right) changed.push({file, change: 'ADDED', after: right});
    else if (left && !right) changed.push({file, change: 'DELETED', before: left});
    else if (left.sha256 !== right.sha256) changed.push({file, change: 'MODIFIED', before: left, after: right});
  }
  return changed.sort((a, b) => a.file.localeCompare(b.file));
}

export function writeJson(rel, payload) {
  const absolute = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`);
}

export function nowRunId() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;
}
