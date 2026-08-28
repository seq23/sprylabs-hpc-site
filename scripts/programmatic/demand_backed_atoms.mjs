#!/usr/bin/env node
/**
 * Turn measured demand into a composition queue.
 *
 * The defect this closes: the nightly release re-rendered the same fixed set of
 * pages every night because every page it composed came from a cartesian product
 * of hardcoded axis lists. data/queries/evidence/evidence_queries.json carried
 * real Google Search Console rows, data/demand/measured_demand.json consolidated
 * them, scripts/atlas/build_query_atlas.mjs ranked them - and nothing downstream
 * ever read any of it. Measured demand was ingested, validated, and dropped.
 *
 * What this does: reads the measured records, ranks them through the atlas,
 * and decides - per query, against the authored material library - whether this
 * repo has anything real to say about it. A query that matches authored material
 * becomes a composition candidate. A query that does not is refused BY NAME with
 * a reason, and the reason is written to the run report. Nothing is invented to
 * fill a slot: that is the failure mode that produced 743 retired fallback pages
 * and 2,412 duplicate stubs here before.
 *
 * This module only decides and explains. Composing the page from the candidate
 * is the generator's job, so the pages this produces go through exactly the same
 * lane floors, admission level, registries and validators as every other page.
 */
import fs from 'node:fs';
import path from 'node:path';

export const MAP_PATH = 'data/content/demand_axis_map.json';
export const DEMAND_PATH = 'data/demand/measured_demand.json';
export const ATLAS_PATH = 'data/authority_scale/query_atlas.json';
export const EVIDENCE_PATH = 'data/queries/evidence/evidence_queries.json';

const readJson = (root, rel, fallback) => {
  const fp = path.join(root, rel);
  return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : fallback;
};

export const normalizeQuery = (value = '') =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Longest-phrase-first span matching. Consuming the span is what stops
 * "ai executive coach" from also registering the "executive" audience, which
 * would attach a reader qualifier the query never asked for.
 */
export function matchAxes(query, phrases) {
  const tokens = normalizeQuery(query).split(/\s+/).filter(Boolean);
  const consumed = new Array(tokens.length).fill(false);
  const ordered = [...phrases].sort(
    (a, b) => normalizeQuery(b.phrase).split(' ').length - normalizeQuery(a.phrase).split(' ').length
  );
  const matches = [];
  for (const entry of ordered) {
    const words = normalizeQuery(entry.phrase).split(' ').filter(Boolean);
    if (!words.length) continue;
    for (let i = 0; i + words.length <= tokens.length; i += 1) {
      let hit = true;
      for (let j = 0; j < words.length; j += 1) {
        if (consumed[i + j] || tokens[i + j] !== words[j]) { hit = false; break; }
      }
      if (!hit) continue;
      for (let j = 0; j < words.length; j += 1) consumed[i + j] = true;
      matches.push({ ...entry, at: i });
      break; // one page does not need the same phrase twice
    }
  }
  return matches.sort((a, b) => a.at - b.at);
}

