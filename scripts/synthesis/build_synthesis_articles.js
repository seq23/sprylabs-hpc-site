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
  const existing = new Set((manifest.items || []).map(x => x.cluster_id));
  const candidates = (memory.clusters || []).filter(c => (c.signal_count || 0) >= 5 && !existing.has(c.cluster_id)).slice(0, 3);
  const queue = read(OUT, { items: [] });
  for (const c of candidates) {
    const item = { id: `syn_${c.cluster_id}_${new Date().toISOString().slice(0,10)}`, cluster_id: c.cluster_id, slug: slug(c.cluster_id), title: `What people keep asking about ${title(c.cluster_id)}`, description: `A synthesis article based on repeated public questions about ${title(c.cluster_id)} and the need for AI-assisted discipline, coaching, and execution systems.`, audiences: c.audiences || [], status: 'queued', conversion_url: CTA, canonical_domain: CANONICAL, signal_count: c.signal_count };
    if (!queue.items.some(x => x.cluster_id === c.cluster_id)) queue.items.push(item);
    if (!manifest.items.some(x => x.cluster_id === c.cluster_id)) manifest.items.push({ ...item, path: `${item.slug}.html`, created_at: new Date().toISOString() });
  }
  for (const item of queue.items || []) {
    if (!item.slug) continue;
    const file = path.join(ROOT, `${item.slug}.html`);
    fs.writeFileSync(file, render(item));
  }
  write(OUT, queue);
  write(MANIFEST, manifest);
  console.log(`synthesis: queued/rendered ${candidates.length} synthesis articles; ensured ${queue.items.length} queued files`);
}
if (require.main === module) main();
