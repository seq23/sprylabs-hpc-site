const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const OUT = "data/authority/internal_authority_scores.json";

const MONEY_TARGETS = [
  "https://aplayermode.com",
  "https://sprylabs.gumroad.com/l/billionaire-high-performance-coach",
  "/download",
  "/download.html"
];

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "_ops", "coverage", "reports", "templates"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function hrefs(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1]);
}

function rel(file) {
  return "/" + file.replace(/^\.\//, "").replace(/index\.html$/, "").replace(/\/$/, "");
}

const files = walkHtml(".");
const pages = {};

for (const file of files) {
  const html = fs.readFileSync(file, "utf8");
  const url = rel(file);
  const links = hrefs(html);

  pages[url] = {
    url,
    file,
    outbound_links: links,
    inbound_links: 0,
    money_links: links.filter(l => MONEY_TARGETS.some(t => l.includes(t))).length,
    internal_links: links.filter(l => l.startsWith("/") || l.includes("billionairehighperformancecoach.com")).length,
    word_count: html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
    score: 0
  };
}

for (const page of Object.values(pages)) {
  for (const link of page.outbound_links) {
    if (!link.startsWith("/")) continue;
    const normalized = link.replace(/\/index\.html$/, "/").replace(/\.html$/, "");
    for (const target of Object.values(pages)) {
      const targetNorm = target.url.replace(/\.html$/, "");
      if (normalized === targetNorm || normalized === target.url) {
        target.inbound_links++;
      }
    }
  }
}

for (const page of Object.values(pages)) {
  const inboundScore = Math.min(page.inbound_links * 4, 40);
  const moneyScore = Math.min(page.money_links * 15, 30);
  const internalScore = Math.min(page.internal_links * 2, 20);
  const depthScore = page.word_count >= 900 ? 10 : page.word_count >= 500 ? 5 : 0;

  page.score = inboundScore + moneyScore + internalScore + depthScore;
}

const ranked = Object.values(pages).sort((a, b) => b.score - a.score);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  page_count: ranked.length,
  scoring: {
    inbound_links: "up to 40",
    money_links: "up to 30",
    internal_links: "up to 20",
    content_depth: "up to 10"
  },
  ranked
}, null, 2));

console.log(`AUTHORITY SCORES BUILT: pages=${ranked.length}`);
