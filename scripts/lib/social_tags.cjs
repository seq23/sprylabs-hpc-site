'use strict';
/**
 * One definition of the social-card head every published page must carry, and
 * of the icon links that go with it.
 *
 * Search Readiness checklist item b6 wants og:title, og:description, og:type,
 * og:url, og:site_name, an og:image 1200x630 on the site's own host with
 * width and height, and twitter:card summary_large_image. On 25 Oct 2026 the
 * committed tree had none of the width/height pair on any of 2,276 pages,
 * no og:site_name on 1,966, no og:type on 1,717, no twitter:card on 1,448 and
 * no og:title/og:description on 1,416 - every generator wrote its own partial
 * set, and the two images in use were 600x600 and 420x96.
 *
 * Item a9 wants /apple-touch-icon.png and /site.webmanifest to exist; the links
 * that point at them belong in the same head, and in the same single writer, so
 * they are here rather than in a second pass.
 *
 * The values are taken from the page itself: the final <title>, the final meta
 * description and the canonical URL that
 * scripts/repair/repair_dual_domain_metadata.js has already written. Nothing is
 * invented. The repair that applies this runs last in that file, after the
 * snippet bounds, so og:title can never disagree with <title>.
 *
 * Applied by scripts/repair/complete_social_tags.cjs, guarded by
 * scripts/validators/validate_social_tags.mjs.
 */
const fs = require('fs');
const path = require('path');
const B = require('./search_snippet_bounds.cjs');

/**
 * The 1200x630 card for each canonical host, served from that host. Read from
 * config/site_hosts.json, the one host map, because the citation program
 * (Python) writes og:image too and the two must not be able to disagree: it
 * hard-coded a 600x630 image on both hosts, overwrote og:image with it on every
 * build, and derived the CITATION_PAGE_SCHEMA image from whatever og:image said
 * at that moment - so this pass, which runs last, left the schema one whole
 * build behind and 419 governed surfaces drifting every run.
 */
const DEFAULT_OG_IMAGE = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config/site_hosts.json'), 'utf8')).hosts)
    .map(([host, cfg]) => [host, cfg.og_image]),
);
for (const [host, href] of Object.entries(DEFAULT_OG_IMAGE)) {
  if (!href) throw new Error(`config/site_hosts.json: ${host} has no og_image; every host needs its own 1200x630 card`);
}
const ICON_LINKS = [
  ['icon', '/favicon.ico'],
  ['apple-touch-icon', '/apple-touch-icon.png'],
  ['manifest', '/site.webmanifest'],
];
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/** PNG header read: [width, height], or null when the file is not a readable PNG. */
function pngSize(abs) {
  if (!fs.existsSync(abs)) return null;
  const fd = fs.openSync(abs, 'r');
  try {
    const head = Buffer.alloc(24);
    if (fs.readSync(fd, head, 0, 24, 0) < 24) return null;
    if (head.toString('latin1', 1, 4) !== 'PNG') return null;
    return [head.readUInt32BE(16), head.readUInt32BE(20)];
  } finally {
    fs.closeSync(fd);
  }
}

function canonicalOf(html) {
  const tag = (String(html).match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i) || [])[0] || '';
  return (tag.match(/href=["']([^"']+)["']/i) || [])[1] || '';
}
function hostOf(canonical) {
  try { return new URL(canonical).host; } catch { return ''; }
}
function metaOf(html, keyName, keyValue) {
  const head = String(html).split(/<\/head>/i)[0];
  const re = new RegExp(`<meta\\b[^>]*${keyName}=["']${keyValue}["'][^>]*>`, 'i');
  const tag = head.match(re);
  if (!tag) return '';
  // The value is delimited by the quote it opened with. Reading it as
  // [^"']* truncated every title holding an apostrophe - "How Do I Stop the
  // 'I'll Start in 5 Minutes' Loop..." became "How Do I Stop the" - and the
  // check then reported og:title disagreeing with a <title> it matched.
  return B.norm(B.decodeEntities((tag[0].match(/\bcontent=(["'])([\s\S]*?)\1/i) || [])[2] || ''));
}

/**
 * The og:image for a page: the one it already carries when that file is
 * committed on this site at 1200x630, otherwise the host's default card.
 * An image on another domain is never kept - the checklist's whole point is
 * that the card must not depend on a host the site does not control.
 */
function ogImageFor({root, html, host}) {
  const fallback = DEFAULT_OG_IMAGE[host] || DEFAULT_OG_IMAGE['billionairehighperformancecoach.com'];
  const current = metaOf(html, 'property', 'og:image');
  let pathname = '';
  if (current.startsWith('/')) pathname = current;
  else {
    try {
      const url = new URL(current);
      if (url.host === host) pathname = url.pathname;
    } catch { pathname = ''; }
  }
  if (pathname) {
    const size = pngSize(path.join(root, pathname.replace(/^\//, '')));
    if (size && size[0] === OG_WIDTH && size[1] === OG_HEIGHT) {
      return {pathname, width: size[0], height: size[1]};
    }
  }
  const size = pngSize(path.join(root, fallback.replace(/^\//, ''))) || [OG_WIDTH, OG_HEIGHT];
  return {pathname: fallback, width: size[0], height: size[1]};
}

/** The complete tag set a page must carry, as {selector, tag} entries in head order. */
function socialTagsFor({root, rel, html}) {
  const canonical = canonicalOf(html);
  const host = hostOf(canonical);
  const title = B.titleOf(html);
  const description = B.descriptionOf(html);
  const siteName = B.BRANDS[host] || B.BRANDS['billionairehighperformancecoach.com'];
  const image = ogImageFor({root, html, host});
  const absolute = `https://${host || 'billionairehighperformancecoach.com'}${image.pathname}`;
  // A directory index is the entry point to a section; everything else is a
  // document. og:type is read that literally by every card renderer.
  const type = rel === 'index.html' ? 'website' : (rel.endsWith('/index.html') ? 'website' : 'article');
  const metas = [
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:type', type],
    ['property', 'og:url', canonical],
    ['property', 'og:site_name', siteName],
    ['property', 'og:image', absolute],
    ['property', 'og:image:width', String(image.width)],
    ['property', 'og:image:height', String(image.height)],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', absolute],
  ].filter(([, , value]) => value);
  return {canonical, host, metas, iconLinks: ICON_LINKS, image};
}

module.exports = {
  DEFAULT_OG_IMAGE, ICON_LINKS, OG_WIDTH, OG_HEIGHT,
  pngSize, canonicalOf, hostOf, metaOf, ogImageFor, socialTagsFor,
};
