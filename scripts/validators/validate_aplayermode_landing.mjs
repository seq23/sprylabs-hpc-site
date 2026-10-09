#!/usr/bin/env node
/**
 * Guards the A Player Mode landing page (aplayermode/index.html), built as a
 * public landing page served at https://aplayermode.com/ by the
 * workers/aplayermode-com Worker (see section "aplayermode.com owns the page").
 *
 * WHAT IT REFUSES
 *
 *   1. A price that is not the app's price. A Player Mode's only price source is
 *      PLAN_PRICES / CHIEF_OF_STAFF_INTRO_OFFERS in seq23/aplayer-mode
 *      packages/policy/src/index.ts. config/aplayermode_plan_prices.json is a
 *      pinned copy with a source note. Every [data-price] element must show
 *      exactly the pinned amount, every required price must be on the page, and
 *      no other $X.XX amount may appear anywhere on it. When an aplayer-mode
 *      checkout is reachable (APLAYER_MODE_DIR, ../aplayer-mode, ~/aplayer-mode)
 *      the pinned copy is also compared to the source itself.
 *   2. "Billionaire Mindset" (the internal Track key's old name; the user-facing
 *      name is "Billionaire High Performance Coach Track") and "free trial"
 *      (there is none) anywhere in the page or its scripts.
 *   3. A broken or empty link. Every href/src must be an existing in-page id, a
 *      file committed in this repo, or an allow-listed external URL; "#", "" and
 *      javascript: are refused. Download buttons are driven by ONE constant in
 *      aplayermode/config.js: each value must be '' (rendered as a disabled
 *      "Available soon" element with no href) or an https:// URL, and every
 *      route in that constant must have exactly one button on the page.
 *   3b. A retired plan name. Plans are Executive Roundtable / Executive Suite /
 *      Autopilot (pinned with a source note). "Life OS" fails anywhere;
 *      "Chief of Staff" fails anywhere except as one of the 5 jobs.
 *   4. A dropped selling point. The page's first section sells the Billionaire
 *      High Performance Coach digital product, and must carry every selling
 *      point on the frozen download.html (read-only here). The points are
 *      extracted from download.html at run time, so a point added there is
 *      required here too.
 *   5. Rule 0: zero prices, zero links or zero selling points examined is a
 *      failure, not a pass.
 *   6. A page a first-time visitor cannot read. Exactly one h1, the approved
 *      headline, inside the hero, and BEFORE any digital-product selling
 *      content (the [data-bhpc-section] block, a Gumroad link, the
 *      "Download Billionaire High Performance Coach" heading). The hero carries
 *      both chooser cards (the app -> #app with its Founding 100 price, the
 *      digital product -> #bhpc with its Gumroad price). The sticky nav links
 *      The App / The Digital Product / Plans / Compare. A "Which is right for
 *      me?" table compares the two products on the five approved rows, and the
 *      FAQ answers the four approved questions.
 *   7. "free trial" is allowed exactly once: the FAQ question "Is there a free
 *      trial?" whose answer starts with "No" and then states the real intro
 *      offer (Founding 100 and introductory prices). Anywhere else it fails.
 *   9. A page a buyer cannot act on (persona review, 8 Oct 2026): a CTA on every
 *      plan card and two buy buttons with prices directly under the h1, all to
 *      the live web app / Gumroad; Terms and Privacy set; cancel and refund FAQ
 *      entries; a day-1 promise on each hero card; the five roles, the "LLMs
 *      Give Advice" h2 and the BetterUp line each shown once outside the folded
 *      "Full product description"; and no copy that claims the digital product
 *      enforces anything on its own.
 *   8. A page that drifts from the app's design system. The app's theme
 *      (seq23/aplayer-mode apps/mobile/src/theme/tokens.ts) is pinned in
 *      config/aplayermode_theme_tokens.json with a source note. aplayermode.css
 *      must declare every palette value as --apm-<kebab-case key>: the light
 *      value in its first :root block, the dark value in the :root inside
 *      @media (prefers-color-scheme: dark), same names in both. No hex colour
 *      may appear outside those two blocks, the display/body families must be
 *      Outfit and Nunito Sans, and the page must load both from Google Fonts
 *      (the only external <link> allowed). When an aplayer-mode checkout is
 *      reachable the pinned copy is also compared to tokens.ts itself.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const LABEL = '[validate:aplayermode-landing]';
const PAGE = process.env.APM_LANDING_PAGE || 'aplayermode/index.html';
const CONFIG_JS = process.env.APM_LANDING_CONFIG || 'aplayermode/config.js';
const PRICES = process.env.APM_LANDING_PRICES || 'config/aplayermode_plan_prices.json';
const THEME = process.env.APM_LANDING_THEME || 'config/aplayermode_theme_tokens.json';
const CSS = process.env.APM_LANDING_CSS || 'aplayermode/aplayermode.css';
const BHPC_SOURCE = process.env.APM_LANDING_BHPC_SOURCE || 'download.html';
const SCRIPTS = ['aplayermode/app.js', CONFIG_JS];

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const read = (p) => fs.readFileSync(path.resolve(ROOT, p), "utf8");

const html = read(PAGE);

// ---------------------------------------------------------------- helpers
const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'")
  .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&rarr;/g, '→').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…');
const stripTags = (s) => decode(s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' '));
const norm = (s) => decode(s).toLowerCase()
  .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/\s+/g, ' ').trim();
// Visible text of an inline run (a button label with a nested price span): tags dropped, not spaced.
const flat = (s) => norm(s.replace(/<[^>]+>/g, ''));
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
// A join button carries two labels (9 Oct 2026): the founding one, shown, and the standard one,
// hidden until app.js reads the live Founding 100 count as full. Rules read each part on its own.
const STANDARD_RE = /<span\b[^>]*\bdata-join-standard\b[^>]*>(?:[^<]|<span\b[^>]*>[^<]*<\/span>)*<\/span>/i;
const foundingPart = (inner) => inner.replace(STANDARD_RE, '');
const JOIN_STANDARD = 'join the executive roundtable - $9.99/month for 3 months, then $24.99/month';
const checkStandardPart = (inner, where) => {
  const m = inner.match(STANDARD_RE);
  if (!m) { fail(`${where} needs its hidden standard label [data-join-standard] for when the Founding 100 is full`); return; }
  if (!/\bhidden\b/.test(m[0].match(/^<span\b[^>]*>/)[0])) fail(`${where}: the standard label must be hidden in the static page (app.js shows it only when the count reads full)`);
  if (flat(m[0]) !== JOIN_STANDARD) fail(`${where}: the standard label reads "${stripTags(m[0]).trim()}", expected "${JOIN_STANDARD}"`);
  if (!m[0].includes('data-price="introductory.monthly"') || !m[0].includes('data-price="introductory.then"')) fail(`${where}: the standard label prices must be the pinned introductory prices`);
};

// ---------------------------------------------------------------- 1. prices
const pinned = JSON.parse(read(PRICES));
const expected = {};
for (const [plan, p] of Object.entries(pinned.plan_prices)) {
  expected[`${plan}.monthly`] = p.monthlyUsdCents;
  expected[`${plan}.annual`] = p.annualUsdCents;
}
expected['founding100.monthly'] = pinned.intro_offers.founding100.monthlyUsdCents;
expected['founding100.was'] = pinned.plan_prices.chief_of_staff.monthlyUsdCents;
expected['introductory.monthly'] = pinned.intro_offers.introductory.monthlyUsdCents;
expected['introductory.then'] = pinned.intro_offers.introductory.thenMonthlyUsdCents;
// The BHPC digital product's one-time Gumroad price, shown in whole dollars as
// Gumroad shows it. Pinned with its own source note; it is not a PLAN_PRICES amount.
const bhpcCents = pinned.bhpc_digital_product?.oneTimeUsdCents;
if (!Number.isInteger(bhpcCents) || bhpcCents <= 0) fail(`${PRICES} has no bhpc_digital_product.oneTimeUsdCents`);
else expected['bhpc.onetime'] = bhpcCents;
const shownAs = (key, cents) => (key === 'bhpc.onetime' && cents % 100 === 0 ? `$${cents / 100}` : usd(cents));

const priceEls = [...html.matchAll(/<[a-z]+\b[^>]*\bdata-price="([^"]+)"[^>]*>([\s\S]*?)<\/[a-z]+>/gi)];
if (priceEls.length === 0) fail('Rule 0: no [data-price] elements found on the page');
const seenKeys = new Set();
for (const [, key, inner] of priceEls) {
  seenKeys.add(key);
  if (!(key in expected)) { fail(`unknown data-price key "${key}"`); continue; }
  const shown = stripTags(inner).trim();
  if (shown !== shownAs(key, expected[key])) fail(`price ${key} shows "${shown}", the pinned price is ${shownAs(key, expected[key])}`);
}
for (const key of Object.keys(expected)) if (!seenKeys.has(key)) fail(`required price ${key} (${shownAs(key, expected[key])}) is not on the page`);
const allowedAmounts = new Set(Object.entries(expected).filter(([k]) => k !== 'bhpc.onetime').map(([, c]) => usd(c)));
for (const m of stripTags(html).matchAll(/\$\d[\d,]*\.\d{2}\b/g)) {
  if (!allowedAmounts.has(m[0])) fail(`amount ${m[0]} on the page is not a PLAN_PRICES amount`);
}

// Pinned copy vs the source itself, when a checkout is reachable.
const sourceDirs = [process.env.APLAYER_MODE_DIR, path.resolve(ROOT, '..', 'aplayer-mode'), path.join(os.homedir(), 'aplayer-mode')].filter(Boolean);
const srcDir = sourceDirs.find((d) => fs.existsSync(path.join(d, pinned.source_path)));
if (srcDir) {
  const ts = fs.readFileSync(path.join(srcDir, pinned.source_path), 'utf8');
  for (const [plan, p] of Object.entries(pinned.plan_prices)) {
    const row = ts.match(new RegExp(`\\b${plan}:\\s*\\{[^}]*monthlyUsdCents:\\s*(\\d+),\\s*annualUsdCents:\\s*(\\d+)`));
    if (!row) { fail(`PLAN_PRICES.${plan} not found in ${srcDir}/${pinned.source_path}`); continue; }
    if (Number(row[1]) !== p.monthlyUsdCents || Number(row[2]) !== p.annualUsdCents) {
      fail(`pinned ${plan} ${p.monthlyUsdCents}/${p.annualUsdCents} differs from source ${row[1]}/${row[2]}; re-copy from aplayer-mode`);
    }
  }
  const f100 = ts.match(/founding100:\s*\{[^}]*monthlyUsdCents:\s*(\d+)/);
  const intro = ts.match(/introductory:\s*\{\s*monthlyUsdCents:\s*(\d+),\s*months:\s*(\d+),\s*thenMonthlyUsdCents:\s*(\d+)/);
  if (!f100 || Number(f100[1]) !== pinned.intro_offers.founding100.monthlyUsdCents) fail('pinned founding100 price differs from source');
  if (!intro || Number(intro[1]) !== pinned.intro_offers.introductory.monthlyUsdCents || Number(intro[2]) !== pinned.intro_offers.introductory.months || Number(intro[3]) !== pinned.intro_offers.introductory.thenMonthlyUsdCents) fail('pinned introductory offer differs from source');
  notes.push(`pinned prices compared to ${srcDir}`);
} else {
  notes.push('no aplayer-mode checkout reachable; page compared to the pinned copy only');
}

// ---------------------------------------------------------------- 2. forbidden phrases
// The one permitted "free trial": the FAQ entry that answers "No". It must be
// a <details data-faq="free-trial"> whose summary is the question and whose
// answer starts with "No" and never says "free trial" itself. That one block is
// removed before the scan; every other "free trial" anywhere still fails.
const trialBlocks = [...html.matchAll(/<details\b[^>]*\bdata-faq="free-trial"[^>]*>([\s\S]*?)<\/details>/gi)];
if (trialBlocks.length !== 1) fail(`the FAQ needs exactly one "Is there a free trial?" entry (data-faq="free-trial"), found ${trialBlocks.length}`);
for (const [, inner] of trialBlocks) {
  const q = inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
  const answer = norm(stripTags(q ? inner.slice(q.index + q[0].length) : ''));
  if (!q || norm(stripTags(q[1])) !== 'is there a free trial?') fail('the free-trial FAQ entry must ask exactly "Is there a free trial?"');
  if (!/^no\b/.test(answer)) fail(`the free-trial FAQ answer must start with "No", found "${answer.slice(0, 40)}"`);
  if (/free\s+trial/i.test(answer)) fail('the free-trial FAQ answer must not say "free trial" itself');
  for (const k of ['founding100.monthly', 'introductory.monthly', 'introductory.then']) if (!inner.includes(`data-price="${k}"`)) fail(`the free-trial FAQ answer must state the real intro offer (${k}), not a flat "No"`);
}
const FORBIDDEN = [[/billionaire\s+mindset/i, '"Billionaire Mindset" (use "Billionaire High Performance Coach Track")'], [/free\s+trial/i, '"free trial" (there is none; only the FAQ "Is there a free trial?" answered "No" may say it)']];
for (const file of [PAGE, ...SCRIPTS]) {
  let text = read(file);
  if (file === PAGE && trialBlocks.length === 1) text = text.replace(trialBlocks[0][0], ' ');
  for (const [re, what] of FORBIDDEN) if (re.test(text)) fail(`${file} contains ${what}`);
}

// ---------------------------------------------------------------- 3. links and config
const sandbox = { window: {} };
vm.runInNewContext(read(CONFIG_JS), sandbox, { filename: CONFIG_JS });
const links = sandbox.window.APM_LINKS;
if (!links) fail(`${CONFIG_JS} does not define window.APM_LINKS`);
const ROUTES = ['beta.webApp', 'beta.androidApk', 'beta.iosTestFlight', 'stores.appStore', 'stores.googlePlay', 'legal.terms', 'legal.privacy'];
const lookup = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), links);
const isHttps = (u) => { try { return new URL(u).protocol === 'https:' && !/\s/.test(u); } catch { return false; } };
for (const r of [...ROUTES, 'gumroad']) {
  const v = lookup(r);
  if (typeof v !== 'string') { fail(`APM_LINKS.${r} is missing`); continue; }
  if (v !== '' && !isHttps(v)) fail(`APM_LINKS.${r} = "${v}" is neither '' nor an https:// URL`);
}
if (!isHttps(links?.gumroad || '')) fail('APM_LINKS.gumroad must be set to the live Gumroad listing');
// Terms and Privacy exist (seq23/aplayer-mode apps/mobile/public/{terms,privacy}); the footer must show them.
for (const r of ['legal.terms', 'legal.privacy', 'beta.webApp']) if (!isHttps(lookup(r) || '')) fail(`APM_LINKS.${r} must be set to its live https:// page`);

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
// The web app is where a plan is bought (setup, then the plan choice and card checkout).
const EXTERNAL_ALLOW = new Set([links?.gumroad, links?.beta?.webApp, links?.join].filter(Boolean));
// "Join the Founding 100" goes straight to the card checkout through the web app's /join route
// (seq23/aplayer-mode apps/mobile/app/join.tsx); testimonials and launch updates are read/posted by app.js.
if (links?.join !== `${links?.beta?.webApp}/join`) fail(`APM_LINKS.join must be the web app's /join route (${links?.beta?.webApp}/join)`);
if (links?.testimonials !== `${links?.beta?.webApp}/testimonials.json`) fail('APM_LINKS.testimonials must be the web app\'s /testimonials.json (the ONE testimonials file)');
if (links?.launchUpdates !== 'https://api.aplayermode.com/v1/launch-updates') fail('APM_LINKS.launchUpdates must be https://api.aplayermode.com/v1/launch-updates');
if (links?.founding !== 'https://api.aplayermode.com/v1/billing/founding') fail('APM_LINKS.founding must be https://api.aplayermode.com/v1/billing/founding (the live Founding 100 count)');
{
  const appJsSrc = read(path.join(path.dirname(CONFIG_JS), 'app.js'));
  // The switch: only an explicit open:false from the server shows the standard offer; all three join buttons follow it.
  if (!/fetch\(links\.founding, \{ mode: 'cors', credentials: 'omit' \}\)/.test(appJsSrc)) fail('app.js must read the live Founding 100 count from APM_LINKS.founding');
  if (!/if \(data\.open && data\.remaining > 0\) \{/.test(appJsSrc)) fail('app.js must keep the founding offer only while the count says places remain');
  for (const sel of ['[data-join-founding]', '[data-join-standard]', '[data-founding-open]', '[data-founding-full]']) if (!appJsSrc.includes(`document.querySelectorAll('${sel}')`)) fail(`app.js must switch every ${sel} once the Founding 100 is full`);
}
// Inline script bodies are code, not links (the site build injects the Clarity
// loader, whose code builds a URL string), and <link rel=canonical|alternate>
// is metadata the site build stamps on every page, not a link a reader follows.
// The Google Fonts <link> tags (preconnect + one stylesheet) are checked in
// section 8 and are the only external <link> the page may carry.
const FONT_LINK_RE = /<link\b[^>]*\bhref="https:\/\/fonts\.(googleapis|gstatic)\.com[^"]*"[^>]*>/gi;
const fontLinks = [...html.matchAll(FONT_LINK_RE)].map((m) => m[0]);
const linkScan = html
  .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*\brel="(canonical|alternate)"[^>]*>/gi, '')
  .replace(FONT_LINK_RE, '');
const refs = [...linkScan.matchAll(/\b(href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[2]);
if (refs.length === 0) fail('Rule 0: no href/src found on the page');
const fileExists = (p) => {
  const clean = decodeURIComponent(p.split(/[?#]/)[0]).replace(/^\//, '');
  return [clean, path.join(clean, 'index.html'), `${clean}.html`].some((c) => c && fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile());
};
for (const ref of refs) {
  if (ref === '' || ref === '#' || /^javascript:/i.test(ref)) { fail(`empty or dead link: href/src="${ref}"`); continue; }
  if (ref.startsWith('#')) { if (!ids.has(ref.slice(1))) fail(`in-page link ${ref} has no matching id`); continue; }
  if (/^https?:\/\//i.test(ref)) { if (!EXTERNAL_ALLOW.has(ref)) fail(`external link ${ref} is not in the allow-list (APM_LINKS.gumroad, APM_LINKS.beta.webApp, APM_LINKS.join)`); continue; }
  if (/^(mailto|tel):/i.test(ref)) continue;
  if (!ref.startsWith('/')) { fail(`relative link "${ref}" breaks when the page moves to aplayermode.com; use a root path`); continue; }
  if (!fileExists(ref)) fail(`internal link ${ref} resolves to no committed file`);
}

// Download buttons: one per route, never an <a> in the static page, always a "soon" label.
// A button's body runs from its opening tag to the next button (or 600 chars):
// buttons nest spans, so a lazy match to the first closing tag would cut it short.
const linkOpens = [...html.matchAll(/<([a-z]+)\b([^>]*)\bdata-link="([^"]+)"([^>]*)>/gi)];
const linkEls = linkOpens.map((m, i) => {
  const start = m.index + m[0].length;
  const end = Math.min(i + 1 < linkOpens.length ? linkOpens[i + 1].index : html.length, start + 600);
  return [m[0], m[1], m[2], m[3], m[4], html.slice(start, end)];
});
const linkCounts = {};
for (const [, tag, before, route, after, inner] of linkEls) {
  linkCounts[route] = (linkCounts[route] || 0) + 1;
  if (!ROUTES.includes(route)) fail(`data-link="${route}" names no route in APM_LINKS`);
  if (tag.toLowerCase() === 'a' || /\bhref\s*=/.test(before + after)) fail(`download button ${route} carries an href in the static page; app.js adds it only when the URL is set`);
  if (!/data-soon-label/.test(inner)) fail(`download button ${route} has no "Available soon" / "Coming soon" label`);
}
for (const r of ROUTES.filter((x) => !x.startsWith('legal.'))) {
  if ((linkCounts[r] || 0) !== 1) fail(`route ${r} needs exactly one download button, found ${linkCounts[r] || 0}`);
}
if (!/data-legal-links/.test(html)) fail('footer has no [data-legal-links] slot for Terms / Privacy');

// ---------------------------------------------------------------- 3b. plan names
// Plans are Executive Roundtable / Executive Suite / Autopilot. "Life OS" is a
// retired plan name; "Chief of Staff" is one of the 5 jobs and may appear only
// as a job: an [data-job] heading, a [data-jobs-list] item, or the BHPC copy's
// "a chief of staff for sequencing".
const planNames = [...html.matchAll(/<[a-z0-9]+\b[^>]*\bdata-plan-name\b[^>]*>([\s\S]*?)<\/[a-z0-9]+>/gi)].map((m) => stripTags(m[1]).trim());
const expectedNames = Object.values(pinned.plan_prices).map((p) => p.displayName);
if (expectedNames.some((n) => !n)) fail(`${PRICES} is missing a displayName`);
if (JSON.stringify(planNames) !== JSON.stringify(expectedNames)) fail(`plan names on the page ${JSON.stringify(planNames)} differ from ${JSON.stringify(expectedNames)}`);
const RETIRED = ['Chief of Staff', 'Life OS'];
for (const n of expectedNames) if (RETIRED.some((r) => r.toLowerCase() === n.toLowerCase())) fail(`pinned plan name "${n}" is a retired plan name`);
for (const file of [PAGE, ...SCRIPTS]) if (/\blife\s+os\b/i.test(stripTags(read(file)))) fail(`${file} contains "Life OS", a retired plan name (now Executive Suite)`);
const jobsStripped = stripTags(html
  .replace(/<([a-z0-9]+)\b[^>]*\bdata-job\b[^>]*>[^<]*<\/\1>/gi, ' ')
  .replace(/<([a-z0-9]+)\b[^>]*\bdata-jobs-list\b[^>]*>[\s\S]*?<\/\1>/gi, ' '))
  .replace(/a chief of staff for sequencing/g, ' ');
const cosLeft = (jobsStripped.match(/chief\s+of\s+staff/gi) || []).length;
if (cosLeft) fail(`"Chief of Staff" appears ${cosLeft} time(s) outside the 5 jobs; it is no longer a plan name (now Executive Roundtable)`);
if (srcDir) {
  const ts = fs.readFileSync(path.join(srcDir, pinned.source_path), 'utf8');
  for (const [plan, p] of Object.entries(pinned.plan_prices)) {
    const m = ts.match(new RegExp(`\\b${plan}:\\s*\\{[^}]*displayName:\\s*'([^']+)'`));
    if (!m) continue;
    if (RETIRED.includes(m[1])) { notes.push(`aplayer-mode source still names ${plan} "${m[1]}" (rename PR not merged yet)`); continue; }
    if (m[1] !== p.displayName) fail(`pinned ${plan} name "${p.displayName}" differs from source "${m[1]}"`);
  }
}

// ---------------------------------------------------------------- 4. BHPC selling points
const source = read(BHPC_SOURCE).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
// Sections that sell the product. Excluded: legal text, the related-search
// block, preserved navigation paths, the publisher card, the page-role
// explainer, and the image-only system preview.
const EXCLUDED_SECTION = /download-legal|fanout-block|preserved-download-paths|trust-card|apm-bottom-bridge|apm-system-image-large/;
// Navigation copy about the download page itself, not a claim about the product.
const EXCLUDED_POINT = new Set(['you clicked to inspect the system.']);
const points = [];
for (const m of source.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)) {
  const attrs = m[1];
  if (!/download-section|apm-hero/.test(attrs) || EXCLUDED_SECTION.test(attrs)) continue;
  for (const p of m[2].matchAll(/<(h2|h3|li|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = norm(stripTags(p[2]));
    if (!text || text.endsWith(':') || EXCLUDED_POINT.has(text)) continue;
    points.push(text);
  }
}
const uniquePoints = [...new Set(points)];
if (uniquePoints.length < 50) fail(`Rule 0: only ${uniquePoints.length} selling points extracted from ${BHPC_SOURCE}; the extractor no longer matches its markup`);
const bhpcMatch = html.match(/<div\b[^>]*\bdata-bhpc-section\b[^>]*>([\s\S]*?)<\/div><!-- \/#bhpc -->/);
if (!bhpcMatch) fail('no [data-bhpc-section] block (closed by <!-- /#bhpc -->) on the page');
const bhpcText = bhpcMatch ? norm(stripTags(bhpcMatch[1])) : '';
const firstSection = html.indexOf('data-bhpc-section');
const appSection = html.indexOf('id="app"');
if (!(firstSection > -1 && appSection > firstSection)) fail('the BHPC digital-product section must come before the app (#app)');
if (bhpcMatch && !bhpcMatch[1].includes(links?.gumroad || '\u0000')) fail('the BHPC section does not link to the Gumroad product');
// Points reworded on purpose (persona review, 8 Oct 2026): the digital product
// does not act on its own, so a claim that it does contradicts the "$20 ChatGPT"
// argument. Each source point is replaced by an exact required wording and the
// old wording must be gone. Only these points; every other point is still exact.
const REWORDED = new Map([
  ['situations this handles automatically', 'situations this has a protocol for'],
]);
for (const [from, to] of REWORDED) {
  if (!uniquePoints.includes(from)) fail(`reworded point "${from}" is no longer on ${BHPC_SOURCE}; drop it from REWORDED`);
  if (!bhpcText.includes(to)) fail(`reworded point "${to}" (replaces "${from}") missing from the BHPC section`);
  if (bhpcText.includes(from)) fail(`"${from}" must be reworded to "${to}"`);
}
const HONEST = "BHPC gives your AI the rules. Open it each morning and it holds the line. Want something that reaches you first and doesn't wait to be asked? That's the app.";
const honest = (html.match(/<p\b[^>]*\bdata-bhpc-honest\b[^>]*>([\s\S]*?)<\/p>/i) || [])[1];
if (!honest || norm(stripTags(honest)) !== norm(HONEST)) fail(`the Built-In Execution Guardrails block needs [data-bhpc-honest] reading "${HONEST}"`);
for (const claim of [/they are enforced through the system/i, /handles automatically/i]) if (claim.test(stripTags(html))) fail(`copy claims the digital product enforces on its own: ${claim}`);
const missing = uniquePoints.filter((p) => !REWORDED.has(p) && !bhpcText.includes(p));
for (const p of missing) fail(`BHPC selling point from ${BHPC_SOURCE} missing: "${p}"`);

// ---------------------------------------------------------------- 6. newcomer structure
const H1_TEXT = 'your five-person executive team. two ways to get it.';
const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
const h1Opens = (html.match(/<h1\b/gi) || []).length;
if (h1Opens !== 1 || h1s.length !== 1) fail(`the page needs exactly one h1, found ${h1Opens}`);
const h1At = h1s.length ? h1s[0].index : -1;
if (h1s.length && norm(stripTags(h1s[0][1])) !== H1_TEXT) fail(`the h1 must read "Your five-person executive team. Two ways to get it.", found "${stripTags(h1s[0][1]).trim()}"`);
const firstOf = (needle) => { const i = needle instanceof RegExp ? html.search(needle) : html.indexOf(needle); return i; };
const BHPC_MARKERS = [
  ['the [data-bhpc-section] block', /<[a-z]+\b[^>]*\bdata-bhpc-section\b/i],
  ['a Gumroad link', /href="https:\/\/[^"]*gumroad\.com/i],
  ['"Download Billionaire High Performance Coach"', /download billionaire high performance coach/i],
];
for (const [what, re] of BHPC_MARKERS) {
  const at = firstOf(re);
  if (at === -1) { fail(`Rule 0: ${what} not found, so "h1 before BHPC selling content" checked nothing`); continue; }
  if (!(h1At > -1 && h1At < at)) fail(`the h1 must come before ${what}`);
}
const heroMatch = html.match(/<section\b[^>]*\bdata-hero\b[^>]*>([\s\S]*?)<\/section>/i);
if (!heroMatch) fail('no hero section ([data-hero]) on the page');
else {
  const firstSectionAt = html.search(/<section\b/i);
  if (heroMatch.index !== firstSectionAt) fail('the hero ([data-hero]) must be the first section on the page');
  if (!/<h1\b/i.test(heroMatch[1])) fail('the h1 must sit inside the hero');
  const CARDS = [['app', '#app', 'founding100.monthly'], ['bhpc', '#bhpc', 'bhpc.onetime']];
  for (const [name, target, price] of CARDS) {
    const card = heroMatch[1].match(new RegExp(`<a\\b[^>]*\\bdata-choice="${name}"[^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
    if (!card) { fail(`hero chooser card "${name}" ([data-choice="${name}"]) is missing`); continue; }
    if (!new RegExp(`href="${target}"`).test(card[0])) fail(`hero chooser card "${name}" must jump to ${target}`);
    if (!card[1].includes(`data-price="${price}"`)) fail(`hero chooser card "${name}" must show its price (${price})`);
  }
}
const nav = html.match(/<nav\b[^>]*\bdata-topnav\b[^>]*>([\s\S]*?)<\/nav>/i);
const NAV = [['#app', 'the app'], ['#bhpc', 'the digital product'], ['#plans', 'plans'], ['#compare', 'compare']];
if (!nav) fail('no sticky top nav ([data-topnav])');
else {
  const navLinks = [...nav[1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => [m[1], norm(stripTags(m[2]))]);
  if (JSON.stringify(navLinks) !== JSON.stringify(NAV)) fail(`top nav must be ${JSON.stringify(NAV)}, found ${JSON.stringify(navLinks)}`);
}
const compare = html.match(/<section\b[^>]*\bid="compare"[^>]*>([\s\S]*?)<\/section>/i);
const table = compare && compare[1].match(/<table\b[^>]*\bdata-compare-table\b[^>]*>([\s\S]*?)<\/table>/i);
if (!table) fail('no comparison table ([data-compare-table] inside #compare)');
else {
  const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => norm(stripTags(c[1]))));
  const header = rows[0] || [];
  if (header[1] !== 'digital product' || header[2] !== 'app') fail(`comparison table header must be Digital product | App, found ${JSON.stringify(header)}`);
  const ROWS = ['what it is', 'where it runs', 'who does the work', 'price model', 'best for'];
  const labels = rows.slice(1).map((r) => r[0]);
  if (JSON.stringify(labels) !== JSON.stringify(ROWS)) fail(`comparison table rows must be ${JSON.stringify(ROWS)}, found ${JSON.stringify(labels)}`);
  for (const r of rows.slice(1)) if (r.length !== 3 || r.some((c) => !c)) fail(`comparison row "${r[0]}" needs a non-empty cell for both products`);
  const price = rows.find((r) => r[0] === 'price model');
  if (price && !(/one[- ]time/.test(price[1]) && /subscription/.test(price[2]))) fail('comparison "Price model" must say one-time for the digital product and subscription for the app');
  if (!/can i use both\?/i.test(compare[1])) fail('the comparison must answer "Can I use both?" under the table');
}
const FAQ_QS = ["what's the difference between the app and the digital product?", 'can i use both?', 'is there a free trial?', 'when is the app in the stores?'];
const faq = html.match(/<section\b[^>]*\bid="faq"[^>]*>([\s\S]*?)<\/section>/i);
const faqQs = faq ? [...faq[1].matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi)].map((m) => norm(stripTags(m[1]))) : [];
for (const q of FAQ_QS) if (!faqQs.includes(q)) fail(`FAQ (#faq) is missing "${q}"`);
const ORDER = ['data-hero', 'id="problem"', 'id="llm-gap"', 'id="jobs"', 'id="personas"', 'data-bhpc-section', 'id="app"', 'id="plans"', 'id="get-the-app"', 'id="cost"', 'id="compare"', 'id="faq"'];
const at = ORDER.map((m) => html.indexOf(m));
ORDER.forEach((m, i) => { if (at[i] === -1) fail(`section marker ${m} is missing`); else if (i && at[i] < at[i - 1]) fail(`section ${m} is out of the approved order (must follow ${ORDER[i - 1]})`); });

// ---------------------------------------------------------------- 8. design tokens
const theme = JSON.parse(read(THEME));
const css = read(CSS);
const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const blockAfter = (src, at) => {
  // The {...} body that opens at the first "{" at or after `at`, braces balanced.
  const open = src.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return { start: open, end: i + 1, body: src.slice(open + 1, i) };
  }
  return null;
};
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
const lightAt = cssNoComments.search(/(^|\})\s*:root\s*\{/);
const lightBlock = lightAt === -1 ? null : blockAfter(cssNoComments, lightAt);
const darkMedia = cssNoComments.search(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
const darkMediaBlock = darkMedia === -1 ? null : blockAfter(cssNoComments, darkMedia);
const darkRootAt = darkMediaBlock ? darkMediaBlock.body.search(/:root\s*\{/) : -1;
const darkBlock = darkRootAt === -1 ? null : blockAfter(darkMediaBlock.body, darkRootAt);
if (!lightBlock) fail(`${CSS} has no light :root token block`);
if (!darkBlock) fail(`${CSS} has no :root block inside @media (prefers-color-scheme: dark)`);
const declared = (block) => Object.fromEntries([...(block?.body || '').matchAll(/(--apm-[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]));
const lightDecl = declared(lightBlock);
const darkDecl = declared(darkBlock);
let tokensChecked = 0;
for (const scheme of ['light', 'dark']) {
  const pal = theme.palettes?.[scheme] || {};
  const decl = scheme === 'light' ? lightDecl : darkDecl;
  if (Object.keys(pal).length < 20) fail(`Rule 0: ${THEME} palettes.${scheme} has only ${Object.keys(pal).length} colours`);
  for (const [key, hex] of Object.entries(pal)) {
    tokensChecked++;
    const name = `--apm-${kebab(key)}`;
    if (!(name in decl)) { fail(`${CSS} ${scheme} block does not declare ${name} (app palette ${scheme}.${key} = ${hex})`); continue; }
    if (decl[name].toLowerCase() !== hex.toLowerCase()) fail(`${CSS} ${scheme} ${name} is ${decl[name]}, the app theme says ${hex}`);
  }
}
for (const name of Object.keys(darkDecl)) if (!(name in lightDecl)) fail(`${CSS} dark block declares ${name}, which the light block does not (same token names in both schemes)`);
// No hex colour outside the two token blocks: rules use tokens, never values.
let outside = cssNoComments;
for (const b of [darkMediaBlock && darkBlock ? { start: darkMediaBlock.start + 1 + darkBlock.start, end: darkMediaBlock.start + 1 + darkBlock.end } : null, lightBlock].filter(Boolean).sort((a, b) => b.start - a.start)) {
  outside = outside.slice(0, b.start) + ' '.repeat(b.end - b.start) + outside.slice(b.end);
}
for (const m of outside.matchAll(/#[0-9a-f]{3,8}\b/gi)) fail(`${CSS} hard-codes colour ${m[0]} outside the :root token blocks; use a token`);
const fam = (name) => (lightDecl[name] || '').split(',')[0].replace(/["']/g, '').trim();
if (fam('--apm-font-display') !== theme.fonts?.display?.family) fail(`--apm-font-display must start with "${theme.fonts?.display?.family}", found "${fam('--apm-font-display')}"`);
if (fam('--apm-font-body') !== theme.fonts?.body?.family) fail(`--apm-font-body must start with "${theme.fonts?.body?.family}", found "${fam('--apm-font-body')}"`);
const fontSheet = fontLinks.find((l) => /rel="stylesheet"/.test(l));
if (!fontSheet) fail('the page does not load the app fonts from Google Fonts (<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">)');
else {
  const href = decode(fontSheet.match(/href="([^"]+)"/)[1]);
  if (!href.startsWith('https://fonts.googleapis.com/css2?')) fail(`font stylesheet ${href} is not a Google Fonts css2 URL`);
  if (!new RegExp(`family=Outfit:wght@[^&]*${theme.fonts.display.weight}`).test(href)) fail(`font stylesheet does not request Outfit ${theme.fonts.display.weight}`);
  if (!/family=Nunito\+Sans:wght@[^&]*400/.test(href)) fail('font stylesheet does not request Nunito Sans 400');
}
for (const l of fontLinks) if (!/rel="(preconnect|stylesheet)"/.test(l)) fail(`unexpected Google Fonts link ${l}`);
const themeSrc = sourceDirs.find((d) => fs.existsSync(path.join(d, theme.source_path)));
if (themeSrc) {
  const ts = fs.readFileSync(path.join(themeSrc, theme.source_path), 'utf8');
  for (const scheme of ['light', 'dark']) {
    const body = ts.match(new RegExp(`const ${scheme}: Palette = \\{([\\s\\S]*?)\\};`));
    if (!body) { fail(`palette ${scheme} not found in ${themeSrc}/${theme.source_path}`); continue; }
    const src = Object.fromEntries([...body[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{3,8})'/g)].map((m) => [m[1], m[2]]));
    if (JSON.stringify(src) !== JSON.stringify(theme.palettes[scheme])) fail(`pinned palettes.${scheme} differs from ${themeSrc}/${theme.source_path}; re-copy it`);
  }
  notes.push(`pinned theme compared to ${themeSrc}`);
}

// ---------------------------------------------------------------- public launch
// Public since 8 Oct 2026, card payments live (Stripe via RevenueCat). Robots is
// exactly "noindex, follow", the /amazon/ contract: noindex keeps the page out of
// the generated guide indexes and citation registries of the two sites sharing
// this repo (dropping it makes the build rewrite guides/ on spryexecutiveos.com),
// and "follow" keeps every outbound link live; the old preview "nofollow" is
// refused. "private beta" / "payments open soon" copy would contradict a live
// checkout.
//
// aplayermode.com owns the page (owner, 8 Oct 2026: "move aplayermode.com
// entirely"): canonical, og:url and any JSON-LD url are exactly
// https://aplayermode.com/; the old BHPC address (which now 301s to it) is
// refused anywhere in the page.
const PUBLIC_CANONICAL = 'https://aplayermode.com/';
const robots = (html.match(/<meta\b[^>]*name="robots"[^>]*content="([^"]*)"/i) || [])[1];
if (robots !== 'noindex, follow') fail(`robots meta is ${JSON.stringify(robots)}; expected "noindex, follow" (public, kept out of the shared sites' generated indexes)`);
const canonTags = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/gi)];
if (canonTags.length !== 1) fail(`expected exactly one <link rel="canonical">, found ${canonTags.length}`);
const canon = (html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || [])[1];
if (canon !== PUBLIC_CANONICAL) fail(`canonical is ${canon}; expected ${PUBLIC_CANONICAL}`);
const ogUrl = (html.match(/<meta\b[^>]*property="og:url"[^>]*content="([^"]+)"/i) || [])[1];
if (ogUrl !== PUBLIC_CANONICAL) fail(`og:url is ${ogUrl}; expected ${PUBLIC_CANONICAL}`);
for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
  for (const u of m[1].matchAll(/"(?:url|@id)"\s*:\s*"([^"]+)"/g)) if (!u[1].startsWith(PUBLIC_CANONICAL)) fail(`JSON-LD url ${u[1]} is not on ${PUBLIC_CANONICAL}`);
}
if (/billionairehighperformancecoach\.com\/aplayermode/i.test(html)) fail('the page still names billionairehighperformancecoach.com/aplayermode, which only redirects to aplayermode.com');

// ---------------------------------------------------------------- aplayermode.com owns the page
// The Worker (workers/aplayermode-com) serves / and every file the page loads
// from the Pages origin, 301s everything else, and must never fetch from a host
// that redirects back to it. The Pages Function (functions/aplayermode/index.js)
// 301s /aplayermode/ on the shared sites' hosts and serves it everywhere else.
{
  const workerDir = path.join(ROOT, 'workers', 'aplayermode-com');
  const w = await import(pathToFileURL(path.join(workerDir, 'src', 'index.js')).href);
  if (w.ORIGIN !== 'https://sprylabs-hpc-site.pages.dev') fail(`Worker ORIGIN is ${w.ORIGIN}; it must be the Pages origin https://sprylabs-hpc-site.pages.dev (any BHPC host redirects back: loop)`);
  const page = w.route('/');
  if (page.kind !== 'page' || page.upstream !== '/aplayermode/') fail(`Worker must serve / from /aplayermode/; route('/') = ${JSON.stringify(page)}`);
  const localRefs = refs.filter((r) => r.startsWith('/') && !r.startsWith('//')).map((r) => r.split(/[?#]/)[0]);
  if (localRefs.length === 0) fail('Rule 0: the page loads no local file; the Worker asset check would check nothing');
  for (const ref of new Set(localRefs)) {
    const r = w.route(ref);
    if (r.kind !== 'asset' || r.upstream !== ref) fail(`page loads ${ref} but the aplayermode.com Worker does not serve it (route = ${JSON.stringify(r)})`);
  }
  for (const [p, loc] of [['/aplayermode/', '/'], ['/download', '/'], ['/admin.html', '/'], ['/about.html', '/'], ['/amazon/', 'https://billionairehighperformancecoach.com/amazon/'], ['/amazon/x/', 'https://billionairehighperformancecoach.com/amazon/x/']]) {
    const r = w.route(p);
    if (r.kind !== 'redirect' || r.location !== loc) fail(`Worker route(${p}) must 301 to ${loc}; got ${JSON.stringify(r)}`);
  }
  for (const s of w.SHARED_ASSETS) if (!fs.existsSync(path.join(ROOT, s.slice(1)))) fail(`Worker SHARED_ASSETS lists ${s}, which is no committed file`);
  const wcfg = fs.readFileSync(path.join(workerDir, 'wrangler.jsonc'), 'utf8');
  if (!/"pattern":\s*"aplayermode\.com\/\*"/.test(wcfg) || !/"zone_name":\s*"aplayermode\.com"/.test(wcfg)) fail('workers/aplayermode-com/wrangler.jsonc must route aplayermode.com/* on zone aplayermode.com');
  if (/"name":\s*"sprylabs-hpc-site"/.test(wcfg)) fail('the aplayermode.com Worker must not be named after the Pages project');
  const fnSrc = fs.readFileSync(path.join(ROOT, 'functions', 'aplayermode', 'index.js'), 'utf8');
  const moved = [...((fnSrc.match(/MOVED_HOSTS = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const MOVED_EXPECTED = ['billionairehighperformancecoach.com', 'spryexecutiveos.com', 'www.billionairehighperformancecoach.com', 'www.spryexecutiveos.com'];
  if (JSON.stringify(moved) !== JSON.stringify(MOVED_EXPECTED)) fail(`functions/aplayermode/index.js MOVED_HOSTS is ${JSON.stringify(moved)}; expected exactly ${JSON.stringify(MOVED_EXPECTED)} (pages.dev must keep serving the page: the Worker fetches it there)`);
  if (!/APLAYERMODE_URL = 'https:\/\/aplayermode\.com\/'/.test(fnSrc) || !/status: 301/.test(fnSrc)) fail('functions/aplayermode/index.js must 301 to https://aplayermode.com/');
  const assemble = fs.readFileSync(path.join(ROOT, 'scripts', 'assemble_pages_output.js'), 'utf8');
  if (!/^\s*'workers',/m.test(assemble)) fail('scripts/assemble_pages_output.js must exclude workers/ from the Pages output');
}
const visibleText = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
for (const stale of [/private beta/i, /payments? (open|opening|coming) soon/i, /join the beta/i, /bought in the app through the App Store or Google Play/i]) {
  if (stale.test(visibleText)) fail(`stale pre-launch copy matches ${stale}`);
}

// ---------------------------------------------------------------- hero roles, pictures, AEO copy (owner, 8 Oct 2026)
{
  const hero = (html.match(/<section\b[^>]*\bdata-hero\b[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || '';
  const roles = (hero.match(/<div\b[^>]*\bdata-roles\b[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
  if (!/The 5 roles this system installs:/.test(roles)) fail('hero [data-roles] must lead with "The 5 roles this system installs:"');
  const roleNames = [...roles.matchAll(/<li>\s*<b>([^<:]+):<\/b>/g)].map((m) => m[1].trim());
  const ROLE_ORDER = ['Executive Coach', 'Executive Assistant', 'Chief of Staff', 'Accountability Partner', 'Cognitive Behavioral Mindset Coach'];
  if (JSON.stringify(roleNames) !== JSON.stringify(ROLE_ORDER)) fail(`hero roles ${JSON.stringify(roleNames)}; expected ${JSON.stringify(ROLE_ORDER)}`);
  const chips = (hero.match(/<ul\b[^>]*\bdata-role-chips\b[^>]*>([\s\S]*?)<\/ul>/i) || [])[1] || '';
  const chipNames = [...chips.matchAll(/<li\b[^>]*>([^<]+)<\/li>/g)].map((m) => m[1].trim());
  if (JSON.stringify(chipNames) !== JSON.stringify(ROLE_ORDER)) fail(`hero role chips ([data-role-chips]) ${JSON.stringify(chipNames)}; expected ${JSON.stringify(ROLE_ORDER)}`);
  if (chips && hero.indexOf('data-role-chips') > hero.indexOf('data-roles')) fail('hero role chips must come before the full role descriptions');
  for (const choice of ['app', 'bhpc']) {
    const card = (hero.match(new RegExp(`<a\\b[^>]*data-choice="${choice}"[^>]*>([\\s\\S]*?)<\\/a>`, 'i')) || [])[1] || '';
    const img = card.match(/<img\b[^>]*>/i);
    if (!img) { fail(`hero chooser card "${choice}" has no picture`); continue; }
    const src = (img[0].match(/src="([^"]+)"/) || [])[1] || '';
    const alt = (img[0].match(/alt="([^"]*)"/) || [])[1] || '';
    if (!/^\/aplayermode\/img\/[\w-]+\.webp$/.test(src) || !fs.existsSync(path.join(ROOT, src.slice(1)))) fail(`hero card "${choice}" picture ${src} must be a committed webp under /aplayermode/img/`);
    else if (fs.statSync(path.join(ROOT, src.slice(1))).size > 150000) fail(`hero card "${choice}" picture ${src} is over 150 KB; optimise it`);
    if (alt.trim().length < 15) fail(`hero card "${choice}" picture needs real alt text`);
    if (!/\bwidth="\d+"/.test(img[0]) || !/\bheight="\d+"/.test(img[0])) fail(`hero card "${choice}" picture needs width/height (no layout shift)`);
  }
  const bhpcCard = (hero.match(/<a\b[^>]*data-choice="bhpc"[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '';
  if (!bhpcCard.includes('installs that structure into ChatGPT, Claude, Gemini, Perplexity, DeepSeek, or the LLM you already use')) fail('the LLM install line belongs on the digital-product card');
  const gap = (html.match(/<section\b[^>]*\bdata-llm-gap\b[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || '';
  if (!/<h2>LLMs Give Advice\. They Do Not Enforce Behavior Across Days\.<\/h2>/.test(gap)) fail('section [data-llm-gap] must be headed "LLMs Give Advice. They Do Not Enforce Behavior Across Days."');
  if ((html.match(/<h2>LLMs Give Advice/g) || []).length !== 1) fail('"LLMs Give Advice..." must be the h2 of exactly one section (#llm-gap)');
  for (const w of ['$20', 'Founders, executives, working parents, operators', 'Continuity, daily sequencing and accountability']) if (!gap.includes(w)) fail(`section [data-llm-gap] is missing "${w}"`);
  if ((gap.match(/<b>A chat on its own:<\/b>/g) || []).length < 3 || (gap.match(/<b>With the system:<\/b>/g) || []).length < 3) fail('section [data-llm-gap] must contrast a chat on its own with the system in at least 3 cards');
  const DISCLAIMER = [
    'This product is not affiliated with, endorsed by, or sponsored by Showtime, CBS, Billions, or any television network or media property. Any references to executive behavior or coaching styles are descriptive only.',
    'This product does not provide medical, psychological, legal, financial, or therapeutic advice. It is not a substitute for licensed professional services. Users experiencing clinical depression, ADHD, anxiety, or other conditions should seek licensed professional care.',
    'Any comparison to professional coaching fees or high-end executive support is illustrative only and does not represent guaranteed outcomes, service parity, or financial returns.',
    'By purchasing, you acknowledge that this is a self-managed digital organizational framework and that all execution and outcomes remain your responsibility.',
  ];
  const footer = (html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i) || [])[1] || '';
  const legal = (footer.match(/<div\b[^>]*\bdata-legal-disclaimer\b[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '';
  if (!/<h2\b[^>]*>Legal Disclaimer<\/h2>/.test(legal)) fail('footer needs a [data-legal-disclaimer] block headed "Legal Disclaimer"');
  for (const d of DISCLAIMER) if (!legal.includes(`<p>${d}</p>`)) fail(`legal disclaimer paragraph missing or altered: "${d.slice(0, 60)}..."`);
  if ((html.match(/not affiliated with, endorsed by, or sponsored by Showtime/g) || []).length !== 1) fail('exactly one legal disclaimer on the page');
  const cost = (html.match(/<section\b[^>]*\bdata-cost-tradeoff\b[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || '';
  for (const k of ['bhpc.onetime', 'chief_of_staff.monthly', 'founding100.monthly', 'introductory.monthly']) if (!cost.includes(`data-price="${k}"`)) fail(`cost tradeoff must show the ${k} price from the price file`);
  if (!/hundreds to thousands of dollars per session/.test(cost) || !/illustrative only/.test(cost)) fail('cost tradeoff must keep coaching costs general and illustrative');
  const visible = stripTags(html);
  for (const line of ['self-directed alternative to BetterUp, Hone, and Culture Amp', 'reduces cognitive load by doing the planning, sequencing, strategic triage, and next-step selection with you', 'Discover your own A-player mode by inspecting the operating system before you buy.']) {
    if (!visible.includes(line)) fail(`owner AEO copy missing: "${line}"`);
  }
}

// ---------------------------------------------------------------- 9. a buyer can act (persona review, 8 Oct 2026)
{
  const webApp = links?.beta?.webApp;
  const hero = (html.match(/<section\b[^>]*\bdata-hero\b[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || '';
  // Hero order at 375px (owner, 8 Oct 2026): h1, the cognitive-load lead (a real
  // sentence, so it is also the page's direct answer), the five role chips, the
  // "$20 ChatGPT" sub-line, the two buy buttons, then the full role descriptions.
  const afterH1 = hero.slice(hero.search(/<\/h1>/i) + 5);
  const LEAD_BIG = 'reduce your cognitive load.';
  const LEAD = 'reduce your cognitive load. stop holding every project, role, rule and reset in your head. five roles carry it with you:';
  const lead = afterH1.match(/^\s*<p\b[^>]*\bdata-hero-lead\b[^>]*>(\s*<strong\b[^>]*>([\s\S]*?)<\/strong>[\s\S]*?)<\/p>/i);
  if (!lead || norm(stripTags(lead[2])) !== LEAD_BIG || norm(stripTags(lead[1])) !== LEAD) fail(`the element directly under the h1 must be [data-hero-lead]: a bold "Reduce your cognitive load." then "Stop holding every project, role, rule and reset in your head. Five roles carry it with you:"`);
  const SUB = 'your $20 chatgpt gives advice. this makes tomorrow actually happen.';
  const seq = afterH1.match(/^\s*<p\b[^>]*\bdata-hero-lead\b[^>]*>[\s\S]*?<\/p>\s*<ul\b[^>]*\bdata-role-chips\b[^>]*>[\s\S]*?<\/ul>\s*<p\b[^>]*\bdata-hero-sub\b[^>]*>([\s\S]*?)<\/p>\s*<div\b[^>]*\bdata-hero-ctas\b[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*\bdata-roles\b/i);
  if (!seq || norm(stripTags(seq[1])) !== SUB) fail('hero order must be: h1, [data-hero-lead], [data-role-chips], [data-hero-sub] "Your $20 ChatGPT gives advice. This makes tomorrow actually happen.", [data-hero-ctas], then [data-roles]');
  const ctas = seq ? [null, seq[2]] : null;
  const desc = (html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]*)"/i) || [])[1] || '';
  if (!/reduce cognitive load/i.test(desc)) fail('the meta description must say "reduce cognitive load"');
  const og = (html.match(/<meta\b[^>]*property="og:description"[^>]*content="([^"]*)"/i) || [])[1];
  if (og !== undefined && !/reduce cognitive load/i.test(og)) fail('og:description must say "reduce cognitive load"');
  if (!ctas) fail('the two hero buy buttons ([data-hero-ctas]) must follow the sub-line directly');
  else {
    const btn = (k) => ctas[1].match(new RegExp(`<a\\b[^>]*\\bdata-hero-cta="${k}"[^>]*>([\\s\\S]*?)<\\/a>`, 'i'));
    const HERO_CTAS = [['app', links?.join, 'founding100.monthly', /^join the founding 100 - \$9\.99\/month$/], ['bhpc', links?.gumroad, 'bhpc.onetime', /^get bhpc · \$49$/]];
    for (const [k, url, price, label] of HERO_CTAS) {
      const b = btn(k);
      if (!b) { fail(`hero buy button [data-hero-cta="${k}"] is missing`); continue; }
      if (!b[0].includes(`href="${url}"`)) fail(`hero buy button ${k} must go to ${url}`);
      if (!b[1].includes(`data-price="${price}"`)) fail(`hero buy button ${k} must show its price (${price})`);
      if (!label.test(flat(foundingPart(b[1])))) fail(`hero buy button ${k} reads "${stripTags(b[1]).trim()}"`);
      if (k === 'app') checkStandardPart(b[1], 'hero buy button app');
    }
  }
  const seeApp = hero.match(/<a\b[^>]*\bdata-choice-cta="app"[^>]*>([\s\S]*?)<\/a>/i);
  if (!seeApp || !seeApp[0].includes(`href="${webApp}"`) || norm(stripTags(seeApp[1])) !== 'see the app →') fail(`hero "See the app →" ([data-choice-cta="app"]) must go to the web app ${webApp}`);
  const DAY1 = { app: "in 3 minutes: tomorrow's plan is set, waiting for you each morning.", bhpc: 'in 20 minutes: your ai has your rules. say the trigger each morning.' };
  for (const [k, text] of Object.entries(DAY1)) {
    const card = (hero.match(new RegExp(`<a\\b[^>]*data-choice="${k}"[^>]*>([\\s\\S]*?)<\\/a>`, 'i')) || [])[1] || '';
    const d = card.match(new RegExp(`<span\\b[^>]*\\bdata-day1="${k}"[^>]*>([\\s\\S]*?)<\\/span>`, 'i'));
    if (!d || norm(stripTags(d[1])) !== text) fail(`hero card ${k} needs its day-1 promise [data-day1="${k}"]: "${text}"`);
  }
  // No web/iPhone user gets an Expo push; the agenda waits for them (aplayer-mode
  // services/api/src/morningTrigger.ts sends push only). Never promise "arrives on its own".
  if (/arrives on its own|sends your agenda on its own/i.test(stripTags(html))) fail('copy promises the agenda "arrives on its own"; only Android gets a morning push');
  // Every plan card carries its CTA: Executive Roundtable straight to the Founding 100 checkout,
  // the other two to the web app. Founding 100 and Executive Roundtable lead (owner, 8 Oct 2026):
  // the Founding 100 offer sits above the cards with its own join button, the Roundtable card is
  // the only lead card, and Autopilot ($79.99) is never featured and never a primary button.
  const PLAN_CTAS = ['join the founding 100 - $9.99/month', // norm() folds the em dash to '-'
    'start executive suite →', 'start autopilot →'];
  const PLAN_HREFS = [links?.join, webApp, webApp];
  const tierOpens = [...html.matchAll(/<div\b[^>]*class="card tier( tier-lead)?"[^>]*>/gi)];
  const tiers = [...html.matchAll(/<div\b[^>]*class="card tier(?: tier-lead)?"[^>]*>([\s\S]*?)\n      <\/div>/gi)].map((m) => m[1]);
  if (JSON.stringify(tierOpens.map((m) => Boolean(m[1]))) !== JSON.stringify([true, false, false])) fail('only the first plan card (Executive Roundtable) may be the lead card (class "card tier tier-lead")');
  if (tiers[2] && (/\bbtn-primary\b/.test(tiers[2]) || /class="badge"|featured|recommended|most popular/i.test(tiers[2]))) fail('the Autopilot card must not be featured: no badge, no "featured/recommended", no btn-primary');
  const offerAt = html.indexOf('id="founding-100"'); const firstTier = tierOpens[0]?.index ?? -1;
  if (offerAt === -1 || firstTier === -1 || offerAt > firstTier) fail('the Founding 100 offer (#founding-100) must sit above the plan cards');
  const offerCard = (html.slice(offerAt).match(/^[\s\S]*?\n    <\/div>/) || [''])[0];
  const fcta = [...offerCard.matchAll(/<a\b([^>]*\bdata-founding-cta\b[^>]*)>([\s\S]*?)<\/a>/gi)];
  if (fcta.length === 1) checkStandardPart(fcta[0][2], 'the Founding 100 offer button');
  if (!/<div\b[^>]*\bdata-founding-full\b[^>]*\bhidden\b[^>]*>[\s\S]*?the founding 100 is full/i.test(offerCard)) fail('the Founding 100 offer needs a hidden [data-founding-full] block saying "The Founding 100 is full"');
  if (!/<div\b[^>]*\bdata-founding-open\b[^>]*>/i.test(offerCard)) fail('the Founding 100 offer copy must sit in [data-founding-open] so app.js can hide it once full');
  if (fcta.length !== 1 || !fcta[0][1].includes(`href="${links?.join}"`) || flat(foundingPart(fcta[0][2])) !== PLAN_CTAS[0]) fail(`the Founding 100 offer needs one [data-founding-cta] "Join the Founding 100 — $9.99/month" to ${links?.join}`);
  if (tiers.length !== 3) fail(`expected 3 plan cards, found ${tiers.length}`);
  tiers.forEach((t, i) => {
    const c = [...t.matchAll(/<a\b([^>]*\bdata-plan-cta\b[^>]*)>([\s\S]*?)<\/a>/gi)];
    if (c.length !== 1) { fail(`plan card ${i + 1} needs exactly one CTA ([data-plan-cta]), found ${c.length}`); return; }
    if (!c[0][1].includes(`href="${PLAN_HREFS[i]}"`)) fail(`plan card ${i + 1} CTA must go to ${PLAN_HREFS[i]}`);
    if (i === 0) checkStandardPart(c[0][2], 'the Executive Roundtable CTA');
    if (flat(i === 0 ? foundingPart(c[0][2]) : c[0][2]) !== PLAN_CTAS[i]) fail(`plan card ${i + 1} CTA reads "${stripTags(c[0][2]).trim()}", expected "${PLAN_CTAS[i]}"`);
    if (i === 0 && !c[0][2].includes('data-price="founding100.monthly"')) fail('the Executive Roundtable CTA price must be the pinned founding100 price');
  });
  // Cancel and refund answers.
  const faqBlock = (k) => (html.match(new RegExp(`<details\\b[^>]*\\bdata-faq="${k}"[^>]*>([\\s\\S]*?)<\\/details>`, 'i')) || [])[1] || '';
  const cancel = norm(stripTags(faqBlock('cancel')));
  if (!cancel.startsWith('can i cancel?') || !cancel.includes('cancel anytime from settings → manage subscription')) fail('FAQ needs "Can I cancel?" answered "Cancel anytime from Settings → Manage subscription"');
  if (srcDir && !/const FOUNDING_PLACES_PATH = '\/v1\/billing\/founding';/.test(fs.readFileSync(path.join(srcDir, 'services/api/src/index.ts'), 'utf8'))) fail('the join buttons follow APM_LINKS.founding, but aplayer-mode has no GET /v1/billing/founding route');
  if (srcDir && !/app\.get\('\/v1\/billing\/web\/portal'/.test(fs.readFileSync(path.join(srcDir, 'services/api/src/index.ts'), 'utf8'))) fail('the cancel FAQ points at Manage subscription, but aplayer-mode has no GET /v1/billing/web/portal route');
  const refund = norm(stripTags(faqBlock('refund')));
  if (!refund.includes('no refunds as standard') || !refund.includes('case by case')) fail('FAQ needs the BHPC refund answer, stating only the Gumroad listing policy (no refunds as standard; case by case)');
  // Shown once outside the folded "Full product description".
  const fold = html.match(/<details\b([^>]*)\bdata-everything\b([^>]*)>\s*<summary>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/i);
  if (!fold) fail('the frozen /download copy must sit in a <details data-everything>');
  else {
    if (/\bopen\b/.test(fold[1] + fold[2])) fail('the "Full product description" <details> must be closed by default');
    if (norm(stripTags(fold[3])) !== 'full product description') fail('the folded block must be labelled "Full product description"');
    const outside = stripTags(html.replace(fold[0], ' '));
    const count = (re) => (outside.match(re) || []).length;
    for (const r of ['Executive Coach', 'Executive Assistant', 'Chief of Staff', 'Accountability Partner', 'Cognitive Behavioral Mindset Coach']) {
      const heroOnly = stripTags(html.replace(fold[0], ' ').replace(/<div\b[^>]*\bdata-roles\b[^>]*>[\s\S]*?<\/div>/i, ' ').replace(/<ul\b[^>]*\bdata-role-chips\b[^>]*>[\s\S]*?<\/ul>/i, ' '));
      const left = (heroOnly.match(new RegExp(`\\b${r}\\b(?! Track)`, 'g')) || []).length;
      if (left) fail(`role "${r}" appears ${left} time(s) outside the hero roles and the folded block; show the five roles once`);
    }
    if (count(/LLMs Give Advice/g) !== 1) fail(`"LLMs Give Advice" appears ${count(/LLMs Give Advice/g)} times outside the folded block; once`);
    if (count(/self-directed alternative to BetterUp, Hone, and Culture Amp/g) !== 1) fail('the BetterUp line must appear exactly once outside the folded block');
    if (!/\$1,000–\$3,000 per session/.test(outside)) fail('"$1,000–$3,000 per session" must stay visible outside the folded block');
  }
  // "Without the System / With the Protocol" rows directly under the LLM-gap h2.
  const gap = (html.match(/<section\b[^>]*\bdata-llm-gap\b[^>]*>([\s\S]*?)<\/section>/i) || [])[1] || '';
  if (!/<\/h2>\s*<div\b[^>]*\bdata-diff-rows\b/.test(gap)) fail('the Without/With rows ([data-diff-rows]) must sit directly under the "LLMs Give Advice" h2');
  const rows = [...gap.matchAll(/data-persona-row="([^"]+)"/g)].map((m) => m[1]);
  if (JSON.stringify(rows) !== JSON.stringify(['founder', 'parent', 'operator'])) fail(`LLM-gap persona rows ${JSON.stringify(rows)}; expected founder, parent, operator`);
  // Accuracy.
  if (/books appointments/i.test(stripTags(html))) fail('Autopilot requests appointments by email; it does not "book appointments"');
  const where = compare && (compare[1].match(/<tr>\s*<td>Where it runs<\/td>\s*<td>[\s\S]*?<\/td>\s*<td>([\s\S]*?)<\/td>/i) || [])[1];
  if (!where || norm(stripTags(where)) !== 'web and android today; iphone soon') fail('compare "Where it runs" for the app must read "Web and Android today; iPhone soon"');
}

// ---------------------------------------------------------------- report
// ---------------------------------------------------------------- 10. testimonials and launch updates (owner, 8 Oct 2026)
{
  // Testimonials: never a quote in the static page (no invented quotes); hidden until app.js
  // reads at least one consented entry from the ONE file (aplayer-mode apps/mobile/public/testimonials.json).
  const t = html.match(/<section\b([^>]*\bdata-testimonials\b[^>]*)>([\s\S]*?)<\/section>/i);
  if (!t) fail('the testimonials section ([data-testimonials]) is missing');
  else {
    if (!/\bhidden\b/.test(t[1])) fail('the testimonials section must be hidden in the static page (app.js shows it only when the file has quotes)');
    if (!/<div\b[^>]*\bdata-testimonial-list\b[^>]*><\/div>/.test(t[2])) fail('the testimonial list must be empty in the static page: quotes come only from the data file, never written into the page');
    if (/<blockquote|<figure|&ldquo;|“/i.test(t[2])) fail('a quote is written into the static page; testimonials come only from the data file');
  }
  const appJs = read(path.join(path.dirname(CONFIG_JS), 'app.js'));
  if (!/typeof t\.consent === 'string' && t\.consent\.trim\(\)/.test(appJs)) fail('app.js must show only testimonials with a consent record');
  if (!/q\.textContent = '“' \+ t\.quote/.test(appJs) || /innerHTML\s*=\s*[^;]*\bt\./.test(appJs)) fail('app.js must render testimonial text with textContent, never innerHTML');
  // Launch updates: hidden until the endpoint answers; explicit consent with a version; no other endpoint.
  const l = html.match(/<section\b([^>]*\bdata-launch-updates\b[^>]*)>([\s\S]*?)<\/section>/i);
  if (!l) fail('the launch-updates section ([data-launch-updates]) is missing');
  else {
    if (!/\bhidden\b/.test(l[1])) fail('the launch-updates section must be hidden in the static page (app.js shows it once the endpoint answers)');
    const box = l[2].match(/<input\b[^>]*type="checkbox"[^>]*name="consent"[^>]*>/i);
    if (!box || !/\brequired\b/.test(box[0]) || /\bchecked\b/.test(box[0]) || !/data-consent-version="\d{4}-\d{2}-\d{2}"/.test(box[0])) fail('the launch-updates consent must be an unticked, required checkbox carrying data-consent-version');
    if (/\baction\s*=/.test(l[2])) fail('the launch-updates form must post only through app.js to APM_LINKS.launchUpdates (no form action)');
    const wording = norm(stripTags((l[2].match(/<span\b[^>]*\bdata-consent-text\b[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || ''));
    if (!wording.includes('launch updates') || !wording.includes('unsubscribe')) fail('the consent wording must say what is sent (launch updates) and that unsubscribing is possible');
    // The server stores ITS copy of the wording; the page must show exactly that copy and version.
    const serverFile = srcDir && path.join(srcDir, 'services/api/src/launchUpdates.ts');
    if (serverFile && fs.existsSync(serverFile)) {
      const ts = fs.readFileSync(serverFile, 'utf8');
      const ver = (ts.match(/version: '([^']+)'/) || [])[1]; const text = (ts.match(/text: '([^']+)'/) || [])[1];
      if (!box || !box[0].includes(`data-consent-version="${ver}"`)) fail(`the consent version on the page differs from the server's (${ver})`);
      if (wording !== norm(text || '')) fail('the consent wording on the page differs from the server copy in services/api/src/launchUpdates.ts');
      notes.push('launch-updates consent compared to the server copy');
    }
  }
}

const summary = `${tokensChecked} theme tokens, ${priceEls.length} prices, ${refs.length} links, ${linkEls.length} download buttons, ${uniquePoints.length} BHPC selling points, ${h1s.length} h1, ${ORDER.length} sections in order, ${FAQ_QS.length} FAQ questions`;
for (const n of notes) console.log(`${LABEL} note: ${n}`);
if (failures.length) {
  for (const f of failures) console.error(`${LABEL} FAIL ${f}`);
  console.error(`${LABEL} FAIL (${failures.length}) - checked ${summary}`);
  process.exit(1);
}
console.log(`${LABEL} PASS - checked ${summary}`);
