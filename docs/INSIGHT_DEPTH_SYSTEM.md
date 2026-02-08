# Insight Depth System (1,000-pages effect without 1,000 URLs)

This repo is designed to hit *impressions scale* by maximizing **queries per URL** and **freshness per pillar**.

## What the automation already does (daily)

Every day the GitHub Action:

1) releases exactly **one** draft from `content/insights/_drafts/` into `content/insights/`  
2) rebuilds:
   - `insights/*.html` (post pages)
   - pillar pages + pillar indexes
   - sitemap + llms.txt
3) commits + pushes to `main`

Selection rule is deterministic:
- If drafts are named `YYYY-MM-DD_<anything>.md`, the system publishes **the next available date** (UTC).
- It never publishes nothing while dated drafts exist.

## Lever A — Living Pages (updates without new URLs)

Pillar pages and indexes are rebuilt daily and always reflect:
- newest posts
- updated `last updated` metadata (where applicable)
- fresh internal links

This creates **freshness signals** without needing a new URL explosion.

## Lever B — Query fan-out inside a single page (implemented)

Post pages now include an auto-generated **“Questions answered on this page”** section.

How it works:
- The build pipeline extracts your Markdown headings (H2/H3) and assigns stable anchor IDs
- The HTML renderer surfaces those headings as a TOC at the top of the page

Net effect:
- One URL can credibly support dozens of long-tail queries, because each H2/H3 is a query target.

## Lever C — AI citation harvesting

Your pages are:
- clean, fast, non-spammy
- canonicalized
- internally linked
- structured with quote-friendly sections

This increases citation probability in LLM answers (not guaranteed, but engineered for it).

## How to write drafts so the system “prints” impressions

**Minimum template for drafts:**
- Title = the primary question
- 8–15 H2 questions (each one is a query target)
- Optional: 5–10 H3 sub-questions under the most important H2s
- End with a short “What to do next” section + CTA

If you do this consistently, you don’t need 1,000 standalone pages/month.
You need **1 strong page/day** with depth and internal links.
