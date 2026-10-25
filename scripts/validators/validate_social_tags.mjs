#!/usr/bin/env node
/**
 * validate:social-tags
 *
 * Every indexable page carries the complete social-card head and the icon
 * links: og:title, og:description, og:type, og:url, og:site_name, an og:image
 * that is 1200x630, committed in this repository and served from the page's own
 * canonical host, og:image:width/height matching that file, twitter:card
 * summary_large_image, and <link rel> for the icon, the apple-touch-icon and
 * the manifest.
 *
 * Search Readiness item b6 (and the icon half of a9), 25 Oct 2026: not one of
 * 2,276 committed pages had og:image:width; 1,966 had no og:site_name; the two
 * images in use were 600x600 and 420x96, so every share and every AI preview
 * rendered from a card the checklist would reject.
 *
 * The rules and the page set come from the same modules the repair uses
 * (scripts/lib/social_tags.cjs, scripts/lib/site_pages.js), so the check cannot
 * drift from what it checks. Hard-fails on zero pages examined, and on an
 * og:image or icon target that is not a committed file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const S = require(path.join(ROOT, 'scripts/lib/social_tags.cjs'));
const B = require(path.join(ROOT, 'scripts/lib/search_snippet_bounds.cjs'));
const { listIndexablePages, assertExamined } = require(path.join(ROOT, 'scripts/lib/site_pages.js'));

const REQUIRED_META = [
  ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:type'],
  ['property', 'og:url'], ['property', 'og:site_name'], ['property', 'og:image'],
  ['property', 'og:image:width'], ['property', 'og:image:height'],
  ['name', 'twitter:card'], ['name', 'twitter:title'], ['name', 'twitter:description'], ['name', 'twitter:image'],
];

const pages = listIndexablePages(ROOT).filter((rel) => !B.EXEMPT_PAGES.has(rel));
assertExamined('validate:social-tags', pages.length);

// Every icon the pages link to has to exist in the repository, or the links are
// three more 404s. Checked once, not per page.
const errors = [];
for (const [, href] of S.ICON_LINKS) {
  const abs = path.join(ROOT, href.replace(/^\//, ''));
  if (!fs.existsSync(abs) || !fs.statSync(abs).size) errors.push(`${href} is linked from every page but is missing or empty in the repository`);
}
for (const [host, href] of Object.entries(S.DEFAULT_OG_IMAGE)) {
  const size = S.pngSize(path.join(ROOT, href.replace(/^\//, '')));
  if (!size) errors.push(`${href} (the default card for ${host}) is missing or is not a PNG`);
  else if (size[0] !== S.OG_WIDTH || size[1] !== S.OG_HEIGHT) errors.push(`${href} is ${size[0]}x${size[1]}; the card must be ${S.OG_WIDTH}x${S.OG_HEIGHT}`);
}

let checked = 0;
for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  checked += 1;
  const head = html.split(/<\/head>/i)[0];
  const canonical = S.canonicalOf(html);
  const host = S.hostOf(canonical);
  for (const [keyName, keyValue] of REQUIRED_META) {
    if (!S.metaOf(html, keyName, keyValue)) errors.push(`${rel}: missing ${keyValue}`);
  }
  if (S.metaOf(html, 'name', 'twitter:card') !== 'summary_large_image') errors.push(`${rel}: twitter:card must be summary_large_image`);
  if (S.metaOf(html, 'property', 'og:url') !== canonical) errors.push(`${rel}: og:url does not match the canonical URL`);
  if (S.metaOf(html, 'property', 'og:title') !== B.titleOf(html)) errors.push(`${rel}: og:title does not match <title>`);

  const image = S.metaOf(html, 'property', 'og:image');
  let imageHost = '';
  let pathname = '';
  try { const u = new URL(image); imageHost = u.host; pathname = u.pathname; } catch { /* reported below */ }
  if (!imageHost) errors.push(`${rel}: og:image "${image}" is not an absolute URL`);
  else if (imageHost !== host) errors.push(`${rel}: og:image is on ${imageHost}, not the page's own host ${host}`);
  if (pathname) {
    const size = S.pngSize(path.join(ROOT, pathname.replace(/^\//, '')));
    if (!size) errors.push(`${rel}: og:image ${pathname} is not a committed PNG in this repository`);
    else {
      if (size[0] !== S.OG_WIDTH || size[1] !== S.OG_HEIGHT) errors.push(`${rel}: og:image ${pathname} is ${size[0]}x${size[1]}, not ${S.OG_WIDTH}x${S.OG_HEIGHT}`);
      if (S.metaOf(html, 'property', 'og:image:width') !== String(size[0]) || S.metaOf(html, 'property', 'og:image:height') !== String(size[1])) {
        errors.push(`${rel}: og:image:width/height do not match the file (${size[0]}x${size[1]})`);
      }
    }
  }
  for (const [linkRel] of S.ICON_LINKS) {
    if (!new RegExp(`<link\\b(?=[^>]*\\brel=["']${linkRel}["'])`, 'i').test(head)) errors.push(`${rel}: missing <link rel="${linkRel}">`);
  }
}

const report = { status: errors.length ? 'FAIL' : 'PASS', pages_checked: checked, error_count: errors.length, errors: errors.slice(0, 200) };
fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/social-tags.json'), JSON.stringify(report, null, 2) + '\n');
if (errors.length) {
  console.error(`[validate:social-tags] FAIL: ${errors.length} problem(s) across ${checked} pages`);
  errors.slice(0, 40).forEach((e) => console.error(` - ${e}`));
  process.exit(1);
}
console.log(`[validate:social-tags] OK: ${checked} indexable pages carry the complete card and icon links`);
