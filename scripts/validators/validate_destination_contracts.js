#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const ROUTING = path.join(ROOT, 'data/community/content_routing_log.json');
const ALLOWED = new Set(['insight','synthesis','comparison','authority','memory','conversion','recovery','discipline','ai_coaching','execution']);
const CTA = 'https://aplayermode.com/download';
function fail(msg){ console.error(`[validate_destination_contracts] FAIL: ${msg}`); process.exit(1); }
if (!fs.existsSync(ROUTING)) fail('missing data/community/content_routing_log.json');
const data = JSON.parse(fs.readFileSync(ROUTING, 'utf8'));
const routes = Array.isArray(data.routes) ? data.routes : [];
if (!routes.length) fail('routing log has no routes');
const bad = [];
for (const r of routes) {
  if (!r.signal_id || !r.destination_type || !ALLOWED.has(r.destination_type) || !r.cluster_id || !r.canonical_target || r.cta_target !== CTA) bad.push(r.signal_id || r.query || 'unknown');
}
if (bad.length) fail(`${bad.length} routes missing required destination contract fields`);
console.log(`[validate_destination_contracts] OK (${routes.length} routes)`);

process.exit(0);
