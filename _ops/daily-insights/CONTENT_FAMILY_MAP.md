# Content Family Map

This file explains the repo's major content families in operator language.
It is not a full URL inventory and it is not a publishing log.

## 1. Product Family
Primary BHPC product-owned pages.

Examples:
- `/download.html`
- `/billionaire-high-performance-coach/`
- `/billionaire-high-performance-coach-review/`
- `/billionaire-high-performance-coach-pricing/`
- `/guides/how-tracks-work.html`
- `/guides/arbitration-engine.html`
- `/guides/one-system-for-multiple-priorities.html`

Use this family when the page directly explains, compares, or sells the BHPC system.

## 2. Problem Family
Pages that capture search and LLM intent around pain points and operating problems.

Examples:
- burnout / overwhelm pages
- accountability pages
- restart-loop pages
- decision-fatigue pages
- planning and consistency pages

Common directories and route groups:
- `pillars/`
- `topics/`
- standalone problem pages at root
- family folders like `what-should-i-work-on/`, `multi-project-operator/`, `low-energy-structure/`

## 3. Mechanism Family
Pages that explain named BHPC logic and system models.

Examples:
- tracks
- arbitration
- continuity architecture
- minimum viable day
- reset cycle model
- decision filters

Common locations:
- `models/`
- specific standalone mechanism pages

## 4. Daily Insights Family
Daily or velocity-published insight content.

Source layer:
- `content/insights/_drafts/`

Published layer:
- `insights/`

Use this family when you want to understand the day-by-day article flow.

## 5. Ops Family
Operator-only files, validators, manifests, release notes, and visibility artifacts.

Locations:
- `_ops/`
- `docs/runbooks/`
- validator scripts in `_ops/validators/`

## 6. Coverage Family
Current-state maps that explain what the site covers.

Primary route:
- `/coverage/`

Use `/coverage/` to understand what exists now.
Use `/_ops/daily-insights/*` to understand what changed over time.
