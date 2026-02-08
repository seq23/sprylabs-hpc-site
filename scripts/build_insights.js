#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "insights");
const OUT_DIR = path.join(ROOT, "insights");
const PILLARS_DIR = path.join(ROOT, "pillars");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const LLMS_PATH = path.join(ROOT, "llms.txt");
const CLUSTERS_PATH = path.join(CONTENT_DIR, "_clusters.json");

// Canonical base for this site
const SITE_BASE = "https://spryexecutiveos.com";

// --- utils ---
function readUtf8(p) { return fs.readFileSync(p, "utf8"); }
function writeUtf8(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, "utf8"); }
function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


function mdToHtml(md) {
  // Minimal Markdown rendering for our use-case:
  // - headings, paragraphs, links, inline code, unordered lists, bold/italic
  // - deterministic + dependency-free (works in GitHub Actions without npm install)
  let s = String(md || "").replace(/\r\n/g, "\n");

  // code fences -> pre/code (no highlighting)
  s = s.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${htmlEscape(code.trim())}</code></pre>`);

  // headings
  s = s.replace(/^###\s+(.*)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.*)$/gm, "<h2>$1</h2>");
  s = s.replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");

  // unordered lists (very small)
  // convert blocks of "- item" into <ul><li>..</li></ul>
  s = s.replace(/(?:^|\n)(- .*(?:\n- .*)+)/g, (m) => {
    const items = m.trim().split(/\n/).map(line => line.replace(/^-\s+/, "").trim());
    return `\n<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
  });

  // bold/italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, txt, url) => `<a href="${htmlEscape(url)}">${htmlEscape(txt)}</a>`);

  // paragraphs: split on blank lines
  const parts = s.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const out = parts.map(p => {
    if (p.startsWith("<h1") || p.startsWith("<h2") || p.startsWith("<h3") || p.startsWith("<ul") || p.startsWith("<pre")) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  return out;
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
    const k = m[1];
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

function readNavFromIndex() {
  // Reuse the site's existing header as the source of truth.
  const indexPath = path.join(ROOT, "index.html");
  const html = readUtf8(indexPath);
  const m = html.match(/<header[\s\S]*<\/header>/i);
  return m ? m[0] : "";
}

function readFooterFromIndex() {
  const indexPath = path.join(ROOT, "index.html");
  const html = readUtf8(indexPath);
  const m = html.match(/<footer[\s\S]*<\/footer>/i);
  return m ? m[0] : `<footer><div class="footer-grid"><div><a href="/product.html">See the system</a></div></div></footer>`;
}

const HEADER_HTML = readNavFromIndex();
const FOOTER_HTML = readFooterFromIndex();

function stylesheetHref(activePath) {
  // activePath is a site-root relative path like "/insights/foo.html" or "/pillars/<slug>/index.html"
  // Depth matters:
  // - /insights/<file>.html        -> ../assets/site.css
  // - /pillars/<slug>/index.html   -> ../../assets/site.css
  if (activePath.startsWith("/pillars/")) return "../../assets/site.css";
  if (activePath.startsWith("/insights/")) return "../assets/site.css";
  return "assets/site.css";
}

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

function wrapPage({ title, description, canonical, activePath, bodyHtml, jsonLd }) {
  const css = stylesheetHref(activePath);
  const url = canonical;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(title)}</title>
  <meta name="description" content="${htmlEscape(description)}">
  <link rel="stylesheet" href="${css}">
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
${HEADER_HTML}
<main class="main">
${bodyHtml}
</main>
${FOOTER_HTML}
</body>
</html>`;
}

function parsePost(fp) {
  const md = readUtf8(fp);
  const { data, body } = parseFrontmatter(md);
  const slug = getSlugFromFilename(fp);
  const title = data.title || slug;
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

function ensureDirs() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PILLARS_DIR, { recursive: true });
}

function buildPostPages(posts, clustersMap) {
  for (const post of posts) {
    const canonical = `${SITE_BASE}/insights/${post.slug}.html`;
    const activePath = `/insights/${post.slug}.html`;
    const htmlBody = mdToHtml(post.bodyMd);

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
        ${htmlBody}
      </div>
      ${aiTherapistSafety}
      <div style="margin-top:16px"><a class="btn" href="${pillarHref}">Browse this pillar</a></div>
      ${cta}
      ${relatedHtml}
    </article>`;

    const page = wrapPage({
      title: `${post.title} — Spry Executive OS`,
      description: post.description || "Calm, operator-grade guidance for planning, consistency, recovery, and high-performance execution.",
      canonical,
      activePath,
      bodyHtml,
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
  const page = wrapPage({
    title: "Insights — Spry Executive OS",
    description: "Operator-grade guidance on planning, consistency, recovery, decision-making, coaching, and practical AI support.",
    canonical,
    activePath: "/insights/index.html",
    bodyHtml,
    jsonLd: jsonLdCollection({ title: "Insights", description: "Spry insights index", url: canonical }),
  });

  writeUtf8(path.join(OUT_DIR, "index.html"), page);
}

function buildPillars(posts, clusters) {
  const clustersMap = clusterById(clusters);

  // Pillars index
  const pillarCards = clusters.map((c) => {
    const count = posts.filter((p) => p.cluster === c.id).length;
    return `<li class="list-item">
      <div class="list-title"><a href="${htmlEscape(c.id)}/index.html">${htmlEscape(c.name)}</a></div>
      <div class="list-excerpt">${htmlEscape(c.description || "")}</div>
      <div class="list-meta">${count} post${count === 1 ? "" : "s"}</div>
    </li>`;
  }).join("\n");

  const pillarsIndexBody = `<section class="article">
    <h1>Pillars</h1>
    <p class="lede">A coherent map of the site. Pick a pillar to browse structured guidance and related posts.</p>
    <ul class="list" style="margin-top:14px">${pillarCards}</ul>
  </section>`;

  const pillarsIndexCanonical = `${SITE_BASE}/pillars/index.html`;
  writeUtf8(path.join(PILLARS_DIR, "index.html"), wrapPage({
    title: "Pillars — Spry Executive OS",
    description: "Topic pillars for planning, consistency, recovery, decision-making, coaching, and practical AI support.",
    canonical: pillarsIndexCanonical,
    activePath: "/pillars/index.html",
    bodyHtml: pillarsIndexBody,
    jsonLd: jsonLdCollection({ title: "Pillars", description: "Spry pillars index", url: pillarsIndexCanonical }),
  }));

  // Individual pillar pages
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

    const note =
      c.id === "ai-support"
        ? `<div class="card" style="margin-top:14px">
            <strong>Note on “AI therapist” queries:</strong> this pillar captures that search demand, but every page is written as <em>education + structured self-reflection</em> — not therapy or clinical guidance.
          </div>`
        : "";

    const bodyHtml = `<section class="article">
      <h1>${htmlEscape(c.name)}</h1>
      <p class="lede">${htmlEscape(c.description || "")}</p>
      ${note}
      <section class="card" style="margin-top:18px">
        <h2>Posts in this pillar</h2>
        <ul class="list" style="margin-top:12px">${list}</ul>
      </section>
      <section class="card" style="margin-top:18px">
        <h2>Want the full system?</h2>
        <p>For the full Spry Executive OS (not spammy, designed for real life), see <a href="/product.html">the product page</a>.</p>
      </section>
    </section>`;

    const canonical = `${SITE_BASE}/pillars/${c.id}/index.html`;
    writeUtf8(path.join(PILLARS_DIR, c.id, "index.html"), wrapPage({
      title: `${c.name} — Spry Executive OS`,
      description: c.description || `Structured guidance for ${c.name}.`,
      canonical,
      activePath: `/pillars/${c.id}/index.html`,
      bodyHtml,
      jsonLd: jsonLdCollection({ title: c.name, description: c.description || "", url: canonical }),
    }));
  }

  return clustersMap;
}

function readExistingSitemapUrls() {
  if (!exists(SITEMAP_PATH)) return [];
  const xml = readUtf8(SITEMAP_PATH);
  const re = /<loc>([^<]+)<\/loc>/g;
  const urls = [];
  let m;
  while ((m = re.exec(xml))) {
    const u = String(m[1]).trim();
    // Only keep absolute URLs. Relative loc entries dilute SEO and break canonical intent.
    if (!/^https?:\/\//i.test(u)) continue;
    // Normalize any spry domain casing.
    urls.push(u.replace(/https?:\/\/SpryExecutiveOS\.com/gi, SITE_BASE).replace(/https?:\/\/spryexecutiveos\.com/gi, SITE_BASE));
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

function main() {
  ensureDirs();

  const clusters = loadClusters();
  const clustersMap = buildPillars([], clusters); // create dirs + index even if no posts yet

  const files = listMarkdownFiles(CONTENT_DIR);
  const posts = files.map(parsePost);

  // rebuild pillars now that we have posts
  const clustersMap2 = buildPillars(posts, clusters);

  // Build pages
  buildPostPages(posts, clustersMap2);
  buildInsightsIndex(posts, clustersMap2);

  // Update sitemap: keep existing + add insights/pillars
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

  const gen = [
    `${SITE_BASE}/insights/index.html`,
    ...posts.map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
    `${SITE_BASE}/pillars/index.html`,
    ...clusters.map((c) => `${SITE_BASE}/pillars/${c.id}/index.html`),
    `${SITE_BASE}/topics/index.html`,
    ...topics.map((t) => `${SITE_BASE}/topics/${t}/index.html`),
  ];
  const merged = Array.from(new Set([...existing, ...gen])).sort();
  updateSitemap(merged);

  // Update llms.txt with a coherent map
  const top = [
    `${SITE_BASE}/product.html`,
    `${SITE_BASE}/topics/index.html`,
    ...topics.map((t) => `${SITE_BASE}/topics/${t}/index.html`),
    `${SITE_BASE}/pillars/index.html`,
    `${SITE_BASE}/insights/index.html`,
    ...clusters.map((c) => `${SITE_BASE}/pillars/${c.id}/index.html`),
    ...posts.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 12).map((p) => `${SITE_BASE}/insights/${p.slug}.html`),
  ];
  updateLlmsTxt(top);

  console.log(`Built insights: ${posts.length} posts`);
  console.log(`Built pillars: ${clusters.length}`);
}

main();
