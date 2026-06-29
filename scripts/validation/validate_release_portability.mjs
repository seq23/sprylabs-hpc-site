import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJson, fail, pass, writeSummary } from './common.mjs';

const errors = [];
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const updateContract = readJson('_repo_update_contract.json');
const browserContract = readJson('_browser_suite_contract.json').browser_suite;
const gitignoreText = fs.readFileSync('.gitignore', 'utf8');
const requiredIgnorePatterns = [
  'node_modules/',
  'artifacts/diagnostics/',
  'test-results/',
  'playwright-report/',
  'logs/',
  '.auth/',
  '.cache/',
  '.tmp/',
  '.runtime-data/',
  '.DS_Store',
  '.env',
  '.env.*',
];
for (const pattern of requiredIgnorePatterns) {
  const present = gitignoreText.split(/\r?\n/).some(line => line.trim() === pattern);
  if (!present) errors.push(`.gitignore missing required local-output exclusion: ${pattern}`);
}

const lockText = fs.readFileSync('package-lock.json', 'utf8');
for (const forbidden of ['packages.applied-caas-gateway1.internal.api.openai.org', 'artifactory/api/npm', 'openai.org/artifactory']) {
  if (lockText.includes(forbidden)) errors.push(`package-lock contains forbidden internal registry reference: ${forbidden}`);
}
const resolvedUrls = [...lockText.matchAll(/"resolved"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
for (const url of resolvedUrls) if (!url.startsWith('https://registry.npmjs.org/')) errors.push(`non-public npm resolved URL: ${url}`);

if (!/^>=24(?:\.0(?:\.0)?)?$/.test(String(packageJson.engines?.node || ''))) errors.push('package.json engines.node must require Node 24 or newer');
if (fs.readFileSync('.nvmrc', 'utf8').trim() !== '24') errors.push('.nvmrc must be 24');
if (String(updateContract.node_version) !== '24') errors.push('_repo_update_contract node_version must be 24');

const expectedCommands = {
  prepush: 'npm run release:prepush',
  prepush_local: 'npm run release:prepush:local',
  postpush: 'npm run release:postpush',
  live_proof: 'NOT_APPLICABLE',
  cleanup: 'NOT_APPLICABLE',
};
if (!updateContract.commands || typeof updateContract.commands !== 'object') errors.push('_repo_update_contract.commands is missing');
else for (const [key, value] of Object.entries(expectedCommands)) if (updateContract.commands[key] !== value) errors.push(`_repo_update_contract.commands.${key} mismatch`);

for (const required of [
  'scripts/_vendor/bs4/__init__.py',
  'scripts/_vendor/soupsieve/__init__.py',
  'scripts/_vendor/typing_extensions.py',
  'scripts/_vendor/VENDOR_MANIFEST.sha256',
]) if (!fs.existsSync(required)) errors.push(`vendored Python dependency missing: ${required}`);

try {
  execFileSync('python3', ['-S', '-c', "import sys;sys.path.insert(0,'scripts/_vendor');import bs4,soupsieve,typing_extensions"], { stdio: 'pipe', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
} catch (error) {
  errors.push(`vendored Python import failed with site-packages disabled: ${String(error.stderr || error.message).trim()}`);
}
for (const script of ['scripts/citation/apply_citation_program.py', 'scripts/validation/validate_citation_contract.py', 'scripts/validation/validate_priority_citation_pages.py', 'scripts/validation/validate_agent_recommendations.py', 'scripts/validation/validate_manual_expansion.py']) {
  const firstTwo = fs.readFileSync(script, 'utf8').split(/\r?\n/).slice(0, 2).join('\n');
  if (!/coding:\s*utf-8/i.test(firstTwo)) errors.push(`${script}: explicit UTF-8 declaration missing`);
}

const configText = fs.readFileSync('playwright.config.mjs', 'utf8');
if (!/video:\s*'off'/.test(configText)) errors.push('Playwright video must be off; FFmpeg is not a required dependency for this smoke suite');
if (!/maxFailures:\s*1/.test(configText)) errors.push('Playwright maxFailures must be 1');
if (browserContract.critical_route_count !== 12) errors.push(`browser critical route count must be 12, found ${browserContract.critical_route_count}`);
if (browserContract.expected_collected_policy !== 'critical_route_count_x_2') errors.push('browser expected count policy must be critical_route_count_x_2');
if ((browserContract.evidence_outputs || []).includes('videos')) errors.push('browser evidence contract must not require videos');


if (!fs.existsSync('favicon.ico') || fs.statSync('favicon.ico').size === 0) errors.push('root favicon.ico is missing or empty; Chromium requests it automatically and a 404 fails the browser suite');
const staticServerText = fs.readFileSync('scripts/browser/static_server.mjs', 'utf8');
if (!staticServerText.includes("'.ico':'image/x-icon'")) errors.push('static server must serve .ico as image/x-icon');

const criticalRoutes = readJson('_critical_browser_route_manifest.json').routes || [];
const missingLocalResources = [];
for (const route of criticalRoutes) {
  const source = route.source_file;
  if (!fs.existsSync(source)) {
    missingLocalResources.push(`${source}: source file missing`);
    continue;
  }
  const html = fs.readFileSync(source, 'utf8');
  for (const match of html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)) {
    const value = match[1].split(/[?#]/)[0];
    if (!value || /^(?:https?:|data:|mailto:|tel:|javascript:|#)/i.test(value)) continue;
    const candidate = value.startsWith('/')
      ? path.join('.', value.replace(/^\/+/, ''))
      : path.join(path.dirname(source), value);
    if (!fs.existsSync(candidate)) missingLocalResources.push(`${source}: ${value}`);
  }
}
if (missingLocalResources.length) errors.push(`critical browser routes reference missing local resources: ${missingLocalResources.slice(0, 20).join(', ')}`);


const cloudflareMaxAssetBytes = 25 * 1024 * 1024;
const deployLargeFiles = [];
function walkDeployAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Cloudflare Pages validates the configured output directory exactly as cloned.
    // This project deploys from repository root with no build command, so reports,
    // fixtures, artifacts, and other repo-owned files are deployable assets too.
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDeployAssets(full);
    else if (entry.isFile()) {
      const size = fs.statSync(full).size;
      if (size > cloudflareMaxAssetBytes) deployLargeFiles.push(`${full.replace(/^\.\//,'')}: ${Math.round(size/1024/1024*10)/10} MiB`);
    }
  }
}
walkDeployAssets('.');
if (deployLargeFiles.length) errors.push(`Cloudflare Pages asset limit exceeded by root-deployed file(s): ${deployLargeFiles.slice(0,10).join(', ')}`);

const forbiddenSource = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'artifacts', 'test-results', 'playwright-report'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') forbiddenSource.push(full);
      else walk(full);
    } else if (entry.name.endsWith('.pyc')) forbiddenSource.push(full);
  }
}
walk('.');
if (forbiddenSource.length) errors.push(`Python cache artifacts present: ${forbiddenSource.slice(0, 10).join(', ')}`);

for (const required of [
  '_critical_browser_route_manifest.json',
  'data/citation/priority_page_acceptance.json',
  'scripts/validation/validate_priority_citation_pages.py',
  'scripts/validation/validate_release_portability.mjs',
  'data/citation/agent_page_specs.json',
  'data/citation/agent_recommendation_acceptance.json',
  'scripts/validation/validate_agent_recommendations.py',
  'favicon.ico',
  'data/content/manual_expansion_pages.json',
  'data/content/manual_redirects.json',
  'data/search/semrush_manual_expansion.json',
  'data/citation/manual_expansion_acceptance.json',
  'data/citation/programmatic_page_admission_contract.json',
  'data/citation/health_adjacent_content_contract.json',
  'scripts/content/build_manual_expansion_pages.mjs',
  'scripts/validation/validate_manual_expansion.py',
  '_redirects',
]) if (!fs.existsSync(required)) errors.push(`release-critical file missing: ${required}`);

writeSummary('validate-release-portability', {
  status: errors.length ? 'FAIL' : 'PASS',
  resolved_package_urls: resolvedUrls.length,
  browser_checks: browserContract.critical_route_count * browserContract.projects.length,
  errors,
});
if (errors.length) fail(`[validate:release-portability] FAIL: ${errors.length} issue(s)`, errors);
pass(`[validate:release-portability] OK: public lockfile, self-contained Python, packaged favicon, resolvable browser assets, 24-test browser budget, no FFmpeg dependency`);
