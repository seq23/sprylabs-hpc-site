#!/usr/bin/env node
// validate:retired-route-references (restored 10 Nov 2026, hostile review: the edge loop only).
// Folded pages (served_by "edge") are answered by functions/_lib/host_consolidation.js, because
// Pages' static _redirects stops at 2,000 rules: the edge must 301 each folded source on BOTH
// hosts to a target that exists. A folded page the edge does not answer is a live 404.
import fs from 'node:fs';
import { fail, pass, writeSummary } from './common.mjs';
import { consolidationRedirect } from '../../functions/_lib/host_consolidation.js';

const config = JSON.parse(fs.readFileSync('data/content/manual_redirects.json', 'utf8'));
const edge = (config.redirects || []).filter((entry) => entry.served_by === 'edge');
if (!edge.length) fail('[validate:retired-route-references] FAIL: data/content/manual_redirects.json declares no served_by "edge" redirects; checking zero folded pages proves nothing.');

const errors = [];
const routeFromSource = (p) => { const v = '/' + p.replace(/^\/+/, ''); return v.endsWith('/index.html') ? v.slice(0, -'index.html'.length) : v; };
for (const entry of edge) {
  const source = routeFromSource(entry.source_path);
  const target = new URL(entry.target, `https://${entry.domain || 'spryexecutiveos.com'}`);
  const targetFile = target.pathname.endsWith('/') ? `${target.pathname.slice(1)}index.html` : target.pathname.slice(1);
  if (!fs.existsSync(targetFile) && !fs.existsSync(`${targetFile}.html`)) errors.push(`${source}: redirect target missing ${entry.target}`);
  for (const host of ['billionairehighperformancecoach.com', 'spryexecutiveos.com']) {
    const got = consolidationRedirect(`https://${host}${source}`);
    if (got !== target.href) errors.push(`edge does not 301 ${host}${source} to ${entry.target} (got ${got})`);
  }
}

writeSummary('validate-retired-route-references', { status: errors.length ? 'FAIL' : 'PASS', edge_count: edge.length, errors });
if (errors.length) fail(`[validate:retired-route-references] FAIL: ${errors.length} issue(s)`, errors.slice(0, 200));
pass(`[validate:retired-route-references] OK: ${edge.length} folded pages 301 on both hosts to a target that exists`);
