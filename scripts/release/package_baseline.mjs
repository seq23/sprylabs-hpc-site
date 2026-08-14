import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outDir = process.env.OUTPUT_DIR || '/mnt/data';
const contractPath = path.join(root, '_baseline_packaging_contract.json');
const manifestPath = path.join(root, '_artifact_validation_manifest.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const requiredFiles = Array.isArray(contract.required_files) ? contract.required_files : [];
const requiredExecutableFiles = Array.isArray(contract.required_executable_files) ? contract.required_executable_files : [];

const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) {
  console.error('Baseline packaging blocked: required files are missing:');
  for (const relativePath of missing) console.error(` - ${relativePath}`);
  process.exit(1);
}

const nonExecutable = requiredExecutableFiles.filter((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  return !fs.existsSync(absolutePath) || (fs.statSync(absolutePath).mode & 0o111) === 0;
});
if (nonExecutable.length) {
  console.error('Baseline packaging blocked: required executable files are not executable:');
  for (const relativePath of nonExecutable) console.error(` - ${relativePath}`);
  process.exit(1);
}

const hashes = {};
for (const relativePath of requiredFiles) {
  hashes[relativePath] = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(root, relativePath)))
    .digest('hex');
}
const modes = {};
for (const relativePath of requiredFiles) {
  modes[relativePath] = (fs.statSync(path.join(root, relativePath)).mode & 0o777).toString(8).padStart(3, '0');
}
const sourceFingerprint = crypto
  .createHash('sha256')
  .update(JSON.stringify({ hashes, modes }))
  .digest('hex');

let prior = {};
try {
  prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {}

const manifest = {
  schema_version: '1.0',
  generated_at: new Date().toISOString(),
  profile: prior.profile || 'packaging-only',
  source_tree_fingerprint: sourceFingerprint,
  critical_file_hashes: hashes,
  critical_file_modes: modes,
  artifact_zip_sha256: 'SEE_SIDECAR_SHA256',
  local_browser_validation: prior.local_browser_validation || 'NOT_EXECUTED',
  required_local_command: prior.required_local_command || 'npm run release:prepush:local',
  repair_note: prior.repair_note || 'Full baseline snapshot packaged from the repository root; local updater validation remains required.',
  container_validation: prior.container_validation || {
    packaging_required_files: 'PASSED',
    full_build: 'NOT_EXECUTED',
    browser_validation: 'NOT_EXECUTED',
    github_actions_validation: 'NOT_EXECUTED',
    local_validation_required: true
  }
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const short = sourceFingerprint.slice(0, 12);
const date = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: '2-digit',
  day: '2-digit',
  year: '2-digit'
}).format(new Date()).replaceAll('/', '-');
const name = `sprylabs-hpc-site-main_BASELINE_${date}_${short}.zip`;
const zip = path.join(outDir, name);
fs.rmSync(zip, { force: true });

const parent = path.dirname(root);
const base = path.basename(root);
const excluded = Array.isArray(contract.excluded_patterns) ? contract.excluded_patterns : [];
const zipExclusions = excluded.flatMap((pattern) => {
  const normalized = String(pattern).replace(/^\.\//, '');
  if (normalized.endsWith('/')) return [`${base}/${normalized}*`];
  return [`${base}/${normalized}`];
});
const zipArgs = ['-q', '-r', zip, base];
if (zipExclusions.length) zipArgs.push('-x', ...zipExclusions);
execFileSync('zip', zipArgs, { cwd: parent, stdio: 'inherit' });
execFileSync('unzip', ['-tqq', zip], { stdio: 'inherit' });

const zipHash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(`${zip}.sha256`, `${zipHash}  ${path.basename(zip)}\n`);
console.log(JSON.stringify({
  zip,
  sha256: zipHash,
  source_fingerprint: sourceFingerprint,
  required_files_checked: requiredFiles.length,
  required_executable_files_checked: requiredExecutableFiles.length,
  zip_integrity: 'PASS'
}, null, 2));
