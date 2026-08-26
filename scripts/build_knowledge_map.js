#!/usr/bin/env node
/*
Build a public coverage hub for the repo.

Outputs:
  - knowledge-map/index.html
  - knowledge-map/knowledge-map.json
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "content", "insights", "_drafts");
const LIVE_DIR = path.join(ROOT, "content", "insights");
const CLUSTERS_PATH = path.join(ROOT, "content", "insights", "_clusters.json");
const OUT_DIR = path.join(ROOT, "knowledge-map");
const OUT_JSON = path.join(OUT_DIR, "knowledge-map.json");
const OUT_HTML = path.join(OUT_DIR, "index.html");
const ROOT_PUBLIC_JSON = path.join(ROOT, "knowledge-map.json");
const ADMIN_OPERATIONS_JSON = path.join(ROOT, "data", "admin", "knowledge_map_operations.json");
const KNOWLEDGE_MAP_URL = "https://spryexecutiveos.com/knowledge-map/";
const OG_IMAGE = "https://spryexecutiveos.com/assets/img/bhpc-hero-square.png";
const PUBLISHED_REDDIT_PATH = path.join(ROOT, "data", "reddit", "published_manifest.json");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function utcTodayYYYYMMDD() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function parseFrontmatter(md) {
  if (!md.startsWith("---")) return { data: {}, body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: md };

  const fmRaw = md.slice(3, end).trim();
  const body = md.slice(end + 4).trim();
  const data = {};

  for (const line of fmRaw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf(":");
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let value = t.slice(idx + 1).trim();
    value = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

    if (/^\[.*\]$/.test(value)) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
        : [];
      continue;
    }

    data[key] = value;
  }

  return { data, body };
}

function getDraftDateFromFilename(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_/);
  return m ? m[1] : null;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .map((f) => path.join(dir, f));
}


function loadPublishedRedditPages() {
  if (!fs.existsSync(PUBLISHED_REDDIT_PATH)) return [];
  try {
    const payload = JSON.parse(readText(PUBLISHED_REDDIT_PATH));
    return Array.isArray(payload.items) ? payload.items : [];
  } catch {
    return [];
  }
}

function loadClusters() {
  if (!fs.existsSync(CLUSTERS_PATH)) return [];
  try {
    const arr = JSON.parse(readText(CLUSTERS_PATH));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function summarizeCoverage({ clusters, drafts, lives, redditPages }) {
  const byCluster = {};
  for (const c of clusters) {
    byCluster[c.id] = {
      id: c.id,
      name: c.name,
      description: c.description,
      live: 0,
      draft: 0,
      draftDates: [],
    };
  }

  function bucketFile(filePath, type) {
    const txt = readText(filePath);
    const { data } = parseFrontmatter(txt);
    const cluster = (data.cluster || "").trim();
    if (!cluster) return;

    if (!byCluster[cluster]) {
      byCluster[cluster] = {
        id: cluster,
        name: cluster,
        description: "Cluster referenced in content but missing from _clusters.json.",
        live: 0,
        draft: 0,
        draftDates: [],
      };
    }

    if (type === "draft") {
      byCluster[cluster].draft += 1;
      const fn = path.basename(filePath);
      const d = getDraftDateFromFilename(fn);
      if (d) byCluster[cluster].draftDates.push(d);
    } else {
      byCluster[cluster].live += 1;
    }
  }

  for (const f of drafts) bucketFile(f, "draft");
  for (const f of lives) bucketFile(f, "live");

  const allDraftDates = drafts
    .map((p) => getDraftDateFromFilename(path.basename(p)))
    .filter(Boolean)
    .sort();

  const today = utcTodayYYYYMMDD();
  const next10 = allDraftDates.filter((d) => d >= today).slice(0, 10);
  const minDraft = allDraftDates[0] || null;
  const maxDraft = allDraftDates[allDraftDates.length - 1] || null;

  for (const k of Object.keys(byCluster)) byCluster[k].draftDates.sort();

  return {
    generatedAtUtc: new Date().toISOString(),
    todayUtc: today,
    totals: {
      drafts: drafts.length,
      live: lives.length,
      clusters: Object.keys(byCluster).length,
    },
    runway: {
      minDraftDate: minDraft,
      maxDraftDate: maxDraft,
      next10DraftDates: next10,
    },
    redditVelocity: {
      totalPublished: redditPages.length,
      latestRoutes: redditPages.slice(-6).map((item) => ({ route: item.route, title: item.title, host: item.canonical_host })),
    },
    clusters: Object.values(byCluster)
      .sort((a, b) => (b.live + b.draft) - (a.live + a.draft))
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        live: c.live,
        draft: c.draft,
        total: c.live + c.draft,
        draftDateRange: {
          min: c.draftDates[0] || null,
          max: c.draftDates[c.draftDates.length - 1] || null,
        },
      })),
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRows(report) {
  return report.clusters
    .filter((c) => c.live > 0)
    .slice(0, 16)
    .map((c) => `
        <tr>
          <td><a href="/pillars/${escapeHtml(c.id)}/">${escapeHtml(c.name)}</a></td>
          <td class="num">${c.live}</td>
          <td>${escapeHtml(c.description || "Published coverage cluster")}</td>
        </tr>`)
    .join("\n");
}

function publicCoverageReport(report) {
  return {
    totals: {
      live: report.totals.live,
      publishedClusters: report.clusters.filter((c) => c.live > 0).length,
    },
    redditVelocity: report.redditVelocity,
    clusters: report.clusters
      .filter((c) => c.live > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        live: c.live,
      })),
  };
}

function renderRedditVelocity(report) {
  if (!report.redditVelocity || !report.redditVelocity.totalPublished) {
    return '<p>No Reddit-informed pages have been published yet.</p>';
  }
  const items = report.redditVelocity.latestRoutes.map((item) => `<li><a href="${escapeHtml(item.route)}">${escapeHtml(item.title)}</a> <span class="small">(${escapeHtml(item.host.replace('https://', ''))})</span></li>`).join('');
  return `<p class="small">Published Reddit-informed pages: ${report.redditVelocity.totalPublished}</p><ul>${items}</ul>`;
}

function renderHtml(report) {

  const desc = "Knowledge map for Spry Executive OS. Use this page to understand what the site covers, where the core models live, and how the knowledge surfaces connect across answers, atlas pages, topics, pillars, and product paths.";
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Knowledge Map",
    url: KNOWLEDGE_MAP_URL,
    description: desc,
    isPartOf: {
      "@type": "WebSite",
      name: "Spry Executive OS",
      url: "https://spryexecutiveos.com/"
    },
    about: [
      "AI executive coaching",
      "execution systems",
      "operating models",
      "accountability",
      "decision support"
    ]
  };

  const supplementalGeoSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Knowledge Map",
    url: KNOWLEDGE_MAP_URL
  };

  const softwareApplicationSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Spry Executive OS",
    alternateName: "Billionaire High Performance Coach",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: KNOWLEDGE_MAP_URL,
    offers: {
      "@type": "Offer",
      url: "https://sprylabs.gumroad.com/l/billionaire-high-performance-coach"
    },
    featureList: [
      "Continuity Architecture",
      "Minimum Viable Day",
      "Done check-in loop",
      "Scope cap rule",
      "Daily execution structure"
    ]
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What does Spry Executive OS cover?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The knowledge map explains the topic and retrieval surface areas supported by Spry Executive OS, including accountability, decision-making, execution, and continuity structure."
        }
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" content=""/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>Knowledge Map | Spry Executive OS</title>
<meta content="${escapeHtml(desc)}" name="description"/>
<link href="${KNOWLEDGE_MAP_URL}" rel="canonical"/>
<meta content="${KNOWLEDGE_MAP_URL}" property="og:url"/>
<meta content="Knowledge Map | Spry Executive OS" property="og:title"/>
<meta content="${escapeHtml(desc)}" property="og:description"/>
<meta content="website" property="og:type"/>
<meta content="Spry Executive OS" property="og:site_name"/>
<meta content="${OG_IMAGE}" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<meta content="Knowledge Map | Spry Executive OS" name="twitter:title"/>
<meta content="${escapeHtml(desc)}" name="twitter:description"/>
<meta content="${OG_IMAGE}" name="twitter:image"/>
<link href="/assets/styles.css" rel="stylesheet"/>
<script defer="" src="/assets/domain-context.js"></script>
<script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
</head>
<body>
<div class="cta-bar">
<div class="container cta-bar__inner">
<p class="cta-bar__text"><strong>Billionaire High-Performance Coach</strong> — the system behind this site.</p>
<div class="cta-bar__actions"><a class="btn btn--primary" href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Get Instant Access</a></div>
</div>
</div>
<header class="site-header">
<div class="nav-shell">
<a class="brand" href="/">Spry Labs</a>
<nav aria-label="Primary" class="nav-links">
<a href="/ai-execution-atlas/">AI Execution Atlas</a>
<a href="/continuity-collapse-pattern/">White Paper</a>
<a href="/alternatives-to-hiring.html">Comparisons</a>
<a href="/faq.html">FAQ</a>
</nav>
<a class="nav-cta" href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Get Instant Access</a>
</div>
</header>
<main>
<section class="hero hero--tight">
<div class="container">
<p class="eyebrow">Knowledge map</p>
<h1>Knowledge Map</h1>
<p class="hero__lede">This page shows what Spry Executive OS actually covers. It exists so a reader, crawler, or language model can see the shape of the site without guessing: the answers layer handles direct questions, the atlas layer explains how the system works, the models layer defines reusable operating concepts, and the product layer points to the full implementation. Instead of scattering those surfaces across disconnected pages, coverage gives them one clean index.</p>
<div class="button-row">
<a class="btn btn--primary" href="/download.html">Review the system manual</a>
<a class="btn btn--ghost" href="/ai-execution-atlas/">Open the atlas</a>
</div>
</div>
</section>
<section>
<div class="container prose">
<h2>What this page is for</h2>
<p>The knowledge map is the map layer for the site. It tells you which surfaces are educational, which ones are product-adjacent, and where to go depending on whether you want a fast answer, a framework, or the commercial system itself. That matters for citation and retrieval because it reduces ambiguity. A model does better when a site has one obvious page that names the clusters, the route structure, and the relationship between public knowledge pages and the underlying product.</p>
<h2>Primary product surfaces</h2>
<p>The commercial center of gravity is <a href="/download.html">Billionaire High-Performance Coach</a>. The product pages explain the offer, pricing, use cases, and buying context. They are not meant to replace the educational library. They are meant to sit beside it, so someone can move from understanding the system to deciding whether they want the full asset.</p>
<h2>Knowledge graph surfaces</h2>
<p>The main knowledge surfaces are the <a href="/answers/">answers hub</a>, the <a href="/ai-execution-atlas/">AI Execution Atlas</a>, the <a href="/models/">models library</a>, the <a href="/topics/">topics index</a>, and the <a href="/pillars/">pillars pages</a>. Together they create the reusable vocabulary of the system: execution loops, recovery rules, accountability mechanics, founder workflows, and other operating concepts that show up across the site.</p>
<h2>How to use coverage intelligently</h2>
<p>If you want a concise explanation, start in Answers. If you want the conceptual map, start in the Atlas or Models. If you want to understand how the system clusters ideas, use Topics and Pillars. If you already know what you want and need the implementation, go straight to the manual. That progression is deliberate. It keeps the site legible for both humans and machines, and it gives citation systems a cleaner path to the most relevant node.</p>
</div>
</section>
<section>
<div class="container">
<div class="card-grid card-grid--three">
<article class="card"><h2>Answers</h2><p>Direct question-and-answer pages for AI coaching, accountability, structured execution, and decision support.</p><a href="/answers/">Browse Answers</a></article>
<article class="card"><h2>Atlas</h2><p>The structural explanation layer for how the system works, what the models mean, and how they connect.</p><a href="/ai-execution-atlas/">Open the Atlas</a></article>
<article class="card"><h2>Models</h2><p>Named concepts like Operational Drift, Scope Cap, Minimum Viable Day, and continuity architecture.</p><a href="/models/">View Models</a></article>
</div>
</div>
</section>
<section>
<div class="container">
<h2>Published coverage snapshot</h2>
<p>This snapshot is generated from the current public content library. It reports published coverage only. Draft schedules, release runway, and production backlog remain inside the private admin command center.</p>
<div class="table-wrap">
<table>
<thead>
<tr><th>Cluster</th><th>Published pages</th><th>Coverage focus</th></tr>
</thead>
<tbody>
${renderRows(report)}
</tbody>
</table>
</div>
<p class="small">Totals: ${report.totals.live} published pages across ${report.clusters.filter((c) => c.live > 0).length} published clusters.</p>
</div>
</section>
<section>
<div class="container prose">
<h2>Latest Reddit-informed releases</h2>
${renderRedditVelocity(report)}
<h2>Why this page exists</h2>
<p>Sites that want strong retrieval need a page that clarifies scope. The knowledge map does that job. It gives a single canonical route for the map layer, ties together the major educational surfaces, and makes the internal architecture easier to understand. That helps with crawl clarity, helps with citation coherence, and reduces the odds that the site looks like a pile of disconnected pages.</p>
</div>
</section>
</main>
<footer class="site-footer">
<div class="container footer-grid">
<div>
<strong>Spry Executive OS</strong>
<p>Structured execution systems, AI operator design, and the site architecture behind Billionaire High-Performance Coach.</p>
</div>
<div>
<strong>Explore</strong>
<ul>
<li><a href="/answers/">Answers</a></li>
<li><a href="/ai-execution-atlas/">Atlas</a></li>
<li><a href="/models/">Models</a></li>
<li><a href="/download.html">System manual</a></li>
</ul>
</div>
</div>
</footer>
<script data-geo-semantic="true" type="application/ld+json">${JSON.stringify(supplementalGeoSchema)}</script>
<script type="application/ld+json">${JSON.stringify(softwareApplicationSchema)}</script>
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
</body>
</html>`;
}

function main() {
  ensureDir(OUT_DIR);
  const report = summarizeCoverage({
    clusters: loadClusters(),
    drafts: listMarkdownFiles(DRAFT_DIR),
    lives: listMarkdownFiles(LIVE_DIR).filter((p) => !p.includes(`${path.sep}_drafts${path.sep}`)),
    redditPages: loadPublishedRedditPages(),
  });

  // Required baseline artifacts must be byte-stable when their semantic inputs are unchanged.
  // Preserve the previous generation timestamp instead of manufacturing drift on every validation run.
  if (fs.existsSync(ADMIN_OPERATIONS_JSON)) {
    try {
      const previous = JSON.parse(readText(ADMIN_OPERATIONS_JSON));
      const stripGeneratedAt = (value) => {
        const copy = JSON.parse(JSON.stringify(value));
        delete copy.generatedAtUtc;
        return copy;
      };
      if (JSON.stringify(stripGeneratedAt(previous)) === JSON.stringify(stripGeneratedAt(report)) && previous.generatedAtUtc) {
        report.generatedAtUtc = previous.generatedAtUtc;
      }
    } catch {
      // A malformed prior artifact should be replaced by the newly generated valid payload.
    }
  }

  ensureDir(path.dirname(ADMIN_OPERATIONS_JSON));
  const publicReport = publicCoverageReport(report);
  fs.writeFileSync(ADMIN_OPERATIONS_JSON, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(OUT_JSON, JSON.stringify(publicReport, null, 2) + "\n", "utf8");
  fs.writeFileSync(OUT_HTML, renderHtml(report), "utf8");
  // /knowledge-map.json is a machine-readability artifact (validate_machine_readability_contract
  // requires it beside llms.txt and answers.json), so it is public and must carry the
  // SANITIZED report. It previously held the full report - including draft counts and the
  // forward publishing runway - and was served at the site root, which is the operational
  // leak the 2026-07-10 coverage route repair set out to close. The generator stopped
  // writing it then, so the leaking copy simply went stale in git and kept deploying.
  fs.writeFileSync(ROOT_PUBLIC_JSON, JSON.stringify(publicReport, null, 2) + "\n", "utf8");
  console.log(`Wrote ${path.relative(ROOT, ADMIN_OPERATIONS_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, ROOT_PUBLIC_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_HTML)}`);
}

main();

process.exit(0);