function demandValueOf(record) {
  const v = Number(record.volume);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Rank records the way the atlas ranks them, which is the only place in the
 * repo that knows a monthly search volume and this domain's own 90-day
 * impressions are different units and may not be compared across bands.
 */
function atlasOrder(atlas) {
  const bandOrder = atlas?.rank_scoring?.band_order || ['measured_search_volume', 'own_impressions_only', 'unscored'];
  const byQuery = new Map();
  for (const row of atlas?.queries || []) {
    byQuery.set(normalizeQuery(row.query), {
      rank_band: row.rank_band || null,
      rank_score: typeof row.rank_score === 'number' ? row.rank_score : null,
      publishable: row.publishable !== false,
      evidence_tier: row.evidence_tier || null,
      target_domain: row.target_domain || null,
    });
  }
  return { bandOrder, byQuery };
}

/**
 * @returns {{candidates: Array, refused: Array, stats: Object}}
 */
// The per-run page cap is the cadence policy's new_pages_per_week, read from the
// same data/cadence/policy.json that scripts/cadence_gate.js enforces against.
// These were previously two independent numbers - this generator defaulted to 25
// while the gate allowed 2 - so a full run emitted pages the gate then refused,
// and CI blocked on every release. Deriving the cap from the policy makes the
// producer and its guard share one number: raising the policy raises the
// generator, and neither can drift from the other.
function defaultPageCap(root = process.cwd()) {
  const override = Number(process.env.DEMAND_PAGE_CAP);
  if (Number.isFinite(override) && override > 0) return override;
  const policy = readJson(root, 'data/cadence/policy.json', null);
  const cap = Number(policy?.new_pages_per_week);
  // 2 is cadence_gate.js's own DEFAULT_POLICY.new_pages_per_week; matching it
  // here keeps the two in step when the policy file is absent.
  return Number.isFinite(cap) && cap > 0 ? cap : 2;
}

export function selectDemandCandidates({
  root = process.cwd(),
  library,
  hasPath,          // (relPath) => boolean, an existing .html in the tree
  hasQuery,         // (normalizedQuery) => boolean, a query already owned by a page
  slugify,
  servingDomain,    // the domain this generator writes pages for
  limit = defaultPageCap(root),
} = {}) {
  const map = readJson(root, MAP_PATH, null);
  if (!map) throw new Error(`[demand-backed] refusing to run: ${MAP_PATH} is missing. The mapping from a measured query to authored material is not something this script may guess.`);
  const demand = readJson(root, DEMAND_PATH, { records: [] });
  const atlas = readJson(root, ATLAS_PATH, null);
  const evidence = readJson(root, EVIDENCE_PATH, { queries: [] });

  const evidenceDomain = new Map();
  for (const row of evidence.queries || []) {
    if (row.target_domain) evidenceDomain.set(normalizeQuery(row.query), row.target_domain);
  }

  const { bandOrder, byQuery } = atlasOrder(atlas);
  const servingDomains = new Set(demand.domain_policy?.serving_domains || []);
  const redirectOnly = new Set(demand.domain_policy?.redirect_only_domains || []);

  const records = (demand.records || []).map((record) => {
    const key = normalizeQuery(record.query_normalized || record.query);
    const ranked = byQuery.get(key) || {};
    return {
      record,
      key,
      demand_value: demandValueOf(record),
      evidence_tier: record.evidence_tier || ranked.evidence_tier || null,
      rank_band: ranked.rank_band || 'unscored',
      rank_score: ranked.rank_score ?? null,
      in_atlas: byQuery.has(key),
      publishable: ranked.publishable !== false,
      target_domain: record.target_domain || ranked.target_domain || evidenceDomain.get(key) || null,
    };
  });

  records.sort((a, b) => {
    const ba = bandOrder.indexOf(a.rank_band); const bb = bandOrder.indexOf(b.rank_band);
    if (ba !== bb) return (ba < 0 ? 99 : ba) - (bb < 0 ? 99 : bb);
    if ((b.rank_score ?? -1) !== (a.rank_score ?? -1)) return (b.rank_score ?? -1) - (a.rank_score ?? -1);
    if (b.demand_value !== a.demand_value) return b.demand_value - a.demand_value;
    return a.key.localeCompare(b.key);
  });

  const refuse = map.refuse || [];
  const candidates = [];
  const refused = [];
  const usedPairs = new Set();
  const stats = {
    records_considered: records.length,
    ranked_through_atlas: records.filter((r) => r.in_atlas).length,
    atlas_present: Boolean(atlas),
  };

  const primaryPref = map.primary_preference || [];
  const secondaryPref = map.secondary_preference || [];

  for (const row of records) {
    const q = row.record.query;
    const say = (reason, extra = {}) => refused.push({
      query: q, demand_value: row.demand_value, evidence_tier: row.evidence_tier,
      rank_band: row.rank_band, reason, ...extra,
    });

    if (!row.demand_value) { say('no measured demand value on the record'); continue; }
    if (!row.publishable) { say('the query atlas marks this query as not publishable'); continue; }
    if (row.target_domain && redirectOnly.has(row.target_domain)) { say(`demand is attributed to ${row.target_domain}, a redirect-only host that serves no pages`); continue; }
    if (row.target_domain && servingDomains.size && !servingDomains.has(row.target_domain)) { say(`target domain ${row.target_domain} is not a serving domain`); continue; }
    if (row.target_domain && row.target_domain !== servingDomain) { say(`target domain ${row.target_domain} is served by a different generator than ${servingDomain}`); continue; }

    const refusal = refuse.find((r) => normalizeQuery(q).includes(normalizeQuery(r.match)));
    if (refusal) { say(refusal.reason); continue; }

    if (hasQuery(normalizeQuery(q))) { say('a page in the registry already owns this query'); continue; }
    const slug = slugify(q.replace(/\?$/, ''));
    if (!slug) { say('the query does not reduce to a usable slug'); continue; }
    const relPath = `answers/demand/${slug}.html`;
    if (hasPath(relPath) || hasPath(`${slug}.html`) || hasPath(`${slug}/index.html`)) { say('an exact-slug page already exists for this query'); continue; }

    const matches = matchAxes(q, map.phrases || []);
    if (!matches.length) { say('no authored material in phase4_material_library.json matches any phrase in this query'); continue; }

    const pickBy = (pref, pool) => {
      for (const kind of pref) {
        const hit = pool.find((m) => m.axis === kind);
        if (hit) return hit;
      }
      return null;
    };
    const primary = pickBy(primaryPref, matches);
    if (!primary) { say('matched material has no axis this repo can make the subject of a page'); continue; }
    if (!library[pluralOf(primary.axis)]?.[primary.key]) { say(`the map points at ${primary.axis} "${primary.key}", which the material library does not contain`); continue; }

    let secondary = pickBy(secondaryPref, matches.filter((m) => m !== primary && m.axis !== primary.axis));
    let secondary_source = 'matched in the query';
    if (!secondary) {
      const dflt = (map.default_secondary || {})[`${primary.axis}|${primary.key}`];
      if (!dflt) { say(`only one axis matched (${primary.axis}: ${primary.key}) and no authored second axis is declared for it`); continue; }
      secondary = { axis: dflt.axis, key: dflt.key, why: dflt.why };
      secondary_source = 'authored default_secondary for this primary';
    }
    if (!library[pluralOf(secondary.axis)]?.[secondary.key]) { say(`the map points at ${secondary.axis} "${secondary.key}", which the material library does not contain`); continue; }

    const pairKey = `${primary.axis}|${primary.key}||${secondary.axis}|${secondary.key}`;
    if (usedPairs.has(pairKey)) { say(`the ${primary.key} x ${secondary.key} pair already composed a page this run; a second page from the same two authored entries would differ only in its title`); continue; }

    if (candidates.length >= limit) { say(`per-run cap of ${limit} demand-backed pages already reached`); continue; }

    usedPairs.add(pairKey);
    candidates.push({
      query: q,
      normalized_query: row.key,
      slug,
      path: relPath,
      demand_value: row.demand_value,
      demand_basis: row.evidence_tier === 'T1' ? 'own_impressions_over_the_measured_gsc_window' : 'monthly_search_volume_reported_by_a_keyword_tool',
      evidence_tier: row.evidence_tier,
      source_type: row.record.source_type || null,
      observed_date: row.record.observed_date || null,
      rank_band: row.rank_band,
      rank_score: row.rank_score,
      ranked_through_atlas: row.in_atlas,
      target_domain: row.target_domain || servingDomain,
      // framework_selection in the material library is keyed by dimension,
      // state, outcome, objection or workflow. When a query matched only a tool
      // and a reader (say "ai tools for coaches"), neither axis can choose a
      // framework, and guessing one is exactly what must not happen. The
      // authored default_secondary for that tool names the dimension the
      // comparison is actually about, so it is used to choose the framework -
      // an editorial decision already written down, not an inference.
      framework_selector_dimension: ((map.default_secondary || {})[`${primary.axis}|${primary.key}`]?.axis === 'dimension')
        ? (map.default_secondary || {})[`${primary.axis}|${primary.key}`].key
        : null,
      primary: { axis: primary.axis, key: primary.key, why: primary.why },
      secondary: { axis: secondary.axis, key: secondary.key, why: secondary.why, source: secondary_source },
      matched_phrases: matches.map((m) => m.phrase),
      offset: candidates.length,
    });
  }

  stats.composed = candidates.length;
  stats.refused = refused.length;
  stats.demand_value_composed = candidates.reduce((n, c) => n + c.demand_value, 0);
  stats.demand_value_refused = refused.reduce((n, r) => n + (r.demand_value || 0), 0);
  return { candidates, refused, stats };
}

export function pluralOf(kind) {
  return {
    outcome: 'outcomes', state: 'states', dimension: 'dimensions', audience: 'audiences',
    tool: 'tools', platform: 'platforms', objection: 'objections', mode: 'modes',
    workflow: 'workflows', concept: 'concepts',
  }[kind];
}
