import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAgentLiveUrl } from '../lib/agent_live_url.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

function latestAbsorbedRunDate() {
  const base = path.join(ROOT, 'data/report_fixes/agent_runs');
  if (!fs.existsSync(base)) return '';
  return fs.readdirSync(base).sort().reverse().find(date => {
    const manifest = path.join(base, date, 'bhpc', 'agent_run_manifest.json');
    if (!fs.existsSync(manifest)) return false;
    try { return JSON.parse(fs.readFileSync(manifest, 'utf8')).status === 'ABSORBED'; }
    catch { return false; }
  }) || '';
}

export function loadAcceptanceManifest(runDate) {
  const date = runDate || latestAbsorbedRunDate();
  if (!date) throw new Error('No absorbed BHPC agent run found.');
  const manifestPath = path.join(ROOT, `data/report_fixes/agent_acceptance_manifests/${date}_bhpc.json`);
  if (!fs.existsSync(manifestPath)) throw new Error(`Acceptance manifest not found: ${manifestPath}`);
  return {date, manifestPath, manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))};
}

function extensionlessFallbackUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith('.html')) return '';
    parsed.pathname = parsed.pathname.slice(0, -'.html'.length);
    return parsed.toString();
  } catch {
    return '';
  }
}

async function fetchLivePage(url, fetchImpl) {
  const options = {
    redirect: 'follow',
    headers: {'cache-control': 'no-cache', 'user-agent': 'Spry-Live-Agent-Proof/1.0'}
  };
  const primary = await fetchImpl(url, options);
  if (primary.status !== 404) return {response: primary, effectiveUrl: url, fallbackUsed: false};

  const fallbackUrl = extensionlessFallbackUrl(url);
  if (!fallbackUrl) return {response: primary, effectiveUrl: url, fallbackUsed: false};

  const fallback = await fetchImpl(fallbackUrl, options);
  return {response: fallback, effectiveUrl: fallbackUrl, fallbackUsed: true};
}

export async function validateAgentLive({runDate = '', fetchImpl = fetch, quiet = false} = {}) {
  const {date, manifestPath, manifest} = loadAcceptanceManifest(runDate);
  const entries = (manifest.entries || []).filter(entry => entry.acceptance_status === 'REQUIRED');
  const failures = [];
  const resolved = [];
  const pages = new Map();

  for (const entry of entries) {
    const url = resolveAgentLiveUrl(entry);
    if (!url) {
      failures.push({id: entry.id, error: 'Unable to resolve public URL', implementation_path: entry.implementation_path || ''});
      continue;
    }
    resolved.push({id: entry.id, url});
    if (!pages.has(url)) pages.set(url, []);
    pages.get(url).push(entry);
  }

  let passed = 0;
  for (const [url, pageEntries] of pages) {
    try {
      const {response, effectiveUrl, fallbackUsed} = await fetchLivePage(url, fetchImpl);
      const html = await response.text();
      for (const entry of pageEntries) {
        const marker = `data-bhpc-agent-record="${entry.id}"`;
        if (!response.ok || !html.includes(marker)) {
          failures.push({id: entry.id, url: effectiveUrl, status: response.status, marker_found: html.includes(marker), fallback_used: fallbackUsed});
        } else {
          passed += 1;
          if (!quiet) console.log(`[validate:agent-live] PASS ${entry.id} ${effectiveUrl}${fallbackUsed ? ' (extensionless fallback)' : ''}`);
        }
      }
    } catch (error) {
      for (const entry of pageEntries) failures.push({id: entry.id, url, error: error instanceof Error ? error.message : String(error)});
    }
  }

  const report = {
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    run_date: date,
    manifest_path: path.relative(ROOT, manifestPath),
    records_checked: entries.length,
    pages_checked: pages.size,
    passed,
    failed: failures.length,
    resolved,
    failures
  };
  const out = path.join(ROOT, 'artifacts/validation/agent-live-attestation.json');
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

  console.log('\nLIVE AGENT PROOF SUMMARY');
  console.log(`Run date: ${date}`);
  console.log(`Records checked: ${entries.length}`);
  console.log(`Pages checked: ${pages.size}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failures.length}`);

  if (failures.length) {
    console.error('\nFAILURES');
    console.error(JSON.stringify(failures, null, 2));
    const error = new Error(`Agent live validation failed for ${failures.length} record(s).`);
    error.report = report;
    throw error;
  }
  console.log(`PASS: all ${date} required agent records are present in deployed HTML.`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateAgentLive({runDate: arg('--run-date')}).catch(() => process.exit(1));
}
