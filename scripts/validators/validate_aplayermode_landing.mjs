#!/usr/bin/env node
/**
 * Guards the A Player Mode landing page (aplayermode/index.html), built as a
 * private preview for aplayermode.com.
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
 *      trial?" whose answer starts with "No". Anywhere else it fails.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const LABEL = '[validate:aplayermode-landing]';
const PAGE = process.env.APM_LANDING_PAGE || 'aplayermode/index.html';
const CONFIG_JS = process.env.APM_LANDING_CONFIG || 'aplayermode/config.js';
const PRICES = process.env.APM_LANDING_PRICES || 'config/aplayermode_plan_prices.json';
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
  .replace(/&rarr;/g, '→').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…');
const stripTags = (s) => decode(s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, ' '));
const norm = (s) => decode(s).toLowerCase()
  .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/\s+/g, ' ').trim();
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

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

const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const EXTERNAL_ALLOW = new Set([links?.gumroad].filter(Boolean));
// Inline script bodies are code, not links (the site build injects the Clarity
// loader, whose code builds a URL string), and <link rel=canonical|alternate>
// is metadata the site build stamps on every page, not a link a reader follows.
const linkScan = html
  .replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*\brel="(canonical|alternate)"[^>]*>/gi, '');
const refs = [...linkScan.matchAll(/\b(href|src)\s*=\s*"([^"]*)"/gi)].map((m) => m[2]);
if (refs.length === 0) fail('Rule 0: no href/src found on the page');
const fileExists = (p) => {
  const clean = decodeURIComponent(p.split(/[?#]/)[0]).replace(/^\//, '');
  return [clean, path.join(clean, 'index.html'), `${clean}.html`].some((c) => c && fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile());
};
for (const ref of refs) {
  if (ref === '' || ref === '#' || /^javascript:/i.test(ref)) { fail(`empty or dead link: href/src="${ref}"`); continue; }
  if (ref.startsWith('#')) { if (!ids.has(ref.slice(1))) fail(`in-page link ${ref} has no matching id`); continue; }
  if (/^https?:\/\//i.test(ref)) { if (!EXTERNAL_ALLOW.has(ref)) fail(`external link ${ref} is not in the allow-list (APM_LINKS.gumroad)`); continue; }
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
const missing = uniquePoints.filter((p) => !bhpcText.includes(p));
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
const ORDER = ['data-hero', 'id="problem"', 'id="jobs"', 'id="personas"', 'data-bhpc-section', 'id="app"', 'id="plans"', 'id="get-the-app"', 'id="compare"', 'id="faq"'];
const at = ORDER.map((m) => html.indexOf(m));
ORDER.forEach((m, i) => { if (at[i] === -1) fail(`section marker ${m} is missing`); else if (i && at[i] < at[i - 1]) fail(`section ${m} is out of the approved order (must follow ${ORDER[i - 1]})`); });

// ---------------------------------------------------------------- report
const summary = `${priceEls.length} prices, ${refs.length} links, ${linkEls.length} download buttons, ${uniquePoints.length} BHPC selling points, ${h1s.length} h1, ${ORDER.length} sections in order, ${FAQ_QS.length} FAQ questions`;
for (const n of notes) console.log(`${LABEL} note: ${n}`);
if (failures.length) {
  for (const f of failures) console.error(`${LABEL} FAIL ${f}`);
  console.error(`${LABEL} FAIL (${failures.length}) - checked ${summary}`);
  process.exit(1);
}
console.log(`${LABEL} PASS - checked ${summary}`);
