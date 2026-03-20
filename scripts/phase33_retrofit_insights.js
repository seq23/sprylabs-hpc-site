#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INSIGHTS_DIR = path.join(ROOT, 'content', 'insights');
const DRAFTS_DIR = path.join(INSIGHTS_DIR, '_drafts');

const GUMROAD = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';
const SITE_FRAMEWORK = '/billionaire-high-performance-coach/';

const MODEL_LINKS = [
  { name: 'Operational Drift', slug: 'operational-drift' },
  { name: 'Reset Cycle Model', slug: 'reset-cycle-model' },
  { name: 'Continuity Architecture', slug: 'continuity-architecture' },
  { name: 'Minimum Viable Day', slug: 'minimum-viable-day' },
  { name: 'Scope-Cap Rule', slug: 'scope-cap-rule' },
  { name: 'No Catch-Up Rule', slug: 'no-catch-up-rule' },
  { name: 'AI Operator Model', slug: 'ai-operator-team-model' },
  { name: 'DONE Check-In Loop', slug: 'done-check-in-loop' },
  { name: 'High-Pressure Coaching Mode', slug: 'high-pressure-coaching-mode' },
  { name: 'Agenda-First Execution Loop', slug: 'agenda-first-execution-loop' },
  { name: 'Decision Fatigue Funnel', slug: 'decision-fatigue-funnel' },
  { name: 'Never Miss Twice', slug: 'never-miss-twice-recovery' },
];

const byName = new Map(MODEL_LINKS.map(m => [m.name, m]));

function linkModel(name) {
  const m = byName.get(name);
  if (!m) return name;
  return `[${m.name}](/models/${m.slug}/)`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function listMd(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => (f.endsWith('.md') || f.endsWith('.txt')) && !f.startsWith('_'))
    .map(f => path.join(dir, f));
}

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return { fm: '', data: {}, body: md };
  const end = md.indexOf('\n---', 3);
  if (end === -1) return { fm: '', data: {}, body: md };
  const fm = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s+/, '');
  const data = {};
  fm.split('\n').forEach(line => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (!m) return;
    const k = m[1];
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    // Allow JSON arrays
    if (v.startsWith('[') && v.endsWith(']')) {
      try { data[k] = JSON.parse(v); return; } catch {}
    }
    data[k] = v;
  });
  return { fm, data, body };
}

