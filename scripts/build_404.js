#!/usr/bin/env node
/**
 * Emits <OUT>/404.html so Cloudflare Pages returns a real 404 status for
 * unknown paths. Without this file Pages falls back to the site index and
 * answers 200, which lets search engines index unlimited synthetic URLs
 * carrying duplicated homepage content.
 *
 * The page inherits the site's own <style> block and <title> from index.html
 * so it stays visually consistent without duplicating design tokens here.
 *
 * OUT is resolved from PAGES_OUT_DIR, else the first candidate that holds an
 * index.html. Run it as the final step of the repo build.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
// The build stages site/public at the repo root (run_with_public_root.mjs), so
// resolve whichever layout is current rather than assuming one.
const candidates = process.env.PAGES_OUT_DIR
  ? [process.env.PAGES_OUT_DIR]
  : ['site/public', '.'];

const outDir = candidates
  .map((d) => path.resolve(repoRoot, d))
  .find((d) => fs.existsSync(path.join(d, 'index.html')));

if (!outDir) {
  console.error('build_404: no index.html found in ' + candidates.join(', '));
  process.exit(1);
}

const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
// Carry both inline <style> blocks and external stylesheet/font links so the
// page matches the site whichever way it loads its CSS.
const styles = [
  ...(index.match(/<style[\s\S]*?<\/style>/gi) || []),
  ...(index.match(/<link[^>]+rel=["'](?:stylesheet|preconnect)["'][^>]*>/gi) || []),
].join('\n');
const siteName = (index.match(/<title>([^<]*)<\/title>/i) || [, 'This site'])[1]
  .split(/\s+[|—-]\s+/)[0]
  .trim();
// Reuse the site's own footer so the 404 carries the same legal/nav links every
// other page does, rather than becoming a dead end.
const footer = (index.match(/<footer[\s\S]*?<\/footer>/i) || [''])[0];
// Derive the origin from the homepage's canonical so the 404 can self-canonicalize
// without this script knowing any repo's domain.
// Attribute order varies across these repos, so match either arrangement.
const canonicalTagRaw = (index.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)
  || index.match(/<link[^>]*href=[^>]*rel=["']canonical["'][^>]*>/i) || [''])[0];
const canonicalHref = (canonicalTagRaw.match(/href=["']([^"']+)["']/i) || [])[1];
let origin = '';
try { origin = canonicalHref ? new URL(canonicalHref).origin : ''; } catch { origin = ''; }
// This tree is served on two domains (spryexecutiveos.com and
// billionairehighperformancecoach.com), so a single canonical would point one
// domain's 404 at the other. The page is noindex, so a canonical buys nothing.
const canonicalTag = '';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page not found &middot; ${esc(siteName)}</title>
  <meta name="robots" content="noindex, follow">
  <meta name="description" content="That page could not be found on ${esc(siteName)}. The address may be mistyped, or the page may have been moved or retired.">${canonicalTag}
${styles}
  <style>
    .nf-wrap { max-width: 40rem; margin: 0 auto; padding: 4rem 1.25rem; }
    .nf-code { font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; opacity: .7; margin: 0 0 .75rem; }
    .nf-wrap h1 { margin: 0 0 .75rem; text-wrap: balance; }
    .nf-wrap p { margin: 0 0 1.5rem; max-width: 34rem; }
    .nf-home { display: inline-block; font-weight: 600; }
  </style>
</head>
<body>
  <main class="nf-wrap">
    <p class="nf-code">Error 404</p>
    <h1>We couldn&rsquo;t find that page</h1>
    <p>The address may be mistyped, or the page may have been moved or retired since it was linked.</p>
    <p><a class="nf-home" href="/">Return to ${esc(siteName)}</a></p>
  </main>
${footer}
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `Page not found \u00b7 ${siteName}`,
    ...(origin ? { "@id": `${origin}/404.html`, url: `${origin}/404.html`,
                   isPartOf: { "@type": "WebSite", name: siteName, url: `${origin}/` } } : {}),
  }, null, 2)}</script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, '404.html'), html);
console.log('build_404: wrote ' + path.relative(repoRoot, path.join(outDir, '404.html')));
