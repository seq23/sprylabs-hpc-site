#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "insights");
const OUT_DIR = path.join(ROOT, "insights");
const PILLARS_DIR = path.join(ROOT, "pillars");
const TOPICS_DIR = path.join(ROOT, "topics"); // sitemap references; may be generated elsewhere
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const LLMS_PATH = path.join(ROOT, "llms.txt");
const CLUSTERS_PATH = path.join(CONTENT_DIR, "_clusters.json");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const LAYOUT_PATH = path.join(TEMPLATES_DIR, "layout.html");

// Canonical base for this site
const SITE_BASE = "https://spryexecutiveos.com";

// --- utils ---
function readUtf8(p) { return fs.readFileSync(p, "utf8"); }
function writeUtf8(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, "utf8");
}
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "item";
}

function toAbs(href) {
  if (!href) return SITE_BASE + "/";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return SITE_BASE + href;
  return SITE_BASE + "/" + href.replace(/^\.\//, "");
}

function parseFrontmatter(md) {
  // Tiny YAML-ish parser:
  // - key: value
  // - arrays supported as JSON: ["a","b"]
  if (!md.startsWith("---")) return { data: {}, body: md };
  const end = md.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: md };
  const raw = md.slice(3, end).trim();
  const body = md.slice(end + 4).replace(/^\s+/, "");
  const data = {};
  raw.split("\n").forEach((line) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)\s*$/);
    if (!m) return;
    const k = m[1  '/raise-your-standards/',
  '/high-agency-operating-system/',
  '/how-to-build-long-term-wealth-discipline/',
  '/daily-execution-loop/',
  '/minimum-viable-day/',
  '/never-miss-twice-rule/',
  '/no-catch-up-rule/',
  '/why-chatgpt-advice-doesnt-stick/',
  '/ai-vs-human-coaching/',
  '/can-ai-replace-coaching/',
  '/how-to-structure-chatgpt-conversations/',
  '/how-to-stop-emotional-eating/',
  '/fitness-discipline-system/',
  '/morning-workout-consistency/',
  '/stop-binge-reset-cycle/',
  '/i-wasted-my-20s/',
  '/billionaire-high-performance-coach-pricing/',
  '/structured-ai-accountability-system/',
  '/how-to-think-clearly-under-pressure/',
  '/executive-decision-clarity/',
  '/stop-spiraling-before-big-moments/',
  '/restore-composure-fast/',
  '/high-pressure-coaching-mode/',
  '/how-to-coach-yourself/',
  '/self-accountability-system/',
  '/become-your-own-executive-coach/',
  '/billionaire-health-habits/',
  '/high-performance-fitness-discipline/',
];
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.startsWith("[") && v.endsWith("]")) {
      try { data[k] = JSON.parse(v); return; } catch (_) {}
    }
    data[k] = v;
  });
  return { data, body };
}

function getSlugFromFilename(fp) {
  const base = path.basename(fp);
  return base.replace(/\.(md|txt)$/i, "");
}

function listMarkdownFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => (f.endsWith(".md") || f.endsWith(".txt")) && !f.startsWith("_"))
    .map((f) => path.join(dir, f));
}

