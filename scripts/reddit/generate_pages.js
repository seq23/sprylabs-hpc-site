
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

function buildCopy(item) {
  const cluster = item.cluster;
  const sources = cluster.items || [];
  const host = item.canonical_host;
  const titleBase = item.title;
  const lead = `This page packages a recurring Reddit pattern into one clean answer route. Instead of leaving the question scattered across threads, it turns the repeated signal into a structured knowledge page tied back to the core system.`;
  const shortAnswer = `The repeated Reddit pattern behind ${titleBase.toLowerCase()} is not really about prompts alone. It is about people trying to create a tighter execution loop with AI: less drift, clearer priorities, cleaner accountability, and a way to keep moving after imperfect days.`;
  const askingSection = `Across the source threads, people keep asking variations of the same thing: ${cluster.alternate_phrasings.slice(0, 3).join(' · ')}. Even when the exact phrasing changes, the underlying request is stable: they want an AI-assisted structure that feels usable in the real world, not just clever in a prompt window.`;
  const patternSummary = `The cluster shows a repeatable pattern. People are not just looking for ideas. They are trying to reduce friction, shorten the path between planning and action, and avoid the familiar collapse that happens when a system becomes too abstract or too idealized.`;
  const practicalAnswer = `A better answer is a bounded execution loop: define the day, narrow the scope, decide the next move, and give the system a visible review point. That is why these Reddit-informed routes connect back to fixed models, pillars, and product pages instead of acting like isolated blog posts.`;
  const modelTieIn = `Inside Spry Executive OS, this pattern connects back to the atlas, answers hub, and named models. That gives readers and language models a stronger graph: the same operating vocabulary appears across multiple routes, which improves retrieval clarity and makes the site easier to cite consistently.`;
  const whyItHelps = `This page exists so the Reddit question does not stay trapped inside an ephemeral thread. Once normalized into a stable route, it becomes part of the site graph, part of the coverage layer, and part of the long-term citation surface.`;
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