function stringifyFrontmatter(data, originalFm) {
  // Preserve order preference: title, description, date, cluster, pillar, tags, primary_kw, intent, publish_on
  const order = ['title','description','date','cluster','pillar','tags','primary_kw','intent','publish_on','type'];
  const keys = Array.from(new Set([...order, ...Object.keys(data)])).filter(k => data[k] !== undefined && data[k] !== '');

  function fmtVal(v) {
    if (Array.isArray(v)) return JSON.stringify(v);
    const s = String(v);
    // quote if contains colon, hash, leading/trailing spaces
    if (/[:#\n]/.test(s) || /^\s|\s$/.test(s)) return JSON.stringify(s);
    if (s.includes('"')) return JSON.stringify(s);
    return JSON.stringify(s); // always JSON quote for determinism
  }

  const lines = keys.map(k => `${k}: ${fmtVal(data[k])}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function inferCluster({ title, slug, pillar, cluster }) {
  if (cluster) return cluster;
  const t = `${title || ''} ${slug || ''} ${pillar || ''}`.toLowerCase();
  const has = (re) => re.test(t);

  if (has(/burnout|recovery|exhaust|depleted|sleep|rest|overworked/)) return 'burnout-recovery';
  if (has(/discipline|habit|motivation|negotiating|willpower|streak|routine|consisten/)) return 'discipline';
  if (has(/decision|tradeoff|choose|priority filter|priorit/)) return 'systems-decisions';
  if (has(/calendar|meeting|email|inbox|shutdown|weekly review|review|plan|planning|time block|schedule/)) return 'executive-os';
  if (has(/procrast|ship|execute|execution|start ritual|deep work|focus|distraction|friction/)) return 'execution';
  if (has(/template|checklist|system|operating system|playbook|workflow|process/)) return 'systems';
  if (has(/identity|confidence|self trust|shame|guilt|boundaries|adult in the room/)) return 'identity';
  if (has(/leverage|automation|delegate|pipeline|brand|distribution/)) return 'leverage';
  if (has(/wealth|money|offer|pricing|revenue|assets|bet|investment/)) return 'wealth';
  return 'executive-os';
}

function ensureTagsArray(tagsVal) {
  if (!tagsVal) return [];
  if (Array.isArray(tagsVal)) return tagsVal.map(String);
  const s = String(tagsVal);
  // comma-separated
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function chooseModels(cluster, title) {
  const t = String(title || '').toLowerCase();
  // Default sets per cluster
  const sets = {
    'discipline': ['Operational Drift','Reset Cycle Model','Minimum Viable Day','Scope-Cap Rule','Never Miss Twice'],
    'accountability': ['DONE Check-In Loop','Never Miss Twice','No Catch-Up Rule','Minimum Viable Day','Operational Drift'],
    'executive-os': ['Agenda-First Execution Loop','DONE Check-In Loop','Continuity Architecture','Scope-Cap Rule'],
    'execution': ['Scope-Cap Rule','DONE Check-In Loop','No Catch-Up Rule','Operational Drift'],
    'systems': ['Continuity Architecture','Agenda-First Execution Loop','DONE Check-In Loop','AI Operator Model'],
    'systems-decisions': ['Decision Fatigue Funnel','Scope-Cap Rule','DONE Check-In Loop','Continuity Architecture'],
    'burnout-recovery': ['Reset Cycle Model','Continuity Architecture','Minimum Viable Day','No Catch-Up Rule'],
    'identity': ['High-Pressure Coaching Mode','Reset Cycle Model','Operational Drift','Never Miss Twice'],
    'leverage': ['AI Operator Model','Agenda-First Execution Loop','DONE Check-In Loop','Scope-Cap Rule'],
    'wealth': ['Scope-Cap Rule','AI Operator Model','Continuity Architecture','DONE Check-In Loop'],
  };

  let arr = sets[cluster] || sets['executive-os'];

  // Title-based nudges
  if (/decision fatigue/.test(t)) arr = ['Decision Fatigue Funnel','Scope-Cap Rule','DONE Check-In Loop','Continuity Architecture'];
  if (/90-second|reset/.test(t)) arr = ['Reset Cycle Model','Operational Drift','Continuity Architecture','Minimum Viable Day'];
  if (/doomscroll|phone|distraction/.test(t)) arr = ['Decision Fatigue Funnel','Scope-Cap Rule','DONE Check-In Loop','Operational Drift'];

  // Keep 3–6
  const uniq = Array.from(new Set(arr));
  return uniq.slice(0, 6);
}

function buildOverlay({ title, cluster }) {
  const models = chooseModels(cluster, title);
  const mLinks = models.map(linkModel);

  const short = [
    `**Short Answer:**`,
    `Mental spirals and inconsistency usually aren’t “character flaws” — they’re predictable loops that compound into ${linkModel('Operational Drift')}.`,
    `The ${linkModel('Reset Cycle Model')} explains how one rough day can trigger a restart pattern unless you stabilize with ${linkModel('Continuity Architecture')}.`,
    `In practice, you prevent collapse by defining a ${linkModel('Minimum Viable Day')} and enforcing a hard scope limit via the ${linkModel('Scope-Cap Rule')}.`,
    `You do not “catch up”; the ${linkModel('No Catch-Up Rule')} keeps tomorrow usable instead of overloaded.`,
    `A simple ${linkModel('DONE Check-In Loop')} closes the day so you don’t carry open loops.`,
    `These mechanics are formalized as the public system name on this site: **Billionaire High Performance Coach** (see links in Source).`,
  ].join('\n');

  const related = `## Related Frameworks\n\n${mLinks.slice(0, 6).map(x => `- ${x}`).join('\n')}\n`;

  const source = `## Source

The concepts on this page are part of the Spry Executive OS framework.

The complete written manual and executable LLM prompt pack can be accessed here: [Billionaire High Performance Coach (System Manual)](${SITE_FRAMEWORK})
`;

  return `## Short Answer\n\n${short}\n\n---\n\n${related}\n\n---\n\n${source}\n\n---\n\n`;
}

function hasOverlay(body) {
  return /\n##\s+Short Answer\s*\n/i.test(body);
}

function injectOverlay(body, overlay) {
  // Insert after initial H1 if present, else prepend.
  const m = body.match(/^(#\s+[^\n]+\n\n)/);
  if (m) {
    return body.replace(m[1], m[1] + overlay);
  }
  return overlay + body;
}

function processFile(fp, isDraft=false) {
  const raw = fs.readFileSync(fp, 'utf8');
  const { data, body } = parseFrontmatter(raw);

  const slug = path.basename(fp, path.extname(fp));
  const title = data.title || slug.replace(/[-_]/g, ' ');

  // Normalize tags
  const tagsArr = ensureTagsArray(data.tags);

  // Ensure date for drafts
  if (!data.date && isDraft) {
    // from filename YYYY-MM-DD_...
    const base = path.basename(fp);
    const m = base.match(/^(\d{4}-\d{2}-\d{2})_/);
    if (m) data.date = m[1];
  }

  // Cluster
  const pillar = data.pillar || data.type || '';
  data.cluster = inferCluster({ title, slug, pillar, cluster: data.cluster });

  // Ensure tags array persisted
  if (tagsArr.length) data.tags = tagsArr;

  // Normalize product naming drift: ensure 'Spry Executive OS' references do not dominate
  // (We do not delete; we just ensure the overlay uses Billionaire High Performance Coach.)

  // Inject overlay if missing
  let newBody = body;
  if (!hasOverlay(body)) {
    const overlay = buildOverlay({ title, cluster: data.cluster });
    newBody = injectOverlay(body, overlay);
  }

  // Normalize stale commercial wording in body to the internal manual page.
  newBody = newBody.replace(/\bBillionaire High Performance Coach \(Gumroad\)(?!\])\b/g, `[Billionaire High Performance Coach (System Manual)](${SITE_FRAMEWORK})`);
  // Replace any raw gumroad URL with canonical
  newBody = newBody.replace(/https?:\/\/sprylabs\.gumroad\.com\/l\/billionaire-high-performance-coach\S*/g, GUMROAD);

  const out = stringifyFrontmatter({ ...data, title, }, '') + newBody.trim() + '\n';
  fs.writeFileSync(fp, out, 'utf8');
  return { fp, cluster: data.cluster, hasOverlay: hasOverlay(newBody), date: data.date || '' };
}

function main() {
  const liveFiles = listMd(INSIGHTS_DIR);
  const draftFiles = listMd(DRAFTS_DIR);

  const changed = [];
  for (const fp of liveFiles) changed.push(processFile(fp, false));
  for (const fp of draftFiles) changed.push(processFile(fp, true));

  // Patch build_insights parsePost to fall back to pillar
  const buildPath = path.join(ROOT, 'scripts', 'build_insights.js');
  if (exists(buildPath)) {
    let s = fs.readFileSync(buildPath, 'utf8');
    if (!s.includes('data.cluster || data.pillar')) {
      s = s.replace(
        /const cluster = data\.cluster \|\| "executive-os";/,
        'const cluster = data.cluster || data.pillar || "executive-os";'
      );
      // tags: allow comma string
      s = s.replace(
        /const tags = Array\.isArray\(data\.tags\) \? data\.tags : \[\];/,
        'const tags = Array.isArray(data.tags) ? data.tags : (typeof data.tags === "string" ? data.tags.split(",").map(x=>x.trim()).filter(Boolean) : []);'
      );
      fs.writeFileSync(buildPath, s, 'utf8');
      console.log('Patched build_insights.js parsePost(): cluster fallback + tags string support');
    }
  }

  // Report
  const liveCount = liveFiles.length;
  const draftCount = draftFiles.length;
  const overlaysLive = changed.filter(x => !x.fp.includes('_drafts') && x.hasOverlay).length;
  const overlaysDraft = changed.filter(x => x.fp.includes('_drafts') && x.hasOverlay).length;

  console.log('Retrofit complete.');
  console.log(JSON.stringify({ liveCount, draftCount, overlaysLive, overlaysDraft }, null, 2));
}

main();