// --- markdown -> html with headings + toc ---
function mdToHtmlWithHeadings(md) {
  // Minimal Markdown rendering + heading IDs + heading extraction.
  // Deterministic + dependency-free (works in GitHub Actions without npm install).
  let s = String(md || "").replace(/\r\n/g, "\n");

  const headings = [];
  const seen = new Set();

  function makeId(raw) {
    const base = String(raw || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "section";
    let id = base;
    for (let i = 2; seen.has(id) && i < 999; i++) id = `${base}-${i}`;
    seen.add(id);
    return id;
  }

  // code fences -> pre/code
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${htmlEscape(code.trim())}</code></pre>`);

  // headings with ids (order matters: ### then ## then #)
  s = s.replace(/^###\s+(.*)$/gm, (_m, t) => {
    const title = String(t || "").trim();
    const id = makeId(title);
    headings.push({ level: 3, id, title });
    return `<h3 id="${id}">${htmlEscape(title)}</h3>`;
  });
  s = s.replace(/^##\s+(.*)$/gm, (_m, t) => {
    const title = String(t || "").trim();
    const id = makeId(title);
    headings.push({ level: 2, id, title });
    return `<h2 id="${id}">${htmlEscape(title)}</h2>`;
  });
  s = s.replace(/^#\s+(.*)$/gm, (_m, t) => {
    const title = String(t || "").trim();
    const id = makeId(title);
    headings.push({ level: 1, id, title });
    return `<h1 id="${id}">${htmlEscape(title)}</h1>`;
  });

  // unordered lists (minimal)
  s = s.replace(/(?:^|\n)(- .*(?:\n- .*)+)/g, (m) => {
    const items = m.trim().split(/\n/).map(line => line.replace(/^-\s+/, "").trim());
    return `\n<ul>${items.map(i => `<li>${htmlEscape(i)}</li>`).join("")}</ul>`;
  });

  // bold/italic (minimal)
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // inline code
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${htmlEscape(c)}</code>`);

  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, url) => `<a href="${htmlEscape(url)}">${htmlEscape(t)}</a>`);

  // paragraphs: split on blank lines
  const parts = s.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const out = parts.map(p => {
    if (p.startsWith("<h1") || p.startsWith("<h2") || p.startsWith("<h3") || p.startsWith("<ul") || p.startsWith("<pre")) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return { html: out, headings };
}

function buildTocHtml(headings) {
  const tocItems = (headings || [])
    .filter(h => h && (h.level === 2 || h.level === 3))
    .map(h => ({ ...h, title: String(h.title || "").trim() }))
    .filter(h => h.title.length >= 4)
    .slice(0, 18);

  if (!tocItems.length) return "";

  return `<section class="toc" aria-label="Questions answered on this page">
    <div class="toc-inner">
      <div class="toc-title">Questions answered on this page</div>
      <ul class="toc-list">
        ${tocItems.map(h => `<li class="toc-item level-${h.level}"><a href="#${htmlEscape(h.id)}">${htmlEscape(h.title)}</a></li>`).join("")}
      </ul>
    </div>
  </section>`;
}

// --- site chrome: header/footer + layout template ---
function readNavFromIndex() {
  const indexPath = path.join(ROOT, "index.html");
  if (!exists(indexPath)) return "";
  const html = readUtf8(indexPath);
  const m = html.match(/<header[\s\S]*<\/header>/i);
  return m ? m[0] : "";
}

function readFooterFromIndex() {
  const indexPath = path.join(ROOT, "index.html");
  if (!exists(indexPath)) return "";
  const html = readUtf8(indexPath);
  const m = html.match(/<footer[\s\S]*<\/footer>/i);
  return m ? m[0] : "";
}

const HEADER_HTML = readNavFromIndex();
const FOOTER_HTML = readFooterFromIndex();

function stylesheetHref(activePath) {
  // activePath is site-root relative: "/insights/foo.html" or "/pillars/<slug>/index.html"
  if (activePath.startsWith("/pillars/")) return "../../assets/site.css";
  if (activePath.startsWith("/insights/")) return "../assets/site.css";
  if (activePath.startsWith("/topics/")) return "../../assets/site.css";
  return "assets/site.css";
}

function loadLayoutTemplate() {
  if (!exists(LAYOUT_PATH)) return null;
  const tpl = readUtf8(LAYOUT_PATH);
  // sanity: must include {{content}} at minimum
  if (!tpl.includes("{{content}}")) return null;
  return tpl;
}

const LAYOUT_TEMPLATE = loadLayoutTemplate();

function jsonLdArticle({ title, description, url, datePublished, dateModified }) {
  const obj = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    author: { "@type": "Organization", name: "Spry Labs" },
    publisher: { "@type": "Organization", name: "Spry Labs" },
    datePublished,
    dateModified,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function jsonLdCollection({ title, description, url }) {
  const obj = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url,
  };
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function renderPage({ title, description, canonical, activePath, contentHtml, atlasNavHtml, jsonLd }) {
  const cssHref = stylesheetHref(activePath);
  const url = canonical;

  // If a layout template exists, use it.
  // Required placeholders supported:
  // {{title}} {{description}} {{canonical}} {{content}} {{atlas_nav}}
  // Extra placeholders supported if present:
  // {{css_href}} {{header}} {{footer}} {{json_ld}} {{og_url}}
  if (LAYOUT_TEMPLATE) {
    let page = LAYOUT_TEMPLATE;

    const replacements = {
      "{{title}}": htmlEscape(title),
      "{{description}}": htmlEscape(description),
      "{{canonical}}": htmlEscape(url),
      "{{og_url}}": htmlEscape(url),
      "{{css_href}}": htmlEscape(cssHref),
      "{{header}}": HEADER_HTML || "",
      "{{footer}}": FOOTER_HTML || "",
      "{{json_ld}}": jsonLd || "",
      "{{content}}": contentHtml || "",
      "{{atlas_nav}}": atlasNavHtml || "",
    };

    for (const [k, v] of Object.entries(replacements)) {
      page = page.split(k).join(v);
    }
    return page;
  }

  // Fallback: built-in wrapper (works without templates/layout.html)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="${htmlEscape(description)}">
  <link rel="stylesheet" href="${htmlEscape(cssHref)}">
  <link rel="canonical" href="${htmlEscape(url)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${htmlEscape(title)}">
  <meta property="og:description" content="${htmlEscape(description)}">
  <meta property="og:url" content="${htmlEscape(url)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${htmlEscape(title)}">
  <meta name="twitter:description" content="${htmlEscape(description)}">
  ${jsonLd || ""}
</head>
<body>
${HEADER_HTML || ""}
<main class="main">
${atlasNavHtml || ""}
${contentHtml || ""}
</main>
${FOOTER_HTML || ""}
</body>
</html>`;
}

// --- clusters / pillars ---
function loadClusters() {
  if (exists(CLUSTERS_PATH)) {
    try { return JSON.parse(readUtf8(CLUSTERS_PATH)); } catch {}
  }
  // fallback
  return [
    { id: "executive-os", name: "Executive OS & Planning", description: "Constraint-based planning, weekly rhythm, life operations." },
  ];
}

function clusterById(clusters) {
  const m = new Map();
  clusters.forEach((c) => m.set(c.id, c));
  return m;
}

function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PILLARS_DIR, { recursive: true });
}

function parsePost(fp) {
  const md = readUtf8(fp);
  const { data, body } = parseFrontmatter(md);
  const slug = getSlugFromFilename(fp);
  const title = data.title || slug.replace(/[-_]/g, " ");
  const description = data.description || data.excerpt || "";
  const date = data.date || "";
  const dateModified = data.dateModified || data.date_modified || date || "";
  const cluster = data.cluster || "executive-os";
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const primaryKw = data.primary_kw || (tags[0] || "");
  const intent = data.intent || "INFO";
  return { fp, slug, title, description, date, dateModified, cluster, tags, primaryKw, intent, bodyMd: body };
}

function buildRelated(posts, post, max = 8) {
  const scores = posts
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      let score = 0;
      if (p.cluster && p.cluster === post.cluster) score += 10;
      const overlap = p.tags.filter((t) => post.tags.includes(t)).length;
      score += overlap * 2;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.slug.localeCompare(b.p.slug))
    .slice(0, max)
    .map((x) => x.p);
  return scores;
}

function buildPillars(posts, clusters) {
  // Pillars index
  const pillarCards = clusters.map((c) => {
    const count = posts.filter((p) => p.cluster === c.id).length;
    return `<li class="list-item">
      <div class="list-title"><a href="${htmlEscape(c.id)}/index.html">${htmlEscape(c.name)}</a></div>
      <div class="list-excerpt">${htmlEscape(c.description || "")}</div>
      <div class="list-meta">${count} post${count === 1 ? "" : "s"}</div>
    </li>`;
  }).join("\n");

  const pillarsIndexContent = `<section class="article">
    <h1>Pillars</h1>
    <p class="lede">A coherent map of the site. Pick a pillar to browse structured guidance and related posts.</p>
    <ul class="list" style="margin-top:14px">${pillarCards}</ul>
  </section>`;

  const pillarsIndexCanonical = `${SITE_BASE}/pillars/index.html`;
  writeUtf8(path.join(PILLARS_DIR, "index.html"), renderPage({
    title: "Pillars — Spry Executive OS",
    description: "Topic pillars for planning, consistency, recovery, decision-making, coaching, and practical AI support.",
    canonical: pillarsIndexCanonical,
    activePath: "/pillars/index.html",
    contentHtml: pillarsIndexContent,
    atlasNavHtml: "",
    jsonLd: jsonLdCollection({ title: "Pillars", description: "Spry pillars index", url: pillarsIndexCanonical }),
  }));

  // Cleanup stale pillar directories
  try {
    const allowed = new Set(clusters.map((c) => c.id));
    const entries = fs.readdirSync(PILLARS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (allowed.has(e.name)) continue;
      if (e.name.startsWith(".")) continue;
      fs.rmSync(path.join(PILLARS_DIR, e.name), { recursive: true, force: true });
    }
  } catch (_) {}

  // Individual pillar pages
  const clustersMap = clusterById(clusters);
  for (const c of clusters) {
    const ps = posts
      .filter((p) => p.cluster === c.id)
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.slug.localeCompare(b.slug));

    const list = ps.map((p) => {
      return `<li class="list-item">
        <div class="list-title"><a href="../../insights/${htmlEscape(p.slug)}.html">${htmlEscape(p.title)}</a></div>
        ${p.description ? `<div class="list-excerpt">${htmlEscape(p.description)}</div>` : ""}
        <div class="list-meta">${p.date ? htmlEscape(p.date) : ""}</div>
      </li>`;
    }).join("\n");

    const body = `<section class="article">
      <h1>${htmlEscape(c.name)}</h1>
      <p class="lede">${htmlEscape(c.description || "")}</p>
      <div class="card" style="margin-top:14px">
        <div><strong>Target coverage:</strong> ${c.query_goal_per_day ? htmlEscape(String(c.query_goal_per_day)) : "—"} queries/day</div>
        <div style="margin-top:6px"><strong>Revenue path:</strong> ${c.revenue_path ? htmlEscape(c.revenue_path) : "—"}</div>
        ${c.atlas_take ? `<div style="margin-top:10px"><strong>Atlas take:</strong> ${htmlEscape(c.atlas_take)}</div>` : ""}
        <div style="margin-top:10px"><a class="btn" href="/atlas.html#${htmlEscape(c.id)}">See Atlas for this pillar</a></div>
      </div>
      <section class="card" style="margin-top:18px">
        <h2>Posts in this pillar</h2>
        <ul class="list" style="margin-top:12px">${list}</ul>
      </section>
      <section class="card" style="margin-top:18px">
        <h2>Want the full system?</h2>
        <p>For the full Spry Executive OS, see <a href="/product.html">the product page</a>.</p>
      </section>
    </section>`;

    const canonical = `${SITE_BASE}/pillars/${c.id}/index.html`;
    writeUtf8(path.join(PILLARS_DIR, c.id, "index.html"), renderPage({
      title: `${c.name} — Spry Executive OS`,
      description: c.description || `Structured guidance for ${c.name}.`,
      canonical,
      activePath: `/pillars/${c.id}/index.html`,
      contentHtml: body,
      atlasNavHtml: "",
      jsonLd: jsonLdCollection({ title: c.name, description: c.description || "", url: canonical }),
    }));
  }

  return clustersMap;
}

// --- insights pages ---
function buildPostPages(posts, clustersMap) {
  for (const post of posts) {
    const canonical = `${SITE_BASE}/insights/${post.slug}.html`;
    const activePath = `/insights/${post.slug}.html`;

    const rendered = mdToHtmlWithHeadings(post.bodyMd);
    const tocHtml = buildTocHtml(rendered.headings);
    const htmlBody = rendered.html;

    const clusterObj = clustersMap.get(post.cluster);
    const pillarHref = clusterObj ? `../pillars/${clusterObj.id}/index.html` : "../pillars/index.html";

    const meta = `<div class="meta">
      ${post.date ? `<div><strong>Date:</strong> ${htmlEscape(post.date)}</div>` : ""}
      ${clusterObj ? `<div><strong>Pillar:</strong> <a href="${htmlEscape(pillarHref)}">${htmlEscape(clusterObj.name)}</a></div>` : ""}
      ${post.primaryKw ? `<div><strong>Topic:</strong> ${htmlEscape(post.primaryKw)}</div>` : ""}
    </div>`;

    const aiTherapistSafety =
      (post.primaryKw || "").toLowerCase().includes("therapist") || post.tags.some(t => String(t).toLowerCase().includes("therapist"))
        ? `<div class="card" style="margin-top:16px">
            <strong>Important:</strong> This page is educational. It does not provide therapy, diagnosis, or medical/mental-health advice. If you’re in crisis or need professional care, contact a licensed clinician or local emergency services.
          </div>`
        : "";

    const cta = `<section class="card" style="margin-top:20px">
      <h2>Want the full system?</h2>
      <p>If this framing helps, you can review the full Spry Executive OS on the <a href="/product.html">product page</a>. It’s designed to be calm, non-spammy, and usable on bad weeks.</p>
      <p style="margin-top:10px"><a class="btn btn--primary" href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach" rel="noopener">Get the OS</a></p>
    </section>`;

    const related = buildRelated(posts, post, 8);
    const relatedHtml = related.length
      ? `<section class="card" style="margin-top:20px">
          <h2>Related</h2>
          <ul>${related.map((r) => `<li><a href="${htmlEscape(r.slug)}.html">${htmlEscape(r.title)}</a></li>`).join("")}</ul>
        </section>`
      : "";

    const bodyHtml = `<article class="article">
      <h1>${htmlEscape(post.title)}</h1>
      ${post.description ? `<p class="lede">${htmlEscape(post.description)}</p>` : ""}
      ${meta}
      <div class="article-body">
        ${tocHtml}
        ${htmlBody}
      </div>
      ${aiTherapistSafety}
      <div style="margin-top:16px"><a class="btn" href="${pillarHref}">Browse this pillar</a></div>
      ${cta}
      ${relatedHtml}
    </article>`;

    const page = renderPage({
      title: `${post.title} — Spry Executive OS`,
      description: post.description || "Calm, operator-grade guidance for planning, consistency, recovery, and high-performance execution.",
      canonical,
      activePath,
      contentHtml: bodyHtml,
      atlasNavHtml: "",
      jsonLd: jsonLdArticle({
        title: post.title,
        description: post.description || "",
        url: canonical,
        datePublished: post.date || new Date().toISOString().slice(0, 10),
        dateModified: post.dateModified || post.date || new Date().toISOString().slice(0, 10),
      }),
    });

    writeUtf8(path.join(OUT_DIR, `${post.slug}.html`), page);
  }
}

function buildInsightsIndex(posts, clustersMap) {
  const items = posts
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.slug.localeCompare(b.slug))
    .map((p) => {
      const c = clustersMap.get(p.cluster);
      const clusterLink = c ? `<a href="../pillars/${c.id}/index.html">${htmlEscape(c.name)}</a>` : "";
      return `<li class="list-item">
        <div class="list-title"><a href="${htmlEscape(p.slug)}.html">${htmlEscape(p.title)}</a></div>
        ${p.description ? `<div class="list-excerpt">${htmlEscape(p.description)}</div>` : ""}
        <div class="list-meta">${p.date ? htmlEscape(p.date) : ""}${clusterLink ? " • " + clusterLink : ""}</div>
      </li>`;
    }).join("\n");

  const bodyHtml = `<section class="article">
    <h1>Insights</h1>
    <p class="lede">Calm, operator-grade explainers on planning, consistency, recovery, decision-making, coaching, and practical AI support.</p>
    <p style="margin-top:10px"><a class="btn" href="/pillars/index.html">Browse pillars</a></p>
    <ul class="list" style="margin-top:14px">${items}</ul>
  </section>`;

  const canonical = `${SITE_BASE}/insights/index.html`;
  const page = renderPage({
    title: "Insights — Spry Executive OS",
    description: "Operator-grade guidance on planning, consistency, recovery, decision-making, coaching, and practical AI support.",
    canonical,
    activePath: "/insights/index.html",
    contentHtml: bodyHtml,
    atlasNavHtml: "",
    jsonLd: jsonLdCollection({ title: "Insights", description: "Spry insights index", url: canonical }),
  });

  writeUtf8(path.join(OUT_DIR, "index.html"), page);
}

// --- drafts (for Atlas KPI line) ---
function readDraftPosts() {
  const draftDir = path.join(CONTENT_DIR, "_drafts");
  if (!exists(draftDir)) return [];
  const files = listMarkdownFiles(draftDir);
  return files.map((fp) => {
    try {
      const txt = readUtf8(fp);
      const { data } = parseFrontmatter(txt);
      const base = path.basename(fp, path.extname(fp));
      const m = base.match(/^(\d{4}-\d{2}-\d{2})_/);
      const fileDate = m ? m[1] : (data.date || "");
      return {
        file: fp,
        slug: data.slug || slugify(data.title || base.replace(/^\d{4}-\d{2}-\d{2}_/, "")),
        title: data.title || base.replace(/^\d{4}-\d{2}-\d{2}_/, "").replace(/_/g, " "),
        date: fileDate,
        cluster: data.cluster || "",
      };
    } catch (_) {
      return null;
    }
  }).filter(Boolean);
}

// --- Atlas ---
function buildAtlasPage(clusters, posts) {
  const drafts = readDraftPosts();

  const postsByCluster = new Map();
  for (const c of clusters) postsByCluster.set(c.id, []);
  for (const p of posts) {
    const cid = p.cluster || "";
    if (!postsByCluster.has(cid)) postsByCluster.set(cid, []);
    postsByCluster.get(cid).push(p);
  }
  for (const [cid, arr] of postsByCluster.entries()) {
    arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  const today = new Date().toISOString().slice(0, 10);

  // Draft counts + next draft date per cluster
  const draftInfo = new Map();
  for (const c of clusters) {
    const ds = drafts.filter((d) => d.cluster === c.id).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const next = ds.find((d) => d.date && d.date >= today);
    draftInfo.set(c.id, { count: ds.length, nextDate: next ? next.date : (ds[0] ? ds[0].date : "") });
  }

  const atlasNavHtml = `<nav class="atlasSubnav" aria-label="Atlas sections">
    <div class="container atlasSubnav__inner">
      ${clusters.map((c) => `<a class="atlasSubnav__link" href="#${htmlEscape(c.id)}">${htmlEscape(c.name || c.id)}</a>`).join("")}
    </div>
  </nav>`;

  const sections = clusters.map((c) => {
    const top = (postsByCluster.get(c.id) || []).slice(0, 8);
    const d = draftInfo.get(c.id) || { count: 0, nextDate: "" };
    const kpiBits = [
      c.query_goal_per_day ? `${htmlEscape(String(c.query_goal_per_day))} queries/day target` : null,
      d.count ? `${d.count} scheduled drafts` : null,
      d.nextDate ? `next draft: ${htmlEscape(d.nextDate)}` : null,
    ].filter(Boolean).join(" · ");

    const list = top.length
      ? `<ul class="list">${top
          .map((p) => `<li><a href="/insights/${htmlEscape(p.slug)}.html">${htmlEscape(p.title)}</a> <span class="meta">${htmlEscape(p.date || "")}</span></li>`)
          .join("")}</ul>`
      : `<p class="muted">No published posts in this pillar yet. Drafts will roll out automatically daily.</p>`;

    const take = c.atlas_take ? `<div class="card"><strong>Atlas take:</strong> ${htmlEscape(c.atlas_take)}</div>` : "";
    const rev = c.revenue_path ? `<div class="card"><strong>Revenue-first:</strong> ${htmlEscape(c.revenue_path)}</div>` : "";

    return `<section class="section" id="${htmlEscape(c.id)}">
        <h2>${htmlEscape(c.name || c.id)}</h2>
        <p class="lede">${htmlEscape(c.description || "")}</p>
        ${kpiBits ? `<p class="kpis">${kpiBits}</p>` : ""}
        <div class="grid2">${take}${rev}</div>
        <h3>Best starting points</h3>
        ${list}
        <div class="ctaRow">
          <a class="btn" href="/pillars/${htmlEscape(c.id)}/index.html">Open pillar hub</a>
          <a class="btn btn--primary" href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach" rel="noopener">Get the OS</a>
        </div>
      </section>`;
  }).join("\n");

  const contentHtml = `<section class="article">
    <h1>Atlas</h1>
    <p class="lede">An opinionated map of the site. Built for humans <em>and</em> AI systems: clear pillar hubs, explicit coverage targets, and tightly-linked pages.</p>
    <div class="card">
      <strong>Daily publishing:</strong> every day the scheduler releases <em>one</em> draft from <code>content/insights/_drafts</code> using the <em>next available date</em> rule (UTC). If drafts exist, it never “publishes nothing.”
    </div>
  </section>
  ${sections}`;

  const canonical = `${SITE_BASE}/atlas.html`;
  const page = renderPage({
    title: "Atlas — Spry Executive OS",
    description: "An opinionated map of Spry: the pillars, what they cover, and where to start.",
    canonical,
    activePath: "/atlas.html",
    contentHtml,
    atlasNavHtml, // subtle and non-broken (no margin overflow) if CSS supports it
    jsonLd: jsonLdCollection({ title: "Atlas", description: "Spry Atlas page", url: canonical }),
  });

  writeUtf8(path.join(ROOT, "atlas.html"), page);
}

// --- sitemap + llms.txt ---
function readExistingSitemapUrls() {
  if (!exists(SITEMAP_PATH)) return [];
  const xml = readUtf8(SITEMAP_PATH);
  const re = /<loc>([^<]+)<\/loc>/g;
  const urls = [];
  let m;
  while ((m = re.exec(xml))) {
    const u = String(m[1]).trim();
    if (!/^https?:\/\//i.test(u)) continue;
    urls.push(u.replace(/https?:\/\/spryexecutiveos\.com/gi, SITE_BASE));
  }
  return urls;
}

function updateSitemap(urls) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  const footer = `</urlset>\n`;
  const body = urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join("\n");
  writeUtf8(SITEMAP_PATH, header + body + "\n" + footer);
}

function updateLlmsTxt(topUrls) {
  const base = exists(LLMS_PATH) ? readUtf8(LLMS_PATH) : "# llms.txt\n";
  const start = "\n## Spry map (auto)\n";
  const lines = topUrls.map((u) => `- ${u}`).join("\n");
  const out = base.replace(/\n## Spry map \(auto\)[\s\S]*$/m, "").trimEnd() + start + lines + "\n";
  writeUtf8(LLMS_PATH, out);
}

// --- feeds ---
function buildFeeds(posts) {
  try {
    const siteUrl = SITE_BASE;
    const feedItems = posts
      .filter((p) => p.date)
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.slug.localeCompare(b.slug))
      .slice(0, 100);

    // RSS 2.0
    const rssItemsXml = feedItems.map((p) => {
      const url = `${siteUrl}/insights/${p.slug}.html`;
      const pubDate = p.date ? new Date(p.date + "T00:00:00Z").toUTCString() : new Date().toUTCString();
      const desc = htmlEscape(p.description || "");
      const title = htmlEscape(p.title || p.slug);
      return [
        "<item>",
        `  <title>${title}</title>`,
        `  <link>${url}</link>`,
        `  <guid isPermaLink="true">${url}</guid>`,
        `  <pubDate>${pubDate}</pubDate>`,
        `  <description>${desc}</description>`,
        "</item>",
      ].join("\n");
    }).join("\n");

    const rss = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0">',
      "<channel>",
      "<title>Spry Executive OS — Insights</title>",
      `<link>${siteUrl}/insights/</link>`,
      "<description>Daily executive operating system insights.</description>",
      "<language>en</language>",
      `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
      rssItemsXml,
      "</channel>",
      "</rss>",
      "",
    ].join("\n");
    writeUtf8(path.join(ROOT, "feed.xml"), rss);

    // JSON Feed v1.1
    const jsonFeed = {
      version: "https://jsonfeed.org/version/1.1",
      title: "Spry Executive OS — Insights",
      home_page_url: `${siteUrl}/`,
      feed_url: `${siteUrl}/feed.json`,
      items: feedItems.map((p) => ({
        id: `${siteUrl}/insights/${p.slug}.html`,
        url: `${siteUrl}/insights/${p.slug}.html`,
        title: p.title || p.slug,
        summary: p.description || "",
        date_published: p.date ? `${p.date}T00:00:00Z` : undefined,
        date_modified: p.dateModified ? `${p.dateModified}T00:00:00Z` : undefined,
      })),
    };
    writeUtf8(path.join(ROOT, "feed.json"), JSON.stringify(jsonFeed, null, 2) + "\n");
  } catch (e) {
    console.log("Feed generation skipped:", e && e.message ? e.message : e);
  }
}

