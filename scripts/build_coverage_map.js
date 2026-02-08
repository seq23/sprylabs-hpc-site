#!/usr/bin/env node
/*
Build a human-readable coverage map for the repo.

Outputs:
  - coverage/index.html
  - coverage/coverage.json

The goal is to show, at a glance:
  - how many live + draft posts exist per pillar (cluster)
  - how far the draft runway goes by date
  - which dates will publish next (UTC)

This is intentionally dependency-free (no npm install required).
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "content", "insights", "_drafts");
const LIVE_DIR = path.join(ROOT, "content", "insights");
const CLUSTERS_PATH = path.join(ROOT, "content", "insights", "_clusters.json");
const OUT_DIR = path.join(ROOT, "coverage");
const OUT_JSON = path.join(OUT_DIR, "coverage.json");
const OUT_HTML = path.join(OUT_DIR, "index.html");

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
  // Minimal YAML-ish parser for this repo's frontmatter
  // Supports:
  // ---
  // key: value
  // tags: [a, b]
  // ---
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

    // Strip quotes
    value = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");

    // Parse simple arrays: [a, b]
    if (/^\[.*\]$/.test(value)) {
      const inner = value.slice(1, -1).trim();
      if (!inner) {
        data[key] = [];
      } else {
        data[key] = inner
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => s.replace(/^"|"$/g, "").replace(/^'|'$/g, ""));
      }
      continue;
    }

    data[key] = value;
  }

  return { data, body };
}

function getDraftDateFromFilename(filename) {
  // Expect: YYYY-MM-DD_<slug>.md
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

function loadClusters() {
  if (!fs.existsSync(CLUSTERS_PATH)) return [];
  const raw = readText(CLUSTERS_PATH);
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function summarizeCoverage({ clusters, drafts, lives }) {
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

  // Helper to bucket a file
  function bucketFile(filePath, type) {
    const txt = readText(filePath);
    const { data } = parseFrontmatter(txt);
    const cluster = (data.cluster || "").trim();
    if (!cluster) return;

    if (!byCluster[cluster]) {
      // Unknown cluster: still show it
      byCluster[cluster] = {
        id: cluster,
        name: cluster,
        description: "(cluster id referenced in content, but not defined in _clusters.json)",
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

  // Overall draft runway
  const allDraftDates = drafts
    .map((p) => getDraftDateFromFilename(path.basename(p)))
    .filter(Boolean)
    .sort();

  const today = utcTodayYYYYMMDD();
  const next10 = allDraftDates.filter((d) => d >= today).slice(0, 10);
  const minDraft = allDraftDates[0] || null;
  const maxDraft = allDraftDates[allDraftDates.length - 1] || null;

  // Normalize draftDates per cluster
  for (const k of Object.keys(byCluster)) {
    byCluster[k].draftDates.sort();
  }

  return {
    generatedAtUtc: new Date().toISOString(),
    todayUtc: today,
    totals: {
      drafts: drafts.length,
      live: lives.length,
    },
    runway: {
      minDraftDate: minDraft,
      maxDraftDate: maxDraft,
      next10DraftDates: next10,
    },
    clusters: Object.values(byCluster)
      .sort((a, b) => (b.live + b.draft) - (a.live + a.draft))
      .map((c) => {
        const min = c.draftDates[0] || null;
        const max = c.draftDates[c.draftDates.length - 1] || null;
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          live: c.live,
          draft: c.draft,
          draftDateRange: { min, max },
        };
      }),
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

function renderHtml(report) {
  const rows = report.clusters
    .map((c) => {
      const total = c.live + c.draft;
      const range = c.draftDateRange.min
        ? `${c.draftDateRange.min} → ${c.draftDateRange.max || c.draftDateRange.min}`
        : "—";
      return `
        <tr>
          <td><a href="/pillars/${escapeHtml(c.id)}.html">${escapeHtml(c.name)}</a></td>
          <td class="num">${c.live}</td>
          <td class="num">${c.draft}</td>
          <td class="num">${total}</td>
          <td class="small">${escapeHtml(range)}</td>
        </tr>`;
    })
    .join("\n");

  const next = report.runway.next10DraftDates.length
    ? report.runway.next10DraftDates.map((d) => `<code>${escapeHtml(d)}</code>`).join(" ")
    : "<em>No dated drafts found.</em>";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coverage Map | Spry Executive OS</title>
    <meta name="robots" content="noindex,follow" />
    <link rel="stylesheet" href="/assets/site.css" />
  </head>
  <body>
    <header class="topbar">
      <div class="wrap">
        <div class="brand"><a href="/index.html">Spry Executive OS</a></div>
        <nav class="nav" aria-label="Primary navigation">
          <a class="nav__link" href="/index.html">Home</a>
          <a class="nav__link" href="/pillars/index.html">Pillars</a>
          <a class="nav__link" href="/topics/index.html">Topics</a>
          <a class="nav__link" href="/atlas.html">Atlas</a>
          <a class="nav__link nav__link--active" href="/coverage/index.html">Coverage</a>
        </nav>
      </div>
    </header>

    <main class="wrap" style="padding: 24px 0 56px;">
      <h1>Coverage Map</h1>
      <p class="lede">
        This page is a live audit of the repository: how many posts exist per pillar (cluster), and how far your drafts runway goes.
      </p>

      <div class="card" style="margin: 18px 0;">
        <div class="card__body">
          <div><strong>Generated (UTC):</strong> ${escapeHtml(report.generatedAtUtc)}</div>
          <div><strong>Today (UTC):</strong> ${escapeHtml(report.todayUtc)}</div>
          <div><strong>Totals:</strong> ${report.totals.live} live · ${report.totals.drafts} drafts</div>
          <div><strong>Draft runway:</strong> ${escapeHtml(report.runway.minDraftDate || "—")} → ${escapeHtml(report.runway.maxDraftDate || "—")}</div>
          <div style="margin-top: 10px;"><strong>Next 10 scheduled dates:</strong> ${next}</div>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <h2 style="margin-top:0;">Pillars (Clusters)</h2>
          <div style="overflow-x:auto;">
            <table class="table" style="width:100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align:left;">Pillar</th>
                  <th class="num">Live</th>
                  <th class="num">Drafts</th>
                  <th class="num">Total</th>
                  <th style="text-align:left;">Draft date range</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p style="margin-top: 16px;" class="small">Note: this coverage page is for owner operations. It is <code>noindex</code> so it doesn’t compete in search.</p>
    </main>
  </body>
</html>`;
}

function main() {
  const clusters = loadClusters();
  const drafts = listMarkdownFiles(DRAFT_DIR);
  const lives = listMarkdownFiles(LIVE_DIR).filter((p) => !p.includes(`${path.sep}_drafts${path.sep}`) && !path.basename(p).startsWith("_"));

  const report = summarizeCoverage({ clusters, drafts, lives });
  ensureDir(OUT_DIR);
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_HTML, renderHtml(report), "utf8");

  console.log(`Built coverage: ${path.relative(ROOT, OUT_HTML)} + ${path.relative(ROOT, OUT_JSON)}`);
}

main();
