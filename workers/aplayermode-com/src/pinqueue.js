/**
 * aplayermode.com Pinterest daily drip: the pure half (owner-approved 16 Oct 2026).
 *
 * aplayermode/data/pinterest/queue.json holds the five launch items (#136) and every
 * dated pin variant. The Worker (./index.js) fetches that file from the Pages origin
 * and calls buildPinfeedXml() on every /pinfeed.xml request, so a variant appears the
 * day its release_date is reached in America/Chicago: no daily deploy, and a weekly
 * refill commit reaches the feed as soon as Pages publishes it (no Worker deploy).
 *
 * The weekly refill (scripts/aplayermode/pin_queue.mjs, run on Mondays by
 * scripts/aplayermode/weekly_pin_drip.sh in the Daily Citation Intelligence lane) uses planRefill() and
 * scheduleVariants(). No I/O here: the Worker, the scripts, the validator and the
 * tests import these same functions (one definition).
 */
export const PIN_TIMEZONE = 'America/Chicago';
export const SITE = 'https://aplayermode.com/';
export const PIN_UTM = 'utm_source=pinterest&utm_medium=organic&utm_campaign=pinfeed';
export const SECTIONS = Object.freeze(['founding-100', 'how-it-works', 'app', 'modes', 'pillars']);

/** YYYY-MM-DD of `now` in America/Chicago. */
export function chicagoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PIN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Variants released on or before `today`, newest first (id breaks ties), at most `max`. */
export function dueVariants(variants, today, max = 50) {
  return variants
    .filter((v) => typeof v.release_date === 'string' && v.release_date <= today && v.image)
    .sort((a, b) => (a.release_date === b.release_date ? (a.id < b.id ? 1 : -1) : a.release_date < b.release_date ? 1 : -1))
    .slice(0, max);
}

export function unreleasedCount(variants, today) {
  return variants.filter((v) => !v.release_date || v.release_date > today).length;
}

export function needsRefill(queue, today) {
  return unreleasedCount(queue.variants, today) < queue.config.refill_threshold;
}

/**
 * Date every undated variant: `pinsPerDay` a day from the day after the latest dated
 * variant (never before `firstDay`), never the same section on consecutive days or
 * twice in one day. Picks the section with the most undated variants left, so the
 * tail does not bunch up on one section. A variant that cannot be placed without
 * breaking the rule stays undated until the next refill. Mutates and returns.
 */
export function scheduleVariants(variants, { pinsPerDay, firstDay }) {
  if (!Number.isInteger(pinsPerDay) || pinsPerDay < 1) throw new Error(`pins_per_day must be a positive integer, got ${pinsPerDay}`);
  const dated = variants.filter((v) => v.release_date);
  const lastDate = dated.reduce((max, v) => (v.release_date > max ? v.release_date : max), '');
  let day = lastDate && addDays(lastDate, 1) > firstDay ? addDays(lastDate, 1) : firstDay;
  let previous = new Set(dated.filter((v) => v.release_date === addDays(day, -1)).map((v) => v.section));
  const pool = variants.filter((v) => !v.release_date).sort((a, b) => a.seq - b.seq);
  while (pool.length) {
    const placed = new Set();
    for (let slot = 0; slot < pinsPerDay; slot += 1) {
      const remaining = new Map();
      for (const v of pool) remaining.set(v.section, (remaining.get(v.section) ?? 0) + 1);
      const candidates = [...remaining.entries()].filter(([s]) => !previous.has(s) && !placed.has(s));
      if (!candidates.length) break;
      candidates.sort((a, b) => b[1] - a[1] || SECTIONS.indexOf(a[0]) - SECTIONS.indexOf(b[0]));
      const section = candidates[0][0];
      const [variant] = pool.splice(pool.findIndex((v) => v.section === section), 1);
      variant.release_date = day;
      placed.add(section);
    }
    if (!placed.size) break;
    previous = placed;
    day = addDays(day, 1);
  }
  return variants;
}

const designKey = (v) => `${v.headline}|${v.layout}|${v.palette}`.toLowerCase();
const angleKey = (a) => String(a.headline).toLowerCase().replace(/\s+/g, ' ');
const offset = (s) => [...s].reduce((sum, c) => sum + c.charCodeAt(0), 0);

/**
 * Plan `count` new variants (copy and design only; images are rendered by
 * scripts/aplayermode/pin_queue.mjs). `angles` is { [section]: [angle, ...] } of
 * template copy written from the landing page. The section with the fewest variants
 * goes first. Each new variant takes the section's next unused angle; once every
 * angle of a section has run, it re-uses the least-used angle in a layout/palette
 * pair that angle has never had, so every pin is a new image and never a repeat.
 * Consecutive variants of a section never share a layout.
 */
