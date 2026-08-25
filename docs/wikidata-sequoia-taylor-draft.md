# Wikidata draft — Sequoia Taylor

**Status:** draft for human submission. Nothing submitted.
**Prepared:** 2026-08-24 · WO-18

## Read the Wikipedia/Wikidata note first

See `docs/wikidata-westpeek-draft.md` in the WPP-llm repo for the full reasoning.
Short version: Wikipedia requires notability (significant independent secondary
coverage) and restricts writing about yourself; Wikidata admits identifiable
entities with serious public references and is the surface LLM pipelines actually
resolve entities against.

A person item is materially harder to justify than a company item. Wikidata does
admit people on criterion 2, but a person with no independent coverage and no
sitelink is a common deletion candidate. **Submit the West Peek Productions
organization item first.** A person item hangs much better off an existing,
accepted organization item than it does on its own.

## Verification status

| Fact | Source | Status |
|---|---|---|
| sequoiataylor.com resolves, titled "Sequoia Taylor" | HTTP 200, fetched 2026-08-24 | VERIFIED |
| spry.vc redirects (301) to sequoiataylor.com | HTTP, fetched 2026-08-24 | VERIFIED |
| Publishes as "S.L. Taylor" across this repo | 2,608 attributed pages in this repo | VERIFIED |
| Relationship to West Peek Ventures / West Peek Productions | not independently verified here | **CONFIRM before submitting** |
| Any biography, role, employer or credential | not verified | **DO NOT SUBMIT** |

## Draft item

**Label (en):** Sequoia Taylor
**Description (en):** American writer and publisher
*(Neutral and minimal. Descriptions with adjectives or job-title inflation get
edited or reverted.)*
**Aliases:** S.L. Taylor

| Property | Value | Note |
|---|---|---|
| instance of (P31) | human (Q5) | |
| official website (P856) | https://www.sequoiataylor.com | verified |
| occupation (P106) | — | leave empty until you can source it |

## What NOT to put in

- Any credential, degree, licence or professional title.
- Employment or founder claims that are not independently sourced.
- Anything drawn from the marketing copy on the portfolio sites.

The value of this item is a stable identifier that other statements can point at.
An item with three sourced statements survives; an item with fifteen unsourced ones
gets deleted and makes the next attempt harder.

## Higher-leverage alternative

If the goal is that AI answer engines resolve this author correctly, the entity
work already shipped in this repo does more, today, than a contested Wikidata item:
a stable `@id`, `sameAs` to a verified live property, and consistent authorship
across 2,608 pages. Wikidata adds to that; it does not substitute for it.
