
const fs = require('fs');
const path = require('path');
const renderQuestionPage = require('./renderers/question_template');
const renderRoundupPage = require('./renderers/roundup_template');
const renderPatternPage = require('./renderers/pattern_template');

const ROOT = process.cwd();
const queue = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/publish_queue.json'), 'utf8'));
const archivePath = path.join(ROOT, 'data/reddit/archive', `${new Date().toISOString().slice(0,10)}-generated.json`);

function pickRenderer(type) {
  if (type === 'roundup') return renderRoundupPage;
  if (type === 'pattern') return renderPatternPage;
  return renderQuestionPage;
}


function classifyTopic(title) {
  const t = String(title || '').toLowerCase();
  if (/accountab|consistent|missed day|reset/.test(t)) return 'accountability';
  if (/decision|priorit|scope|overplan|mental load|cognitive/.test(t)) return 'decision';
  if (/executive coach|coaching|chief of staff/.test(t)) return 'coaching';
  if (/daily plan|weekly review|workflow|founders/.test(t)) return 'planning';
  return 'general';
}

function buildLead(title, clusterLabel) {
  const kind = classifyTopic(title);
  const map = {
    accountability: 'This page turns repeated accountability questions into a concrete operating route: visible commitments, bounded scope, and a review loop that holds under pressure.',
    decision: 'This page turns repeated decision-fatigue questions into a cleaner decision-support route: narrower choices, sharper tradeoffs, and less cognitive drag.',
    coaching: 'This page turns repeated AI coaching questions into a system-level answer route instead of another vague prompt discussion.',
    planning: 'This page turns repeated planning questions into a practical workflow route built for real days, not fantasy scheduling.',
    general: 'This page packages a recurring public question into one clean answer route tied back to the core system.'
  };
  return map[kind];
}
function buildShortAnswer(title) {
  const kind = classifyTopic(title);
  const map = {
    accountability: 'The useful role for AI accountability is structure, not motivation. It helps when commitments are visible, scope is constrained, and the day closes with an honest review.',
    decision: 'The useful role for AI decision support is reducing ambiguity before the next move. It helps most when the choice set is narrow, the tradeoffs are explicit, and a review point is built in.',
    coaching: 'AI coaching becomes useful when it behaves like an operating system rather than a motivational chatbot. The value comes from named rules, bounded loops, and continuity under pressure.',
    planning: 'AI planning becomes useful when it shortens the path from overview to action. The value is not more lists. The value is better prioritization, cleaner sequencing, and a visible next move.',
    general: 'The recurring pattern behind this question is not really about prompts alone. It is about building a tighter execution loop with less drift and clearer decisions.'
  };
  return map[kind];
}
function buildAskingSection(cluster) {
  const phrasings = (cluster.alternate_phrasings || []).slice(0,3).join(' · ');
  return `Across the source threads, people keep asking variations of the same thing: ${phrasings}. Even when the phrasing shifts, the practical request stays stable: they want a route that works in real operating conditions, not just in theory.`;
}
function buildPatternSummary(title) {
  const kind = classifyTopic(title);
  const map = {
    accountability: 'The pattern is not a lack of caring. It is a lack of enforcement architecture. People drift when the promise is invisible and there is no re-entry rule after imperfect days.',
    decision: 'The pattern is overload, not ignorance. People already have too many plausible moves. What they lack is a rule for what gets foregrounded now.',
    coaching: 'The pattern is that people do not need more inspiration. They need a steady structure that can survive stress, inconsistency, and too many competing priorities.',
    planning: 'The pattern is that planning often becomes symbolic work. It feels productive without actually narrowing the next action enough to matter.',
    general: 'The pattern is that the question repeats because the underlying operating problem is stable, even when the wording changes.'
  };
  return map[kind];
}
function buildPracticalAnswer(title) {
  const kind = classifyTopic(title);
  const map = {
    accountability: 'A stronger answer is a visible accountability loop: define the commitment, make today small enough to finish, and close the day with a done-or-not-done review.',
    decision: 'A stronger answer is a bounded decision loop: define the constraint, rank only the live options, choose one next move, and review the outcome instead of reopening the whole question.',
    coaching: 'A stronger answer is a named operating system: fixed roles, named rules, fallback modes, and a product structure that keeps the same vocabulary across routes.',
    planning: 'A stronger answer is a daily execution loop with fewer moving parts: one foreground priority, one next step, one review point, and no catch-up fantasy.',
    general: 'A stronger answer is a bounded execution loop that turns the repeated question into a concrete operating rule.'
  };
  return map[kind];
}
function buildModelTieIn(title) {
  return `Inside Spry Executive OS, this pattern connects back to the atlas, answers hub, named models like Continuity Architecture and Minimum Viable Day, and the full product manual. That gives readers and language models a denser retrieval graph instead of a thin standalone page.`;
}
function buildWhyItHelps(title) {
  return 'This page exists so the recurring question does not stay trapped inside an ephemeral thread. Once normalized into a stable route, it becomes part of the site graph, part of the coverage layer, and part of the long-term answer surface.';
}

function buildCopy(item) {
  const cluster = item.cluster;
  const sources = cluster.items || [];
  const host = item.canonical_host;
  const titleBase = item.title;
  const lead = buildLead(titleBase, item.cluster_label || item.cluster);
  const shortAnswer = buildShortAnswer(titleBase);
  const askingSection = buildAskingSection(cluster);
  const patternSummary = buildPatternSummary(titleBase);
  const practicalAnswer = buildPracticalAnswer(titleBase);
  const modelTieIn = buildModelTieIn(titleBase);
  const whyItHelps = buildWhyItHelps(titleBase);
  return {
    title: titleBase,
    slug: item.slug,
    canonical: `${host}${item.route}`,
    host,
    description: shortAnswer,
    lede: lead,
    shortAnswer,
    shortAnswerPlain: shortAnswer.replace(/<[^>]+>/g, ''),
    askingSection,
    alternatePhrasingSection: cluster.alternate_phrasings.length ? `Representative phrasing from the source layer includes: ${cluster.alternate_phrasings.slice(0, 5).join(' · ')}.` : 'The source phrasing was varied but directionally consistent.',
    patternSummary,
    practicalAnswer,
    modelTieIn,
    whyItHelps,
    evidenceSummary: `Source density for this route: ${sources.length} normalized Reddit item(s), ${cluster.unique_subreddits.length || 1} subreddit(s), and ${cluster.evidence_count || 0} captured excerpts.`,
    requiredLinks: item.required_links,
    sources,
    clusterLabel: item.cluster_label,
    about: item.cluster_label
  };
}

function main() {
  const generated = [];
  for (const item of (queue.items || [])) {
    const renderer = pickRenderer(item.page_type);
    const page = buildCopy(item);
    const html = renderer(page);
    const target = path.join(ROOT, item.target_file);
    fs.writeFileSync(target, html);
    generated.push({ slug: item.slug, route: item.route, file: item.target_file, title: item.title, page_type: item.page_type, canonical_host: item.canonical_host });
  }
  fs.writeFileSync(archivePath, JSON.stringify({ generated_at: new Date().toISOString(), pages: generated }, null, 2));
  console.log(`generate_pages: wrote ${generated.length} page file(s)`);
}

main();
