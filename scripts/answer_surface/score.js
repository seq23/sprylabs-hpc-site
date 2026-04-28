#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const dir = path.join(ROOT, 'data/answer_surface_monitoring');
const reports = path.join(ROOT, 'reports');
fs.mkdirSync(reports, { recursive: true });
function readJson(file, fallback) { try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } }
const candidates = readJson(path.join(dir, 'observation_candidates.json'), { observations: [] }).observations || [];
const manual = readJson(path.join(dir, 'observations.manual.json'), { observations: [] }).observations || [];
const byKey = new Map();
for (const obs of candidates) byKey.set(obs.id, { ...obs, mentions: [] });
for (const obs of manual) byKey.set(obs.id || `${obs.cluster}:${obs.query}`, obs);
const groups = new Map();
for (const obs of byKey.values()) {
  const key = `${obs.vertical || 'bhpc'}/${obs.cluster || 'general'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(obs);
}
const ranked = [];
for (const [key, observations] of groups) {
  const [vertical, cluster] = key.split('/');
  let canonical_mentions = 0, velocity_mentions = 0, competitor_mentions = 0, unknown_mentions = 0;
  for (const obs of observations) {
    const text = JSON.stringify(obs.mentions || obs.results || []).toLowerCase();
    if (/billionairehighperformancecoach\.com/.test(text)) canonical_mentions++;
    if (/spryexecutiveos\.com|aplayermode\.com/.test(text)) velocity_mentions++;
    if (/betterup|hone|coachhub|torch|cultureamp|culture amp/.test(text)) competitor_mentions++;
    if (!(obs.mentions || obs.results || []).length) unknown_mentions++;
  }
  const total_queries = observations.length;
  const raw = canonical_mentions * 3 + velocity_mentions * 2 - competitor_mentions + Math.max(0, total_queries - unknown_mentions) * 0.5;
  const score = total_queries ? Math.max(0, Math.min(100, Math.round((raw / (total_queries * 3)) * 100))) : 0;
  ranked.push({ vertical, cluster, total_queries, observations: total_queries, canonical_mentions, velocity_mentions, competitor_mentions, unknown_mentions, score, status: score >= 60 ? 'strong' : unknown_mentions === total_queries ? 'unknown' : 'weak' });
}
ranked.sort((a,b) => a.score - b.score || b.total_queries - a.total_queries);
const output = { generated_at: new Date().toISOString(), clusters: ranked.length, ranked };
fs.writeFileSync(path.join(reports, 'answer_surface_scorecard.json'), JSON.stringify(output, null, 2) + '\n');
console.log(`answer:score wrote ${ranked.length} clusters`);
