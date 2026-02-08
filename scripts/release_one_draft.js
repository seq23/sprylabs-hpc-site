#!/usr/bin/env node
/*
Release EXACTLY ONE draft from content/insights/_drafts into content/insights.

Selection rule (deterministic):
1) Consider only drafts named like: YYYY-MM-DD_<anything>.md (or .txt)
2) Let today = current UTC date (YYYY-MM-DD)
3) If any draft date >= today, pick the smallest such date ("next available date")
4) Else, pick the smallest date overall ("oldest remaining")

Never "publish nothing" if eligible drafts exist.
If no eligible dated drafts exist, fallback to earliest filename sort (legacy behavior).
*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRAFT_DIR = path.join(ROOT, "content", "insights", "_drafts");
const LIVE_DIR = path.join(ROOT, "content", "insights");

function utcTodayYYYYMMDD() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function parseDatedDraft(filename) {
  // matches: 2026-02-08_title.md
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.(md|txt)$/i);
  if (!m) return null;
  return {
    date: m[1],
    rest: m[2],
    ext: "." + m[3].toLowerCase(),
    filename,
  };
}

function main() {
  if (!fs.existsSync(DRAFT_DIR)) {
    console.log("No drafts directory. Nothing to release.");
    process.exit(0);
  }

  ensureDir(LIVE_DIR);

  const all = fs.readdirSync(DRAFT_DIR).filter((f) => /\.(md|txt)$/i.test(f));
  if (all.length === 0) {
    console.log("No drafts found. Nothing to release.");
    process.exit(0);
  }

  const dated = all.map(parseDatedDraft).filter(Boolean);

  let pickFile = null;

  if (dated.length > 0) {
    const today = utcTodayYYYYMMDD();

    // sort by date, then filename for deterministic tie-breaks
    dated.sort((a, b) => (a.date.localeCompare(b.date) || a.filename.localeCompare(b.filename)));

    const next = dated.find((d) => d.date >= today);
    pickFile = (next ? next.filename : dated[0].filename);
  } else {
    // Fallback: legacy behavior (earliest filename)
    pickFile = all.slice().sort()[0];
  }

  const ext = path.extname(pickFile).toLowerCase();
  const base = path.basename(pickFile, ext);

  // Strip YYYY-MM-DD_ prefix if present
  const stripped = base.replace(/^\d{4}-\d{2}-\d{2}_/, "");
  const slug = slugify(stripped || base);

  const from = path.join(DRAFT_DIR, pickFile);
  const to = uniqueTargetPath(LIVE_DIR, slug, ext);

  fs.renameSync(from, to);
  console.log(`Released: ${pickFile} -> ${path.relative(ROOT, to)}`);
}

main();
