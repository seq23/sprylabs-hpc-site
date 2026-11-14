# BHPC link tracking (8 Nov 2026)

Goal: the next Billionaire High Performance Coach sale says where the buyer came from.

## What Gumroad really records

Checked in Gumroad's own code (open source: `antiwork/gumroad`, `app/controllers/concerns/utm_link_tracking.rb`,
`app/services/utm_link_visit_recorder.rb`) and help article 270 ("URL parameters"):

- A visit to the product page that carries **all three** of `utm_source`, `utm_medium`, `utm_campaign`
  (with optional `utm_term`, `utm_content`) creates a UTM link in her Gumroad dashboard and credits the
  sale to it. With one of the three missing, nothing is recorded. Values are lowercased and any character
  outside `a-z 0-9 - _` becomes `-`. It needs the buyer's cookies on.
- `?referrer=<url>` on the product link overrides the referrer Gumroad stores for the sale.
- The Sales API (`GET /v2/sales`) returns `referrer` for every sale. In Gumroad's code it also returns the
  five utm fields. The live API did not return them yet on 8 Nov 2026, so the weekly count falls back to
  the referrer.
- Our buy links carry `rel="noopener noreferrer"`, so before this change Gumroad saw no referring page at all.

## The one scheme (her final call, 8 Nov 2026)

All three of `utm_source`, `utm_medium`, `utm_campaign` are always present, lowercase, `a-z 0-9 - _` only.
The tags must sit on the buy link itself: tags on our own page's address never reach Gumroad.

| Link | utm_source | utm_medium | utm_campaign |
|---|---|---|---|
| Buy button on billionairehighperformancecoach.com | `billionairehighperformancecoach` (the host; Gumroad turns a `.` into `-`, so it is left off) | `site` | `<page slug>-<button>` (`home-btn-purchase`, `download-pricing-2`, `amazon-task-paralysis-companion-top`) |
| Buy button on aplayermode.com | `aplayermode` | `site` | `<page slug>-<button>` |
| KDP book link | `kdp` (`kindle` is already printed in the published books and counts as kdp) | `book` | book slug |
| Pin, Instagram or TikTok post or bio | `pinterest` / `instagram` / `tiktok` | `social` | pin or post slug |
| A link she sends by hand | `direct-share` | `share` | who or what it is for |

The button is the nearest section id above the link (numbered when repeated). A link that already carries
`utm_source` (the Kindle companion buttons) keeps its own tags.

On-site tags are written by `node scripts/tracking/tag_buy_links.mjs` (idempotent; `--check` lists any page
that needs it). Guard: `tests/buy_link_tags.test.mjs`. When a visitor arrives with inbound tags (a book, a
pin, a shared link), `assets/domain-context.js` and `aplayermode/app.js` swap those tags onto the buy links
for that browser tab's session, and the page and button move into `utm_content`. When an untagged visitor
comes from another site, that site is passed to Gumroad as `?referrer=`.

### Her share link (paste as is)

- To the sales page: `https://billionairehighperformancecoach.com/download?utm_source=direct-share&utm_medium=share&utm_campaign=sequoia`
- Straight to checkout: `https://sprylabs.gumroad.com/l/billionaire-high-performance-coach?utm_source=direct-share&utm_medium=share&utm_campaign=sequoia`

Swap `sequoia` for a word naming the person or group when it helps (`utm_campaign=founders-group`).

## Free page analytics

- **Microsoft Clarity** (free, on both shared hosts and aplayermode.com) is the page analytics: visits per
  page with the UTM source, medium and campaign and the referrer.
  On aplayermode.com it records only a page with a form marked `data-session-recording` (today the
  home page launch-updates form; risk R-PRV-03), proved by `tests/aplayermode/clarity_forms_only.test.mjs`.
- **Cloudflare Web Analytics: NAMED STOP [WEB_ANALYTICS_AUTO_SETUP].** The three Web Analytics sites
  (billionairehighperformancecoach.com, spryexecutiveos.com, aplayermode.com) are "automatic setup" sites.
  Cloudflare never injects their beacon into these Pages responses (0 page loads recorded), and their
  tokens refuse a manual beacon (HTTP 404 from `cdn-cgi/rum`, which shows as a CORS error in every visitor's
  console; checked 8 Nov 2026). No vault token may change a Web Analytics site, so no page carries the
  beacon (`scripts/tracking/tag_buy_links.mjs` strips it; `tests/buy_link_tags.test.mjs` guards it).
  The fix needs her Cloudflare sign-in: Cloudflare dashboard › Analytics & Logs › Web Analytics › each of
  the three sites › Manage site › switch from automatic setup to the JS snippet. Then put the snippet's
  token back on the pages (a one-line change in the tagger). Until then the search loop's AI-referral
  numbers read "not read".

## The weekly count

The Wednesday `weekly-outcome-report.yml` run writes `bhpc_sales_by_source` into the `spry-weekly-summary`
artifact (Boss OS, "Spry Labs weekly"; source for the spry brain's Numbers). It holds counts only, never a
name or address: last 7 days of BHPC sales by `utm_source / utm_medium / utm_campaign`, else referrer host,
else "direct or unknown". If the read fails it says `not read: <reason>`, never 0.
Code: `.github/scripts/spry_weekly_summary.mjs` (`bhpcSourceCounts`, guarded by its `--self-check`).
