/**
 * A Player Mode routine pins (Pinterest assessment fix list, 6-7 Nov 2026).
 *
 * Every pin is a routine people can use: a bold search-phrase headline and 4-6 numbered
 * steps, taken word for word from its routine page (config/aplayermode_routines.json, the
 * one definition build_routine_pages.mjs also writes the page from). The pin links that
 * page, never the home page.
 *
 *   planRoutinePins(queue, routines, count)  new variants from routines no pin has used yet
 *   gatePins(variants, queue, routes)         [] or the reasons a pin is refused
 *
 * The gate refuses, on the image and in the title and description: sales words and app
 * jargon (Founding 100, member, join, $, Executive Roundtable / Suite, Autopilot, Cancel
 * any time); a title that does not start with one of its board's search phrases; fewer
 * than 4 or more than 6 steps, or text too long to read at grid size; a page the Worker
 * does not serve; and any two pins that are alike (same routine, same title or headline,
 * or steps that mostly overlap). scripts/aplayermode/pin_queue.mjs runs it on every pin
 * not yet released before it writes the queue, so no old-style pin can be queued again.
 */
import { boardForSection } from '../../workers/aplayermode-com/src/pinqueue.js';

export const ROUTINE_LAYOUTS = Object.freeze(['card', 'steps']);
export const ROUTINE_PALETTES = Object.freeze(['peach', 'butter', 'blush', 'sage']);
export const ROUTES_PREFIX = '/routines/';
export const routeFor = (page) => `${ROUTES_PREFIX}${page.slug}/`;

// Pinterest assessment, A Player Mode gate list (6 Nov 2026).
export const BANNED = [
  [/founding\s*100/i, 'Founding 100'],
  [/\bmembers?\b|\bmembership\b/i, 'member'],
  [/\bjoin(s|ed|ing)?\b/i, 'join'],
  [/\$/, '$'],
  [/executive\s+roundtable/i, 'Executive Roundtable'],
  [/executive\s+suite/i, 'Executive Suite'],
  [/auto-?pilot/i, 'Autopilot'],
  [/cancel\s+any\s*time/i, 'Cancel any time'],
];
export const LIMITS = Object.freeze({ title: 100, description: 500, headline: 32, sub: 26, step: 34, minSteps: 4, maxSteps: 6 });

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an and the of to for in on at by with your you it is be or one 1 2 3 4 5 6 10 15 20 30 90 minutes minute day'.split(' '));
const words = (steps) => new Set(steps.flatMap((s) => norm(s).split(' ')).filter((w) => w && !STOP.has(w)));

/** Share of step words two pins have in common (Jaccard over the content words). */
export function stepOverlap(a, b) {
  const x = words(a.points || []); const y = words(b.points || []);
  const both = [...x].filter((w) => y.has(w)).length;
  return both / ((x.size + y.size - both) || 1);
}
export const ALIKE_OVERLAP = 0.5;

/** Why two pins are alike, or null. */
export function alike(a, b) {
  if (a.routine && a.routine === b.routine) return `same routine ${a.routine}`;
  if (norm(a.title) === norm(b.title)) return 'same title';
  if (norm(a.headline) === norm(b.headline) && norm(a.sub || '') === norm(b.sub || '')) return 'same headline';
  const o = stepOverlap(a, b);
  if (o >= ALIKE_OVERLAP) return `steps ${Math.round(o * 100)}% the same`;
  return null;
}

/** [] when every pin passes; otherwise one line per refusal. `routes`: the routes the Worker serves. */
export function gatePins(variants, queue, routes) {
  const errors = [];
  for (const v of variants) {
    const at = `${v.id}:`;
    const text = [v.title, v.description, v.headline, v.sub, ...(v.points || [])].join(' \n ');
    for (const [re, word] of BANNED) if (re.test(text)) errors.push(`${at} refused word "${word}"`);
    const board = boardForSection(queue, v.section);
    const lower = String(v.title).toLowerCase();
    if (!(board.keywords || []).some((k) => lower.startsWith(k))) errors.push(`${at} title "${v.title}" does not start with a ${board.slug} search phrase (${(board.keywords || []).join(', ')})`);
    if (!v.page || !routes.has(v.page)) errors.push(`${at} links ${v.page || 'no page'}, not a page aplayermode.com serves`);
    if (!v.page || v.page === '/') errors.push(`${at} a pin links its routine page, never the home page`);
    const n = (v.points || []).length;
    if (n < LIMITS.minSteps || n > LIMITS.maxSteps) errors.push(`${at} ${n} steps; a pin shows 4 to 6`);
    for (const p of v.points || []) if (p.length > LIMITS.step) errors.push(`${at} step "${p}" over ${LIMITS.step} characters (unreadable at grid size)`);
    if (String(v.headline).length > LIMITS.headline) errors.push(`${at} headline over ${LIMITS.headline} characters`);
    if (String(v.sub || '').length > LIMITS.sub) errors.push(`${at} subline over ${LIMITS.sub} characters`);
    if (String(v.title).length > LIMITS.title) errors.push(`${at} title over ${LIMITS.title} characters`);
    if (String(v.description).length > LIMITS.description) errors.push(`${at} description over ${LIMITS.description} characters`);
    if (!ROUTINE_LAYOUTS.includes(v.layout) || !ROUTINE_PALETTES.includes(v.palette)) errors.push(`${at} not a routine design (${v.layout}/${v.palette})`);
  }
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const why = alike(variants[i], variants[j]);
      if (why) errors.push(`${variants[i].id} and ${variants[j].id} are alike: ${why}`);
    }
  }
  return errors;
}

/** Every routine as { page, routine } in config order. */
export function allRoutines(routines) {
  return routines.pages.flatMap((page) => page.routines.map((r) => ({ page, r, key: `${page.slug}/${r.id}` })));
}

/**
 * Plan up to `count` pins from routines no variant has used yet, taking pages in turn so
 * one page does not take a whole week. Designs rotate through layout x palette and never
 * repeat a page's previous one. Returns [] when every routine already has its pin.
 */
export function planRoutinePins(queue, routines, count, { held = null } = {}) {
  const used = new Set(queue.variants.map((v) => v.routine).filter(Boolean));
  const byPage = routines.pages.map((page) => ({ page, left: page.routines.filter((r) => !used.has(`${page.slug}/${r.id}`)) }));
  let seq = queue.variants.reduce((max, v) => Math.max(max, v.seq ?? 0), 0);
  let k = queue.variants.filter((v) => v.routine).length;
  const planned = [];
  while (planned.length < count && byPage.some((p) => p.left.length)) {
    for (const p of byPage) {
      if (planned.length >= count || !p.left.length) continue;
      const r = p.left.shift();
      const layout = ROUTINE_LAYOUTS[k % ROUTINE_LAYOUTS.length];
      const palette = ROUTINE_PALETTES[(k + Math.floor(k / ROUTINE_PALETTES.length)) % ROUTINE_PALETTES.length];
      k += 1; seq += 1;
      planned.push({
        id: `${p.page.slug}-${r.id}`,
        seq,
        section: p.page.slug,
        routine: `${p.page.slug}/${r.id}`,
        page: routeFor(p.page),
        headline: r.headline,
        sub: r.sub,
        points: [...r.steps],
        title: r.title,
        description: r.description,
        layout,
        palette,
        release_date: null,
        ...(held ? { held: { ...held } } : {}),
      });
    }
  }
  return planned;
}
