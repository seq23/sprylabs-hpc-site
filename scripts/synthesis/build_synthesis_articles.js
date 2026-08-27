#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const MEMORY = path.join(ROOT, 'data/content_clusters/cluster_memory.json');
const OUT = path.join(ROOT, 'data/synthesis/queue.json');
const MANIFEST = path.join(ROOT, 'data/synthesis/manifest.json');
const CANONICAL = 'https://billionairehighperformancecoach.com';
const CTA = 'https://aplayermode.com';
const { renderSynthesis } = require('../render/render_synthesis');
const IMG = 'https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png';
function read(p, f) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } }
function write(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }
function title(id) { return String(id || '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); }
function esc(s) { return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function slug(id) { return `synthesis-${id}`; }
function render(item) { return renderSynthesis(item); }

function main() {
  const memory = read(MEMORY, { clusters: [] });
  const manifest = read(MANIFEST, { items: [] });
  const admission = read(path.join(ROOT, 'data/content/page_admission_registry.json'), { records: [] });
  const admittedPaths = new Set((admission.records || []).filter(x => x.status === 'ADMITTED').map(x => x.path));
  const allowCandidateRender = Boolean(process.env.PROGRAMMATIC_LANE || process.env.WORKFLOW_TRACE_RUN_ID || process.env.PROGRAMMATIC_RUN_ID);
  const existing = new Set((manifest.items || []).map(x => x.cluster_id));
  // A cluster is only renderable once it has a differentiation profile.
  //
  // social:collect and clusters:update run immediately before this step in
  // content:pipeline, so a cluster can be created, cross the signal threshold,
  // and be promoted inside a single run - before anyone has authored a profile
  // for it. render_synthesis then threw `Missing differentiation profile`, and
  // because the throw is not per-item it killed the whole content release: 36
  // profiled clusters did not ship because 1 unprofiled one was queued.
  //
  // Promotion now requires a profile. Clusters that are otherwise ready are
  // written to a backlog report instead of failing the run, so the missing
  // profiles are visible and authorable rather than a recurring red build.
  const profiles = read(path.join(ROOT, 'data/synthesis/differentiation_profiles.json'), { profiles: {} }).profiles || {};
  const hasProfile = (id) => Object.prototype.hasOwnProperty.call(profiles, id);
  const ready = (memory.clusters || []).filter(c => (c.signal_count || 0) >= 4 && !existing.has(c.cluster_id));
  const awaitingProfile = ready.filter(c => !hasProfile(c.cluster_id));
  if (awaitingProfile.length) {
    write(path.join(ROOT, 'reports/synthesis-clusters-awaiting-profile.json'), {
      generated_at: new Date().toISOString(),
      note: 'These clusters meet the signal threshold but have no entry in data/synthesis/differentiation_profiles.json, so they cannot be rendered. Author a profile to release them.',
      count: awaitingProfile.length,
      clusters: awaitingProfile.map(c => ({ cluster_id: c.cluster_id, signal_count: c.signal_count })),
    });
    console.warn(`[build:synthesis] ${awaitingProfile.length} cluster(s) awaiting a differentiation profile: ${awaitingProfile.map(c => c.cluster_id).join(', ')}`);
  }
  const candidates = ready.filter(c => hasProfile(c.cluster_id)).slice(0, 5);
  const queue = read(OUT, { items: [] });
  for (const c of candidates) {
    const item = { id: `syn_${c.cluster_id}_${new Date().toISOString().slice(0,10)}`, cluster_id: c.cluster_id, slug: slug(c.cluster_id), title: `What people keep asking about ${title(c.cluster_id)}`, description: `A synthesis article based on repeated public questions about ${title(c.cluster_id)} and the need for AI-assisted discipline, coaching, and execution systems.`, audiences: c.audiences || [], status: 'queued', conversion_url: CTA, canonical_domain: CANONICAL, signal_count: c.signal_count, signals: c.signals || [] };
    if (!queue.items.some(x => x.cluster_id === c.cluster_id)) queue.items.push(item);
    if (!manifest.items.some(x => x.cluster_id === c.cluster_id)) manifest.items.push({ ...item, path: `${item.slug}.html`, created_at: new Date().toISOString() });
  }
  let rendered = 0;
  let held = 0;
  for (const item of queue.items || []) {
    if (!item.slug) continue;
    const rel = `${item.slug}.html`;
    const file = path.join(ROOT, rel);
    const existingSourceTruth = fs.existsSync(file);
    if (!admittedPaths.has(rel) && !allowCandidateRender && !existingSourceTruth) {
      // Admission gates govern NEW candidate publication. Existing source-truth
      // synthesis URLs are deterministically rerendered from differentiation profiles.
      held += 1;
      continue;
    }
    fs.writeFileSync(file, render(item));
    rendered += 1;
  }
  write(OUT, queue);
  write(MANIFEST, manifest);
  console.log(`synthesis: queued=${candidates.length}; rendered=${rendered}; held_unadmitted=${held}; queue=${queue.items.length}`);
}
if (require.main === module) { main(); process.exit(0); }
