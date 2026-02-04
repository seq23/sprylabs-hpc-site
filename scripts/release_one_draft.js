#!/usr/bin/env node
/*
Release ONE draft from content/insights/_drafts into content/insights.
For Cloudflare Pages + GitHub: a scheduled GitHub Action runs this daily.

- Picks earliest file by filename sort (best practice: YYYY-MM-DD_<name>.md)
- Strips leading date prefix, slugifies, moves to content/insights/
- Does nothing if no drafts exist
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "content", "insights", "_drafts");
const LIVE_DIR = path.join(ROOT, "content", "insights");

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function uniqueTargetPath(dir, baseSlug, ext) {
  let candidate = path.join(dir, `${baseSlug}${ext}`);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i < 999; i++) {
    candidate = path.join(dir, `${baseSlug}-${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("Could not find unique filename for " + baseSlug + ext);
}

function main() {
  if (!fs.existsSync(DRAFT_DIR)) {
    console.log("No drafts directory. Nothing to release.");
    return;
  }
  ensureDir(LIVE_DIR);

  const drafts = fs
    .readdirSync(DRAFT_DIR)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort();

  if (drafts.length === 0) {
    console.log("No drafts found. Nothing to release.");
    return;
  }

  const pick = drafts[0];
  const ext = path.extname(pick).toLowerCase();
  const base = path.basename(pick, ext);

  // Strip YYYY-MM-DD_ prefix if present
  const stripped = base.replace(/^\d{4}-\d{2}-\d{2}_/, "");
  const slug = slugify(stripped || base);

  const from = path.join(DRAFT_DIR, pick);
  const to = uniqueTargetPath(LIVE_DIR, slug, ext);

  fs.renameSync(from, to);
  console.log(`Released: ${pick} -> ${path.relative(ROOT, to)}`);
}

main();
