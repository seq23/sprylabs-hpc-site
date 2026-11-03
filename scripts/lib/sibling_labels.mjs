/**
 * The visible text of a related-pages link.
 *
 * Its own module because `build_navigation_structure.mjs` builds the whole site
 * when it is imported, and this rule needs a test that does not.
 */
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// Siblings inside one topic are generated from the same question stem, so nine
// of them labelled with their own full h1 printed this page's own question nine
// times over:
//
//   What should a founder do when behind on commitments and needs cost and access support?
//   What should a founder do when behind on commitments and needs motivation dependency support?
//   ... seven more
//
// The Monday page-shape sample reads that as template filler (the same eight-word
// phrase more than three times in one body) and it was the single biggest source
// of it on this library: the three sampled answer pages repeated their own
// question 7, 8 and 10 times, and the related block was 5 to 8 of each count.
// It is also worse for a reader, who has to read 14 identical words before
// reaching the one phrase that tells them where the link goes.
//
// So a sibling that shares this page's stem is labelled by what distinguishes it,
// and the full question stays as the link's accessible name. The shared stem is
// printed once, by LEAD_IN below, instead of once per link.
const WORD_SPLIT = /\s+/;
const stripPunct = (w) => String(w).toLowerCase().replace(/[^a-z0-9]+/g, '');
const SHARED_STEM_MIN_WORDS = 4;
const DISTINCT_TAIL_MIN_WORDS = 2;
// Words that only ever joined the tail to the stem; they read as noise once the
// stem is gone ("and needs cost and access support" -> "cost and access support").
const TAIL_LEAD_NOISE = new Set(['and', 'or', 'needs', 'need', 'when', 'that', 'who', 'for', 'with', 'is', 'a', 'an', 'the']);

/** How many leading words two headings share. */
function sharedPrefixWords(a, b) {
  const x = norm(a).split(WORD_SPLIT), y = norm(b).split(WORD_SPLIT);
  let n = 0;
  while (n < x.length && n < y.length && stripPunct(x[n]) === stripPunct(y[n]) && stripPunct(x[n])) n++;
  return n;
}

const tidy = (words) => {
  let w = [...words];
  while (w.length > DISTINCT_TAIL_MIN_WORDS && TAIL_LEAD_NOISE.has(stripPunct(w[0]))) w = w.slice(1);
  // No longer a question once the interrogative stem is gone.
  const text = norm(w.join(' ')).replace(/\s*[?,;:]+\s*$/, '');
  return { words: w, text: text ? text.charAt(0).toUpperCase() + text.slice(1) : '' };
};

/**
 * The visible label for a sibling link, given the page it is listed on.
 *
 * A permuted family differs in the MIDDLE, not at the end: this page's siblings
 * are "What should a founder do when <state> and needs <dimension> support?",
 * so stripping only the shared opening still left "and needs execution review
 * support" on five links in a row - which is the same filler one level down.
 * Both the shared opening and the shared ending go, and what is left is the one
 * phrase that says where the link goes ("Facing decision fatigue").
 *
 * Returns the sibling's own heading unchanged unless the two share enough words
 * for the remainder to still mean something on its own.
 */
export function siblingLabel(currentH1, siblingH1) {
  const cur = norm(currentH1).split(WORD_SPLIT);
  const sib = norm(siblingH1).split(WORD_SPLIT);
  const same = (a, b) => stripPunct(a) && stripPunct(a) === stripPunct(b);
  let p = 0;
  while (p < cur.length && p < sib.length && same(cur[p], sib[p])) p++;
  let s = 0;
  while (s < Math.min(cur.length, sib.length) - p && same(cur[cur.length - 1 - s], sib[sib.length - 1 - s])) s++;
  if (p + s < SHARED_STEM_MIN_WORDS) return norm(siblingH1);
  const middle = tidy(sib.slice(p, sib.length - s));
  if (middle.words.length >= DISTINCT_TAIL_MIN_WORDS && middle.text) return middle.text;
  // Nothing usable in the middle: fall back to everything after the shared
  // opening, which is how a list that only shares an opening reads best.
  const tail = tidy(sib.slice(p));
  if (tail.words.length >= DISTINCT_TAIL_MIN_WORDS && tail.text) return tail.text;
  return norm(siblingH1);
}

/**
 * A related list, grouped so no stem is printed twice.
 *
 * Stripping the stem off each label alone could not win: shortening every label
 * to its tail made nine links read "Accountability support" / "Behavioral
 * follow-through support" five times over, and keeping the long labels put a
 * nine-word stem on the page five times. A link that does not say where it goes
 * is worse than a long one; a stem repeated five times is filler. Both are
 * avoided by writing the stem once, as a heading over the links that share it:
 *
 *   How can I turn AI into a structure to ...
 *     - Keep context inside an LLM
 *     - Protect one priority
 *
 * `items`: [{ route, h1 }]. Returns [{ stem, items: [{ route, label, h1 }] }],
 * where `stem` is '' for the links that share no stem with anything and keep a
 * label of their own. Order is preserved: ungrouped links first, then each
 * group in the order its first member appeared.
 */
export function siblingGroups(currentH1, items) {
  const entries = (items ?? []).map((it) => ({ ...it, h1: norm(it.h1), label: siblingLabel(currentH1, it.h1) }));
  // Candidate groups: links whose labels still share a leading run of words.
  const byKey = new Map();
  entries.forEach((e, i) => {
    const key = norm(e.label).split(WORD_SPLIT).slice(0, SHARED_STEM_MIN_WORDS).map(stripPunct).join(' ');
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(i);
  });
  const grouped = new Set();
  const groups = [];
  for (const idxs of byKey.values()) {
    if (idxs.length < 2) continue;
    let shared = Infinity;
    for (const i of idxs) for (const j of idxs) if (i !== j) shared = Math.min(shared, sharedPrefixWords(entries[i].label, entries[j].label));
    if (!Number.isFinite(shared) || shared < SHARED_STEM_MIN_WORDS) continue;
    const stem = norm(entries[idxs[0]].label).split(WORD_SPLIT).slice(0, shared).join(' ');
    const tails = idxs.map((i) => siblingLabel(stem, entries[i].label));
    // A tail that repeats another tail, or that is just the label again, buys
    // nothing: that group stays as plain links.
    if (new Set(tails).size !== idxs.length) continue;
    if (tails.some((t, k) => t === entries[idxs[k]].label)) continue;
    idxs.forEach((i) => grouped.add(i));
    groups.push({
      stem,
      first: idxs[0],
      items: idxs.map((i, k) => ({ route: entries[i].route, h1: entries[i].h1, label: tails[k] })),
    });
  }
  const loose = entries.filter((_, i) => !grouped.has(i)).map((e) => ({ route: e.route, h1: e.h1, label: e.label }));
  const out = loose.length ? [{ stem: '', items: loose }] : [];
  return out.concat(groups.sort((a, b) => a.first - b.first).map(({ stem, items: its }) => ({ stem, items: its })));
}
