#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const BASE = "https://spryexecutiveos.com";

function die(msg) {
  console.error("ERROR:", msg);
  process.exit(1);
}

function listHtmlFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith(".html")) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function routeForFile(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  return "/" + rel;
}

function abs(urlPath) {
  if (!urlPath.startsWith("/")) urlPath = "/" + urlPath;
  return BASE + urlPath;
}

function patchHtml(filePath) {
  const rel = filePath.replace(/\\/g, "/");
  const urlPath = routeForFile(rel);
  const canonicalAbs = abs(urlPath);

  let src = fs.readFileSync(filePath, "utf8");
  const before = src;

  // og:url
  if (/<meta\s+property=["']og:url["']/i.test(src)) {
    src = src.replace(
      /<meta\s+property=["']og:url["']\s+content=["'][^"']*["']\s*\/?>/i,
      `<meta property="og:url" content="${canonicalAbs}">`
    );
  }

  // canonical link
  if (/<link\s+rel=["']canonical["']/i.test(src)) {
    src = src.replace(
      /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']\s*\/?>/i,
      `<link rel="canonical" href="${canonicalAbs}">`
    );
  }

  // JSON-LD mainEntityOfPage @id to absolute (and any other "@id": "/...")
  src = src.replace(
    /"mainEntityOfPage"\s*:\s*\{\s*"@type"\s*:\s*"WebPage"\s*,\s*"@id"\s*:\s*"\/([^"]+)"\s*\}/g,
    (_m, p1) =>
      `"mainEntityOfPage": {"@type": "WebPage", "@id": "${abs("/" + p1)}"}`
  );
  src = src.replace(/"@id"\s*:\s*"\/([^"]+)"/g, (_m, p1) => `"@id": "${abs("/" + p1)}"`);

  if (src !== before) {
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

function patchJson(filePath) {
  let src = fs.readFileSync(filePath, "utf8");
  const before = src;

  src = src.replace(/"url"\s*:\s*"\/([^"]+)"/g, (_m, p1) => `"url": "${abs("/" + p1)}"`);

  if (src !== before) {
    fs.writeFileSync(filePath, src, "utf8");
    return true;
  }
  return false;
}

if (!fs.existsSync("scripts")) die("scripts/ directory missing (expected).");

let changed = 0;

const htmlFiles = listHtmlFiles(".")
  .filter((p) => p.endsWith(".html"))
  .filter((p) => !p.includes(`${path.sep}.git${path.sep}`))
  .filter((p) => !p.includes("node_modules"));

for (const f of htmlFiles) {
  if (patchHtml(f)) {
    console.log("UPDATED:", f);
    changed++;
  }
}

for (const jf of ["answers.json", "atlas.json"]) {
  if (fs.existsSync(jf)) {
    if (patchJson(jf)) {
      console.log("UPDATED:", jf);
      changed++;
    }
  }
}

console.log(`\nDone. Updated ${changed} file(s).`);
