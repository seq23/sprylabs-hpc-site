#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'config', 'admin_overrides.json');
const TARGETS = [
  { name: 'synthesis', path: path.join(ROOT, 'data', 'synthesis', 'queue.json') },
  { name: 'authority', path: path.join(ROOT, 'data', 'whitepapers', 'queue.json') }
];

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
function matches(item, override) {
  const targetId = String(override.target_id || '');
  if (!targetId) return false;
  return [item.id, item.cluster_id, item.slug, item.title].map(v => String(v || '')).includes(targetId);
}
function validateConfig(config) {
  const errors = [];
  const ids = new Set();
  for (const override of (config.overrides || [])) {
    if (!override.id) errors.push('override missing id');
    if (override.id && ids.has(override.id)) errors.push(`duplicate override id: ${override.id}`);
    ids.add(override.id);
    if (!['force_publish', 'suppress_topic'].includes(override.action)) errors.push(`invalid action for ${override.id}`);
    if (!['cluster', 'item'].includes(override.target_type)) errors.push(`invalid target_type for ${override.id}`);
    if (!override.target_id) errors.push(`missing target_id for ${override.id}`);
    if (!['all', 'synthesis', 'authority'].includes(override.destination)) errors.push(`invalid destination for ${override.id}`);
  }
  if (errors.length) throw new Error(`Admin override config invalid:\n- ${errors.join('\n- ')}`);
}
function applyOverride(item, override) {
  const now = new Date().toISOString();
  const history = Array.isArray(item.admin_override_history) ? item.admin_override_history : [];
  const next = {
    ...item,
    admin_override: {
      id: override.id,
      action: override.action,
      target_type: override.target_type,
      target_id: override.target_id,
      destination: override.destination,
      reason: override.reason || '',
      applied_at: now
    },
    admin_override_history: history.concat({
      id: override.id,
      action: override.action,
      status: override.status || item.status,
      applied_at: now
    })
  };
  if (override.action === 'force_publish') {
    next.status = override.status || 'queued';
    next.suppressed = false;
  }
  if (override.action === 'suppress_topic') {
    next.status = override.status || 'suppressed';
    next.suppressed = true;
  }
  return next;
}
function main() {
  const config = readJson(CONFIG_PATH, { overrides: [] });
  validateConfig(config);
  const enabled = (config.overrides || []).filter(o => o.enabled === true);
  let total = 0;
  for (const target of TARGETS) {
    if (!fs.existsSync(target.path)) continue;
    const data = readJson(target.path, { items: [] });
    if (!Array.isArray(data.items)) continue;
    const applicable = enabled.filter(o => o.destination === 'all' || o.destination === target.name);
    if (!applicable.length) continue;
    let changed = false;
    data.items = data.items.map(item => {
      let next = item;
      for (const override of applicable) {
        if (matches(next, override)) {
          next = applyOverride(next, override);
          changed = true;
          total += 1;
        }
      }
      return next;
    });
    if (changed) {
      data.admin_overrides_applied_at = new Date().toISOString();
      writeJson(target.path, data);
    }
  }
  console.log(`admin overrides: applied ${total} item override(s)`);
}
if (require.main === module) main();
