#!/usr/bin/env node
/*
Release EXACTLY ONE draft from content/insights/_drafts into content/insights.

Selection rule (deterministic):
1) Consider only drafts named like: YYYY-MM-DD_<anything>.md (or .txt)
2) Let today = current UTC date (YYYY-MM-DD)
3) Prefer the smallest draft date >= today ("next available date")
4) Else use the smallest draft date overall ("oldest remaining")
5) Skip any draft whose resulting live slug already exists.

This repo forbids duplicate live insight pages with -2 suffixes.
If all candidate drafts would collide with an existing live slug, release nothing.
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

function parseDatedDraft(filename) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})_(.+)\.(md|txt)$/i);
  if (!m) return null;
  return {
    date: m[1],
    rest: m[2],
    ext: "." + m[3].toLowerCase(),
    filename,
  };
}

function draftToSlug(filename) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);
  const stripped = base.replace(/^\d{4}-\d{2}-\d{2}_/, "");
  return slugify(stripped || base);
}

function liveSlugExists(dir, slug) {
  return [".md", ".txt"].some((ext) => fs.existsSync(path.join(dir, `${slug}${ext}`)));
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
  let ordered = [];

  if (dated.length > 0) {
    const today = utcTodayYYYYMMDD();
    dated.sort((a, b) => (a.date.localeCompare(b.date) || a.filename.localeCompare(b.filename)));
    const futureOrToday = dated.filter((d) => d.date >= today).map((d) => d.filename);
    const past = dated.filter((d) => d.date < today).map((d) => d.filename);
    ordered = futureOrToday.concat(past);
  } else {
    ordered = all.slice().sort();
  }

  const skipped = [];
  let picked = null;

  for (const filename of ordered) {
    const slug = draftToSlug(filename);
    const ext = path.extname(filename).toLowerCase();
    if (liveSlugExists(LIVE_DIR, slug)) {
      skipped.push({ filename, slug });
      continue;
    }
    picked = { filename, slug, ext };
    break;
  }

  for (const item of skipped) {
    console.log(`Skipping duplicate draft slug already live: ${item.filename} -> ${item.slug}`);
  }

  if (!picked) {
    console.log("No releasable drafts found. Nothing to release.");
    process.exit(0);
  }

  const from = path.join(DRAFT_DIR, picked.filename);
  const to = path.join(LIVE_DIR, `${picked.slug}${picked.ext}`);

  fs.renameSync(from, to);
  console.log(`Released: ${picked.filename} -> ${path.relative(ROOT, to)}`);
}

main();
