'use strict';
// Search Readiness q1 (7 Nov 2026): the rescue guides were template filler.
// Forty of the 48 guides were built from three steps plus ten stock sentences,
// and the renderer printed step one in the definition, the quick answer, the
// steps, the table, a section and an FAQ: six times on one page. Each page now
// says each sentence once, and a sentence shared by three or more guides is not
// that page's own words. A slot left with nothing of its own is dropped.
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sentences = t => String(t).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
const SHARED_MIN = 3;

function sharedSentences(guides) {
  const count = new Map();
  for (const g of guides) {
    const own = new Set();
    for (const s of [...(g.sections || []), ...(g.faq || [])]) for (const x of sentences(s.answer)) own.add(norm(x));
    for (const k of own) count.set(k, (count.get(k) || 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= SHARED_MIN).map(([k]) => k));
}

function pageParts(g, guides) {
  const shared = sharedSentences(guides);
  const said = new Set();
  const say = t => sentences(t).forEach(s => said.add(norm(s)));
  const fresh = t => sentences(t).filter(s => !said.has(norm(s)) && !shared.has(norm(s)));
  const answerOf = text => {
    const paras = String(text).split(/\n\n+/).map(p => fresh(p).join(' ')).filter(Boolean);
    paras.forEach(say);
    return paras;
  };
  const sectionsOf = () => (g.sections || []).map(s => ({ question: s.question, paras: answerOf(s.answer) })).filter(s => s.paras.length);
  say(g.definition);
  const quick = sentences(g.steps[0]).every(s => said.has(norm(s))) ? null : g.steps[0];
  if (quick) say(quick);
  const demandFirst = g.__demandFirst;
  let sections = demandFirst ? sectionsOf() : null;
  g.steps.forEach(say);
  let table = null;
  if (g.table) {
    const rows = g.table.rows.filter(r => r.slice(1).some(c => !said.has(norm(c)) && !shared.has(norm(c))));
    rows.forEach(r => r.slice(1).forEach(say));
    if (rows.length) table = { headers: g.table.headers, rows };
  }
  if (!sections) sections = sectionsOf();
  say(g.example);
  const faq = (g.faq || []).map(f => ({ question: f.question, answer: answerOf(f.answer).join(' ') })).filter(f => f.answer);
  return { quick, table, sections, faq };
}

module.exports = { pageParts, sharedSentences, norm, sentences };
