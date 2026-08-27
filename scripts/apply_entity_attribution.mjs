#!/usr/bin/env node
// Extend the existing S.L. Taylor author entity to every eligible public page.
//
// C1: data/content_ownership_registry.json is the ownership authority. Only routes
// owned by legacy_eligible and not protected are eligible. Agent-owned (paid_agent),
// system_core and protected routes are never touched.
//
// Idempotent. --dry-run to inspect, --limit N to batch.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
// The public site is the repository root.
const PUBLIC_ROOT = ROOT;
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const li = args.indexOf('--limit');
const LIMIT = li >= 0 ? Number(args[li + 1]) : Infinity;

const ORG_ID = 'https://billionairehighperformancecoach.com/#organization';
const PERSON_ID = 'https://billionairehighperformancecoach.com/sequoia-taylor.html#person';

// Matches the shape already published on the pages that carry attribution, so the
// entity resolves to one identity sitewide. knowsAbout describes existing subject
// matter; no titles or credentials are asserted (C3).
const AUTHOR = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'S.L. Taylor',
  url: 'https://billionairehighperformancecoach.com/sequoia-taylor.html',
  sameAs: ['https://www.sequoiataylor.com'],
  worksFor: { '@id': ORG_ID },
  knowsAbout: ['executive performance systems', 'daily execution planning', 'AI accountability systems', 'ADHD productivity']
};

const AUTHORED = new Set(['Article','BlogPosting','NewsArticle','TechArticle','WebPage','FAQPage','HowTo']);

const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/content_ownership_registry.json'), 'utf8'));
const eligible = new Set();
const blocked = new Set();
for (const r of reg.routes || []) {
  if (!r?.source_file) continue;
  if (r.owner === 'legacy_eligible' && r.protected !== true) eligible.add(r.source_file);
  else blocked.add(r.source_file);
}

const LD = /(<script[^>]*application\/ld\+json[^>]*>)([\s\S]*?)(<\/script>)/gi;
const st = { eligible: eligible.size, blocked_by_c1: blocked.size, missing_file: 0, already: 0, changed: 0, meta_added: 0, author_bound: 0, no_jsonld: 0, unparseable: 0 };

for (const relFile of eligible) {
  if (st.changed >= LIMIT) break;
  const abs = path.join(PUBLIC_ROOT, relFile);
  if (!fs.existsSync(abs)) { st.missing_file++; continue; }
  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes(PERSON_ID)) { st.already++; continue; }
  if (/<meta[^>]+name=["']robots["'][^>]*noindex/i.test(html)) { st.blocked_by_c1++; continue; }
  if (!/application\/ld\+json/i.test(html)) { st.no_jsonld++; continue; }

  let injected = false, bad = false, bound = 0;
  html = html.replace(LD, (m, o, b, c) => {
    if (injected || bad) return m;
    let d; try { d = JSON.parse(b.trim()); } catch { bad = true; return m; }
    const isG = d && typeof d === 'object' && Array.isArray(d['@graph']);
    const nodes = isG ? d['@graph'] : (Array.isArray(d) ? d : [d]);
    if (!nodes.some(n => n && typeof n === 'object')) return m;
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue;
      const t = n['@type']; const ts = Array.isArray(t) ? t : [t];
      if (ts.some(x => AUTHORED.has(x))) { n.author = { '@id': PERSON_ID }; bound++; }
    }
    if (!nodes.some(n => n && n['@id'] === PERSON_ID)) nodes.push(AUTHOR);
    injected = true;
    const out = isG ? { ...d, '@graph': nodes } : (Array.isArray(d) ? nodes : { '@context': 'https://schema.org', '@graph': nodes });
    return `${o}${JSON.stringify(out)}${c}`;
  });
  if (bad) { st.unparseable++; continue; }
  if (!injected) continue;
  if (!/<meta[^>]+name=["']author["']/i.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '  <meta name="author" content="S.L. Taylor">\n</head>');
    st.meta_added++;
  }
  st.author_bound += bound; st.changed++;
  if (!DRY) fs.writeFileSync(abs, html);
}
console.log(`[entity-attribution]${DRY ? ' DRY-RUN' : ''} ` + Object.entries(st).map(([k,v]) => `${k}=${v}`).join(' '));
