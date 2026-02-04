#!/usr/bin/env node
/**
 * Build Insights section from /content/insights/*.md|*.txt into /insights/*.html
 * - Normalizes filenames (slugified) and preserves/derives title/description/date
 * - Generates:
 *   - insights/index.html (hub)
 *   - insights/<slug>.html (articles)
 *   - updates sitemap.xml (adds insights URLs)
 *   - updates llms.txt (adds insights URLs block)
 *
 * Zero dependencies. Designed for GitHub Actions + local use.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "insights");
const OUT_DIR = path.join(ROOT, "insights");
const SITE_ORIGIN = "https://spryexecutiveos.com";
const GUMROAD_URL = "https://sprylabs.gumroad.com/l/billionaire-high-performance-coach";

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")              // accents
    .replace(/[^a-z0-9]+/g, "-")                  // non-alnum -> -
    .replace(/^-+|-+$/g, "")                      // trim -
    .replace(/-{2,}/g, "-");
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}
function writeText(p, s) {
  fs.writeFileSync(p, s, "utf8");
}

function parseFrontmatter(raw) {
  // very small YAML-ish frontmatter parser: key: "value"
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };
  const fm = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, "");
  const meta = {};
  fm.split("\n").forEach(line => {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)\s*$/);
    if (!m) return;
    const k = m[1].trim();
    let v = m[2].trim();
    v = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    meta[k] = v;
  });
  return { meta, body };
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(s) {
  // links: [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2">$1</a>`);
  // bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, `<strong>$1</strong>`);
  // italic *x*
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, `$1<em>$2</em>`);
  // code `x`
  s = s.replace(/`([^`]+)`/g, `<code>$1</code>`);
  return s;
}

function mdToHtml(md) {
  // Minimal markdown: headings, lists, blockquotes, code fences, paragraphs
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];

  function closeList() {
    if (inList) {
      html += "</ul>\n";
      inList = false;
    }
  }
  function closeCode() {
    if (inCode) {
      const code = escapeHtml(codeBuf.join("\n"));
      html += `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ""}>${code}</code></pre>\n`;
      inCode = false;
      codeLang = "";
      codeBuf = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // code fence
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      if (!inCode) {
        closeList();
        inCode = true;
        codeLang = fence[1] || "";
      } else {
        closeCode();
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      const text = inlineFormat(escapeHtml(h[2].trim()));
      html += `<h${level}>${text}</h${level}>\n`;
      continue;
    }

    // list item
    const li = line.match(/^\s*-\s+(.*)$/);
    if (li) {
      if (!inList) {
        closeCode();
        html += "<ul>\n";
        inList = true;
      }
      const item = inlineFormat(escapeHtml(li[1].trim()));
      html += `<li>${item}</li>\n`;
      continue;
    } else {
      closeList();
    }

    // blockquote
    const bq = line.match(/^\s*>\s+(.*)$/);
    if (bq) {
      const q = inlineFormat(escapeHtml(bq[1].trim()));
      html += `<blockquote>${q}</blockquote>\n`;
      continue;
    }

    // blank line
    if (line.trim() === "") {
      html += "\n";
      continue;
    }

    // paragraph
    const p = inlineFormat(escapeHtml(line.trim()));
    html += `<p>${p}</p>\n`;
  }

  closeList();
  closeCode();
  return html.trim() + "\n";
}

function pickExcerpt(text, maxLen = 170) {
  const clean = text
    .replace(/---[\s\S]*?---/g, " ")
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/[#>*-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function navHtml(active) {
  // matches existing site nav classes
  const items = [
    { href: "/index.html", label: "Home", key: "home" },
    { href: "/answers/index.html", label: "Answers", key: "answers" },
    { href: "/insights/index.html", label: "Insights", key: "insights" },
    { href: "/start-here.html", label: "Start Here", key: "start" },
    { href: "/atlas.html", label: "Atlas", key: "atlas" },
    { href: "/product.html", label: "Product", key: "product" },
    { href: "/faq.html", label: "FAQ", key: "faq" },
    { href: "/legal.html", label: "Legal", key: "legal" },
  ];
  return `<nav>\n${items
    .map((x) => {
      const cls = x.key === active ? "nav__link nav__link--active" : "nav__link";
      return `<a class="${cls}" href="${x.href}">${x.label}</a>`;
    })
    .join("\n")}\n</nav>`;
}

function footerHtml() {
  return `<footer class="footer">
  <div class="wrap">
    <div class="footer__cta">
      <div class="footer__cta__title">Official checkout</div>
      <a class="btn" href="${GUMROAD_URL}">Billionaire High Performance Coach (Gumroad)</a>
    </div>
    <div class="footer__fine">
      Educational and organizational content only. Not medical, psychological, legal, or financial advice.
      <br/>No outcomes are guaranteed; results vary based on individual use and circumstances.
    </div>
    <div class="footer__links">
      <a href="/index.html">Home</a> ·
      <a href="/start-here.html">Start Here</a> ·
      <a href="/answers/index.html">Answers</a> ·
      <a href="/insights/index.html">Insights</a> ·
      <a href="/atlas.html">Atlas</a> ·
      <a href="/what-is-this-system.html">What is this?</a> ·
      <a href="/product.html">Product</a> ·
      <a href="/faq.html">FAQ</a> ·
      <a href="/legal.html">Legal</a>
    </div>
  </div>
</footer>`;
}

function pageHtml({ title, description, canonicalPath, bodyHtml, activeNav }) {
  const canonical = `${SITE_ORIGIN}${canonicalPath}`;
  const desc = description || "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)} — Spry Executive OS</title>
  <meta name="description" content="${escapeHtml(desc)}"/>
  <link rel="canonical" href="${canonical}"/>
  <meta property="og:type" content="article"/>
  <meta property="og:title" content="${escapeHtml(title)}"/>
  <meta property="og:description" content="${escapeHtml(desc)}"/>
  <meta property="og:url" content="${canonical}"/>
  <link rel="stylesheet" href="/assets/styles.css"/>
</head>
<body>
  <header class="header">
    <div class="wrap header__inner">
      <a class="brand" href="/index.html">Spry Executive OS</a>
      ${navHtml(activeNav)}
    </div>
  </header>

  <main class="main">
    <div class="wrap">
      <article class="card prose">
        ${bodyHtml}
      </article>

      <section class="card" style="margin-top:16px">
        <h2 style="margin-top:0">Want the full implementation (not inspiration)?</h2>
        <p>If you want the complete step-by-step operating system—daily structure, templates, and execution rules—this is the paid implementation:</p>
        <p><a class="btn" href="${GUMROAD_URL}">Billionaire High Performance Coach (Gumroad)</a></p>
      </section>
    </div>
  </main>

  ${footerHtml()}
</body>
</html>`;
}

function normalizeInsightFilenames() {
  if (!fs.existsSync(CONTENT_DIR)) return;
  const files = fs.readdirSync(CONTENT_DIR).filter(f => /\.(md|txt)$/i.test(f));
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const base = path.basename(f, ext);
    const slug = slugify(base);
    const target = `${slug}${ext}`;
    if (target !== f) {
      fs.renameSync(path.join(CONTENT_DIR, f), path.join(CONTENT_DIR, target));
      console.log(`renamed: ${f} -> ${target}`);
    }
  }
}

function buildInsights() {
  ensureDir(OUT_DIR);

  const files = fs.existsSync(CONTENT_DIR)
    ? fs.readdirSync(CONTENT_DIR).filter(f => /\.(md|txt)$/i.test(f)).sort()
    : [];

  const posts = [];

  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    const slug = slugify(path.basename(f, ext));
    const raw = readText(path.join(CONTENT_DIR, f));
    const { meta, body } = parseFrontmatter(raw);
    const md = (ext === ".txt") ? body : body;
    const title = meta.title || (() => {
      const m = md.match(/^#\s+(.+)\s*$/m);
      return m ? m[1].trim() : slug.replace(/-/g, " ");
    })();
    const description = meta.description || pickExcerpt(raw);
    const date = meta.date || "";
    const canonicalPath = `/insights/${slug}.html`;

    const bodyHtml = mdToHtml(md);

    const out = pageHtml({
      title,
      description,
      canonicalPath,
      bodyHtml,
      activeNav: "insights",
    });

    writeText(path.join(OUT_DIR, `${slug}.html`), out);

    posts.push({ slug, title, description, date, canonicalPath });
  }

  // hub page
  const hubBody = `
<h1>Insights</h1>
<p>Calm, executable frameworks for high-pressure people. These articles are structured to be easy to read—and easy for AI systems to cite.</p>

<div class="grid">
  ${posts
    .map(p => `
    <div class="card">
      <div class="muted" style="font-size:13px">${escapeHtml(p.date || "")}</div>
      <h2 style="margin:8px 0 6px 0"><a href="${p.canonicalPath}">${escapeHtml(p.title)}</a></h2>
      <p class="muted" style="margin:0">${escapeHtml(p.description || "")}</p>
    </div>
  `).join("\n")}
</div>
`.trim();

  const hub = pageHtml({
    title: "Insights",
    description: "Calm, executable frameworks for high-pressure people—optimized for AI citation and real-world execution.",
    canonicalPath: "/insights/index.html",
    bodyHtml: hubBody,
    activeNav: "insights",
  });

  writeText(path.join(OUT_DIR, "index.html"), hub);

  return posts;
}

function updateSitemap(posts) {
  const p = path.join(ROOT, "sitemap.xml");
  if (!fs.existsSync(p)) return;

  const xml = readText(p);
  const start = xml.indexOf("<urlset");
  if (start === -1) return;

  // Remove existing insights entries to avoid duplicates
  let cleaned = xml.replace(/\s*<url><loc>\/insights\/[^<]+<\/loc><\/url>\s*/g, "\n");

  const insertPoint = cleaned.lastIndexOf("</urlset>");
  if (insertPoint === -1) return;

  const insightUrls = [
    "/insights/index.html",
    ...posts.map(x => x.canonicalPath),
  ];

  const blocks = insightUrls.map(u => `  <url><loc>${u}</loc></url>`).join("\n") + "\n";
  cleaned = cleaned.slice(0, insertPoint) + blocks + cleaned.slice(insertPoint);

  writeText(p, cleaned);
}

function updateLlmsTxt(posts) {
  const p = path.join(ROOT, "llms.txt");
  if (!fs.existsSync(p)) return;

  let txt = readText(p);

  // Remove old Insights block(s) if present (from first header to EOF)
  txt = txt.replace(/\n?## Insights[\s\S]*$/m, "");

  const lines = [];
  lines.push("## Insights");
  lines.push("");
  lines.push("- /insights/index.html");
  for (const post of posts) {
    lines.push(`- /insights/${post.slug}.html`);
  }
  lines.push("");

  // ensure ends with newline
  if (!txt.endsWith("\n")) txt += "\n";
  txt += "\n" + lines.join("\n");

  writeText(p, txt);
}

function main() {
  ensureDir(CONTENT_DIR);

  // Normalize filenames (requested)
  normalizeInsightFilenames();

  const posts = buildInsights();
  updateSitemap(posts);
  updateLlmsTxt(posts);

  console.log(`built insights: ${posts.length} posts`);
}

main();