export function planRefill(queue, angles, count) {
  const { layouts, palettes } = queue.config;
  const sections = SECTIONS.filter((s) => (angles[s] || []).length);
  const bySection = new Map(sections.map((s) => [s, queue.variants.filter((v) => v.section === s)]));
  const designs = new Set(queue.variants.map(designKey));
  let seq = queue.variants.reduce((max, v) => Math.max(max, v.seq ?? 0), 0);
  const planned = [];
  const exhausted = new Set();
  while (planned.length < count && exhausted.size < sections.length) {
    const section = sections.filter((s) => !exhausted.has(s))
      .sort((a, b) => bySection.get(a).length - bySection.get(b).length || SECTIONS.indexOf(a) - SECTIONS.indexOf(b))[0];
    const existing = bySection.get(section);
    const n = existing.length + 1;
    const lastLayout = existing.length ? existing[existing.length - 1].layout : null;
    const uses = (a) => existing.filter((v) => angleKey(v) === angleKey(a)).length;
    const ordered = [...angles[section]].sort((a, b) => uses(a) - uses(b));
    let pick = null;
    for (const angle of ordered) {
      for (let k = 0; k < layouts.length * palettes.length && !pick; k += 1) {
        const layout = layouts[(n - 1 + offset(section) + k) % layouts.length];
        const palette = palettes[(n - 1 + 2 * offset(section) + Math.floor(k / layouts.length)) % palettes.length];
        if (layout === lastLayout) continue;
        if (angle.layouts && !angle.layouts.includes(layout)) continue;
        if (!designs.has(designKey({ headline: angle.headline, layout, palette }))) pick = { angle, layout, palette };
      }
      if (pick) break;
    }
    if (!pick) { exhausted.add(section); continue; }
    seq += 1;
    const variant = {
      id: `${section}-${String(n).padStart(2, '0')}`,
      seq,
      section,
      kicker: pick.angle.kicker,
      headline: pick.angle.headline,
      body: pick.angle.body,
      points: pick.angle.points,
      title: pick.angle.title,
      description: pick.angle.description,
      layout: pick.layout,
      palette: pick.palette,
      release_date: null,
    };
    existing.push(variant);
    designs.add(designKey(variant));
    planned.push(variant);
  }
  return planned;
}

export const variantLink = (v) => `${SITE}?${PIN_UTM}&utm_content=${v.id}#${v.section}`;
export const launchLink = (item) => `${SITE}?${PIN_UTM}&utm_content=${item.slug}#${item.anchor}`;
export const imageUrl = (rel) => new URL(`/${rel.replace(/^\/+/, '')}`, SITE).toString();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// 06:00 America/Chicago in daylight time (05:00 in standard time) on the release day.
export const variantPubDate = (v) => new Date(`${v.release_date}T11:00:00Z`).toUTCString();

/** Feed entries due on `today` (YYYY-MM-DD, America/Chicago): drip + launch, newest first, at most max_feed_items. */
export function feedEntries(queue, today) {
  const max = queue.config.max_feed_items;
  const drip = dueVariants(queue.variants, today, max).map((v) => ({
    guid: `aplayermode-pin-${v.id}`, title: v.title, link: variantLink(v), description: v.description,
    date: Date.parse(`${v.release_date}T11:00:00Z`), image: v.image,
  }));
  const launch = [...queue.launch].sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate)).map((i) => ({
    guid: `aplayermode-pin-${i.slug}`, title: i.title, link: launchLink(i), description: i.description,
    date: Date.parse(i.pubDate), image: i.image,
  }));
  return [...drip, ...launch].slice(0, max);
}

/** RSS 2.0 with media:content, the exact shape #136 shipped for the launch items. */
export function buildPinfeedXml(queue, today) {
  const entries = feedEntries(queue, today);
  if (!entries.length) throw new Error('Rule 0: the pin feed has no items');
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">',
    '<channel>',
    `<title>${esc(queue.channel.title)}</title>`,
    `<link>${esc(SITE)}</link>`,
    `<description>${esc(queue.channel.description)}</description>`,
    '<language>en-us</language>',
    `<lastBuildDate>${new Date(Math.max(...entries.map((e) => e.date))).toUTCString()}</lastBuildDate>`,
  ];
  for (const e of entries) {
    const img = imageUrl(e.image.path);
    out.push(
      '<item>',
      `<title>${esc(e.title)}</title>`,
      `<link>${esc(e.link)}</link>`,
      `<guid isPermaLink="false">${esc(e.guid)}</guid>`,
      `<description>${esc(e.description)}</description>`,
      `<pubDate>${new Date(e.date).toUTCString()}</pubDate>`,
      `<enclosure url="${esc(img)}" length="${e.image.length}" type="image/png"/>`,
      `<media:content url="${esc(img)}" type="image/png" medium="image" width="${e.image.width}" height="${e.image.height}"/>`,
      '</item>',
    );
  }
  out.push('</channel>', '</rss>', '');
  return out.join('\n');
}
