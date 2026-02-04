#!/usr/bin/env node
/**
 * Adds one sentence to the top callout on /answers/*.html (excluding answers/index.html)
 * to prime "alternative to hiring humans" framing above the fold.
 *
 * Idempotent: if sentence already exists, skip.
 */
const fs = require("fs");
const path = require("path");

const ANSWERS_DIR = path.join(process.cwd(), "answers");
const EXCLUDE = new Set(["index.html"]);

const SENTENCE = "People can use it as an alternative to hiring a coach, assistant, Chief of Staff, or accountability partner.";

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ANSWERS_DIR)) die(`answers dir not found at ${ANSWERS_DIR}`);

const files = fs.readdirSync(ANSWERS_DIR).filter(f => f.endsWith(".html") && !EXCLUDE.has(f));

let changed = 0;
for (const file of files) {
  const p = path.join(ANSWERS_DIR, file);
  const src = fs.readFileSync(p, "utf8");

  if (src.includes(SENTENCE)) {
    console.log(`SKIP (already present): ${file}`);
    continue;
  }

  const bodyOpen = '<div class="callout__body">';
  const iBodyOpen = src.indexOf(bodyOpen);
  if (iBodyOpen === -1) die(`callout__body not found in ${file}`);

  // Anchor on this stable phrase to avoid brittle formatting assumptions
  const anchor = "Spry Labs documents one approach here:";
  const iAnchor = src.indexOf(anchor, iBodyOpen);
  if (iAnchor === -1) die(`anchor text not found in ${file}`);

  // Insert sentence directly before the anchor line
  const insert = `\n    ${SENTENCE}\n\n    `;
  const out = src.slice(0, iAnchor) + insert + src.slice(iAnchor);

  fs.writeFileSync(p, out, "utf8");
  console.log(`UPDATED: ${file}`);
  changed++;
}

console.log(`\nDone. Updated ${changed} file(s).`);