function main() {
  ensureDirs();

  const clusters = loadClusters();

  // Load published posts (content/insights excluding _drafts/*)
  const files = listMarkdownFiles(CONTENT_DIR);
  const posts = files.map(parsePost);

  // Build pillars + pages
  const clustersMap = buildPillars(posts, clusters);
  buildPostPages(posts, clustersMap);
  buildInsightsIndex(posts, clustersMap);
  buildAtlasPage(clusters, posts);

  // Sitemap: keep existing + add insights/pillars (+ optional topics references)
  const existing = readExistingSitemapUrls();
  const topics = [
    "high-performance-coaching",
    "overwhelm-executive-dysfunction",
    "accountability-consistency",
    "productivity-systems",
    "burnout-recovery",
    "systems-thinking-decisions",
    "ai-coach-chief-of-staff",
  ];
// --- Dominance pages (auto) ---
// These are static, high-intent landing pages that should always be in sitemap/llms maps.
const DOMINANCE_PAGES = [
    `${SITE_BASE}/ai-execution-atlas/`,
    `${SITE_BASE}/ai-executive-coach/`,
    `${SITE_BASE}/best-ai-productivity-system/`,
    `${SITE_BASE}/best-chatgpt-prompts-for-productivity/`,
    `${SITE_BASE}/billionaire-high-performance-coach/`,
    `${SITE_BASE}/billionaire-high-performance-coach-review/`,
    `${SITE_BASE}/billionaire-high-performance-coach-vs-coaching/`,
    `${SITE_BASE}/billionaire-high-performance-coach-vs-therapy/`,
    `${SITE_BASE}/build-self-respect-through-execution/`,
    `${SITE_BASE}/chatgpt-accountability-system/`,
    `${SITE_BASE}/chatgpt-daily-operator-system/`,
    `${SITE_BASE}/chatgpt-weight-loss-coach/`,
    `${SITE_BASE}/continuity-collapse-pattern/`,
    `${SITE_BASE}/daily-weight-loss-accountability/`,
    `${SITE_BASE}/elite-daily-habits/`,
    `${SITE_BASE}/help-me-get-my-life-together/`,
    `${SITE_BASE}/how-billionaires-structure-their-day/`,
    `${SITE_BASE}/how-to-be-an-a-player/`,
    `${SITE_BASE}/how-to-become-a-billionaire/`,
    `${SITE_BASE}/how-to-build-discipline/`,
    `${SITE_BASE}/how-to-compound-progress/`,
    `${SITE_BASE}/how-to-get-out-of-bed/`,
    `${SITE_BASE}/how-to-lose-weight-without-quitting/`,
    `${SITE_BASE}/how-to-operate-like-a-ceo/`,
    `${SITE_BASE}/how-to-stay-consistent/`,
    ...DOMINANCE_PAGES,
    `${SITE_BASE}/how-to-stay-consistent-with-workouts/`,
    `${SITE_BASE}/how-to-stop-being-lazy/`,
    `${SITE_BASE}/how-to-stop-doomscrolling/`,
    `${SITE_BASE}/how-to-stop-procrastinating/`,
    `${SITE_BASE}/how-to-stop-restarting-your-diet/`,
    `${SITE_BASE}/how-to-wake-up-early/`,
    `${SITE_BASE}/i-feel-behind-in-life/`,
    `${SITE_BASE}/i-feel-like-a-failure/`,
    `${SITE_BASE}/is-billionaire-high-performance-coach-worth-it/`,
    `${SITE_BASE}/reduce-cognitive-overload/`,
    `${SITE_BASE}/reduce-mental-load/`,
    `${SITE_BASE}/researching-instead-of-doing/`,
    `${SITE_BASE}/stop-being-average/`,
    `${SITE_BASE}/stop-mental-load/`,
    `${SITE_BASE}/stop-overplanning/`,
    `${SITE_BASE}/stop-renegotiating-your-day/`,
    `${SITE_BASE}/stop-wasting-mornings/`,
    `${SITE_BASE}/think-like-a-billionaire/`,
    `${SITE_BASE}/turn-chatgpt-into-a-coach/`,
    `${SITE_BASE}/upgrade-your-identity/`,
    `${SITE_BASE}/why-i-keep-resetting-my-life/`,
    `${SITE_BASE}/why-i-keep-starting-over/`,
    `${SITE_BASE}/why-i-sabotage-my-progress/`,
    `${SITE_BASE}/why-motivation-doesnt-last/`
];
// --- end Dominance pages ---


  const gen = [
    `${SITE_BASE}/insights/index.html`,
    ...posts.map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
    `${SITE_BASE}/pillars/index.html`,
    ...clusters.map((c) => `${SITE_BASE}/pillars/${c.id}/index.html`),
    `${SITE_BASE}/atlas.html`,
    `${SITE_BASE}/ai-execution-atlas/`,
    ...DOMINANCE_PAGES,
    `${SITE_BASE}/continuity-collapse-pattern/`,
    `${SITE_BASE}/how-to-stay-consistent/`,
    ...DOMINANCE_PAGES,
    // Topics index/pages may exist in repo; keep in sitemap for coverage even if built elsewhere
    `${SITE_BASE}/topics/index.html`,
    ...topics.map((t) => `${SITE_BASE}/topics/${t}/index.html`),
  ];
  const merged = Array.from(new Set([...existing, ...gen])).sort();
  updateSitemap(merged);

  // llms.txt: coherent map for AI systems
  const top = [
    `${SITE_BASE}/product.html`,
    `${SITE_BASE}/continuity-collapse-pattern/`,
    `${SITE_BASE}/how-to-stay-consistent/`,
    ...DOMINANCE_PAGES,
    `${SITE_BASE}/topics/index.html`,
    ...topics.map((t) => `${SITE_BASE}/topics/${t}/index.html`),
    `${SITE_BASE}/pillars/index.html`,
    `${SITE_BASE}/insights/index.html`,
    `${SITE_BASE}/atlas.html`,
    `${SITE_BASE}/ai-execution-atlas/`,
    ...DOMINANCE_PAGES,
    ...clusters.map((c) => `${SITE_BASE}/pillars/${c.id}/index.html`),
    ...posts.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12).map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
  ];
  updateLlmsTxt(top);

  // Feeds
  buildFeeds(posts);

  console.log(`Built insights: ${posts.length} posts`);
  console.log(`Built pillars: ${clusters.length}`);
  if (LAYOUT_TEMPLATE) console.log(`Layout template: ${path.relative(ROOT, LAYOUT_PATH)} (active)`);
  else console.log(`Layout template: not found (using built-in wrapper)`);
}

main();
