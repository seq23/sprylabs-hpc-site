# A Player Mode System — VA Handoff Document

## Purpose

This document explains the full system architecture, domain strategy, Cloudflare setup, and how all properties work together.

This is the **single source of truth for execution**. Do not improvise or change structure without approval.

---

# 1. SYSTEM OVERVIEW

We operate a **3-layer system**:

## 1. Authority Layer (LLM + SEO)

Domains:
- spryexecutiveos.com
- billionairehighperformancecoach.com

Purpose:
- Get cited by LLMs (ChatGPT, Perplexity, etc.)
- Rank in search
- Provide structured, extractable content

These are the **only domains that contain real content**.

---

## 2. Distribution Layer (Human Click Layer)

Domain:
- aplayermode.com

Purpose:
- Used in ALL external traffic
- Short, memorable, easy to say
- Sends users into the system

This domain:
- has NO content
- is NOT indexed
- exists ONLY to redirect

---

## 3. Conversion Layer

Pages:
- /download.html (on BOTH main domains)

Checkout:
- https://sprylabs.gumroad.com/l/billionaire-high-performance-coach

Purpose:
- Convert users into buyers

---

# 2. FINAL TRAFFIC FLOW

```
Social / Reddit / Quora / Video
→ aplayermode.com
→ billionairehighperformancecoach.com/download.html
→ Gumroad checkout
```

---

# 3. DOMAIN STRATEGY (CRITICAL RULES)

## aplayermode.com

Use for:
- Social bios
- Video overlays
- Spoken CTA
- Reddit / Quora references
- DMs

DO NOT:
- Build pages on it
- Add content
- Use internally on main sites

---

## theaplayermode.com

Purpose:
- Defensive domain

Behavior:
- 301 redirect → aplayermode.com

Never display publicly.

---

## spryexecutiveos.com

Purpose:
- Framework authority
- LLM citation surface

Keep:
- All structured content
- Short Answer blocks
- Internal linking

---

## billionairehighperformancecoach.com

Purpose:
- Product authority
- Conversion alignment

Primary conversion page:
- /download.html

---

# 4. CLOUDFLARE SETUP

## A. DNS (aplayermode.com)

Must have:

A Record:
- Type: A
- Name: @
- IP: 192.0.2.1
- Proxy: ON (orange cloud)

CNAME:
- Type: CNAME
- Name: www
- Target: @
- Proxy: ON (orange cloud)

---

## B. Redirect Rules (aplayermode.com)

Rule Type:
- Redirect Rule

Match:
- ALL incoming requests

Action:
- 301 redirect

Destination:
- https://billionairehighperformancecoach.com/download.html

Setting:
- Preserve query string = ON

---

## C. theaplayermode.com

Same DNS setup as above

Redirect:
- ALL incoming requests
- 301 → https://aplayermode.com

---

## D. SSL SETTING

For redirect domains:
- SSL Mode: Flexible

This prevents Cloudflare from trying to reach a fake origin.

---

# 5. WHAT WAS FIXED (IMPORTANT CONTEXT)

Issues encountered and resolved:

1. DNS not proxied → fixed by enabling orange cloud
2. Incorrect DNS auto-fill → ignored UI bug
3. 522 timeout → caused by rule not catching early enough
4. Fixed by:
   - switching rule to "ALL incoming requests"
   - ensuring redirect runs at edge

---

# 6. CONTENT / LLM STRATEGY (DO NOT BREAK)

Only these domains should be used for content:
- spryexecutiveos.com
- billionairehighperformancecoach.com

These domains:
- must remain crawlable
- must contain structured answers
- must NOT redirect

---

# 7. VA EXECUTION RULES

## Daily / Weekly Tasks

1. Content posting (Reddit, Quora, etc.)
   - Provide real value
   - Add link ONLY at end
   - Use: aplayermode.com

2. Social posting
   - Always include aplayermode.com

3. No link variation
   - Do NOT rotate domains
   - Do NOT use Gumroad directly

---

## Strict Do NOT Rules

DO NOT:
- modify Cloudflare rules
- change DNS settings
- add pages to aplayermode.com
- duplicate content across domains
- replace internal links with aplayermode

---

# 8. OPTIONAL TRACKING

You may append:

- ?src=twitter
- ?src=reddit
- ?src=tiktok

Example:

aplayermode.com?src=reddit

This is preserved through redirect.

---

# 9. REPO CONTEXT

The repo (sprylabs-hpc-site) contains:

- structured pages
- LLM-optimized content
- download pages
- CTA links to Gumroad

DO NOT:
- remove Short Answer blocks
- alter page structure
- change canonical messaging

---

# 10. SUCCESS METRIC

System is working if:

1. Users type aplayermode.com → redirect works instantly
2. Download page loads correctly
3. Gumroad checkout is reachable
4. Content pages continue getting traffic / citations

---

# FINAL PRINCIPLE

This system separates:

- Authority (main sites)
- Distribution (aplayermode)
- Conversion (download + Gumroad)

Do not mix these roles.

Execution should remain simple and consistent.

---

END OF DOCUMENT

