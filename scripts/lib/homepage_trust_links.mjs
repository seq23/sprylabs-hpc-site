// ONE DEFINITION OF THE HOMEPAGE TRUST LINKS.
//
// Search Readiness item c6 (25 Oct 2026): the homepage must link the About page,
// the author page and the methodology page, so an answer engine can reach who is
// speaking. #148 added those three anchors to index.html BY HAND and made
// validate:citation-strategy refuse a homepage without them.
//
// No generator wrote them. The daily citation lane begins with
// authority:scale:restore, which rewrites every frozen page whose hash differs
// from data/release/frozen_output_registry.json back to its frozen blob - and
// the blob for "/" predates #148. build:all then regenerated the tree, nothing
// put the anchors back, and c0a62f0e1 pushed a homepage without them: Validate
// Repo run 40347544796 red on main.
//
// So the anchors are now OUTPUT: scripts/repair/homepage_trust_links.mjs writes
// them inside build:postprocess (before build_404.js copies the footer), and
// validate:citation-strategy reads this same list, so the writer and the check
// cannot disagree about which links the homepage owes.

export const FOOTER_NAV_RE = /(<nav\b[^>]*aria-label=["']Company and legal links["'][^>]*>)([\s\S]*?)(<\/nav>)/i;

export function requiredHomepageTrustLinks(author = {}) {
  return [
    { route: '/about', label: 'the About page', text: 'About' },
    { route: String(author.canonical_author_page || '/author'), label: 'the author page', text: 'Author and editorial standards' },
    { route: String(author.methodology_url || '/citation-methodology'), label: 'the methodology page', text: 'How we source and cite' },
  ];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function linksRoute(html, route) {
  return new RegExp(`href=["']${escapeRe(route)}/?["']`).test(html);
}

// Returns { html, added }. Throws when the homepage has no footer nav to carry
// the links: a writer that cannot find its target must never exit 0 having
// written nothing.
export function applyHomepageTrustLinks(html, links) {
  if (!links.length) throw new Error('HOMEPAGE_TRUST_LINKS_EMPTY: no trust links are defined, so there is nothing to enforce');
  const m = html.match(FOOTER_NAV_RE);
  if (!m) throw new Error('HOMEPAGE_FOOTER_NAV_MISSING: index.html has no <nav aria-label="Company and legal links"> to carry the About, author and methodology links');
  const missing = links.filter((l) => !linksRoute(html, l.route));
  if (!missing.length) return { html, added: [] };
  const anchors = missing.map((l) => `<a href="${l.route}">${l.text}</a>`).join('\n');
  const [, open, inner, close] = m;
  const heading = inner.match(/^\s*<h3\b[^>]*>[\s\S]*?<\/h3>\s*\n?/i);
  const nextInner = heading
    ? heading[0] + anchors + '\n' + inner.slice(heading[0].length)
    : '\n' + anchors + inner;
  const out = html.replace(FOOTER_NAV_RE, () => open + nextInner + close);
  return { html: out, added: missing.map((l) => l.route) };
}
