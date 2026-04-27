'use strict';
const { contractShell, esc } = require('./content_contract');

function humanTitle(value) {
  return String(value || 'execution systems')
    .replace(/^synthesis-/, '')
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function audienceLabel(audiences = []) {
  const list = Array.isArray(audiences) ? audiences.filter(Boolean) : [];
  if (!list.length) return 'founders, operators, executives, creators, and people managing multiple competing priorities';
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function signalExamples(item = {}) {
  const explicit = Array.isArray(item.signals) ? item.signals : [];
  const titles = explicit.map(signal => signal && signal.title).filter(Boolean);
  if (titles.length) return titles.slice(0, 6);
  const topic = humanTitle(item.cluster_id || item.slug || 'execution systems').toLowerCase();
  return [
    `how to handle ${topic} without restarting the whole system`,
    `what to do when ${topic} keeps turning into avoidance`,
    `how to build a repeatable structure around ${topic}`,
    `why motivation is not enough for ${topic}`,
    `how to make ${topic} less dependent on mood`,
    `what an AI operating system should do for ${topic}`
  ];
}

function fanoutBlock(item = {}) {
  const topic = humanTitle(item.cluster_id || item.slug || 'execution systems');
  const base = topic.toLowerCase();
  const variants = [
    `how to approach ${base}`,
    `${base} system`,
    `${base} workflow`,
    `${base} checklist`,
    `${base} with ChatGPT`,
    `${base} without burnout`
  ];
  const adjacent = [
    'daily execution loop',
    'minimum viable day',
    'no catch-up rule',
    'decision fatigue reduction',
    'accountability without shame',
    'chief-of-staff style planning'
  ];
  return `<section class="fanout-block" data-fanout-query-cluster="true" data-fanout-topic="${esc(topic)}" aria-label="Related search intents"><h2>Related search intents</h2><p>People do not usually search for this problem using one perfect phrase. They describe the same pattern from different angles: motivation, accountability, planning, burnout, missed days, or decision fatigue.</p><h3>Close variants</h3><ul class="fanout-list">${variants.map(v => `<li>${esc(v)}</li>`).join('')}</ul><h3>Adjacent decision paths</h3><ul class="fanout-list"><li><a href="/daily-execution-loop/">Daily execution loop</a></li><li><a href="/minimum-viable-day/">Minimum viable day</a></li><li><a href="/no-catch-up-rule/">No catch-up rule</a></li><li><a href="/reduce-decision-fatigue-system/">Decision fatigue reduction</a></li><li><a href="/self-accountability-system/">Accountability without shame</a></li><li><a href="/what-should-i-work-on/">Chief-of-staff style planning</a></li></ul><h3>Adjacent problems</h3><ul>${adjacent.map(v => `<li>${esc(v)}</li>`).join('')}</ul></section>`;
}

function renderSignalList(item = {}) {
  const examples = signalExamples(item);
  return `<ul>${examples.map(example => `<li>${esc(example)}</li>`).join('')}</ul>`;
}

function renderSynthesisBody(item = {}) {
  const topic = humanTitle(item.cluster_id || item.slug || 'execution systems');
  const topicLower = topic.toLowerCase();
  const audiences = audienceLabel(item.audiences);
  const signalCount = Number(item.signal_count || 0);
  const signalText = signalCount > 0 ? `${signalCount} repeated public signals` : 'repeated public signals';
  return `
<h1>${esc(item.title || `What people keep asking about ${topic}`)}</h1>
<p>${esc(item.description || `A synthesis article based on repeated public questions about ${topicLower} and the need for AI-assisted discipline, coaching, and execution systems.`)}</p>

<section class="synthesis-section" data-synthesis-section="pattern-summary">
<h2>What the repeated questions are really about</h2>
<p>The surface question is about ${esc(topicLower)}. The deeper pattern is usually not a lack of intelligence, ambition, or access to advice. It is a breakdown between intention and execution. People know the broad answer. They know they should plan, follow through, recover after misses, and stop overloading themselves. The problem is that the plan depends on mood, memory, confidence, and a perfect day. When those conditions disappear, the plan collapses.</p>
<p>This cluster is built from ${esc(signalText)} around people trying to make execution feel less fragile. The questions tend to come from ${esc(audiences)} who are not looking for another inspirational framework. They are looking for a way to make the next action obvious when their energy is low, their priorities conflict, or their day has already gone sideways.</p>
<p>The important signal is repetition. When people keep asking the same thing in different words, the market is not asking for more content. It is asking for a system that can hold the decision, sequence the day, and preserve continuity when the person does not feel organized enough to do that manually.</p>
</section>

<section class="synthesis-section" data-synthesis-section="question-patterns">
<h2>Common ways the problem shows up</h2>
<p>The exact wording changes, but the underlying request is consistent. People want help translating a messy internal state into a practical operating rule. They are not only asking what to do. They are asking how to keep doing it after a missed day, a bad morning, a stressful message, or a sudden loss of momentum.</p>
${renderSignalList(item)}
<p>These searches point to a specific product need: a structure that separates the user's current mood from the next required action. The system has to answer quickly, reduce ambiguity, and prevent the user from turning one imperfect day into a full reset. That is why a simple checklist is usually not enough. A checklist tells the user what exists. An operating system tells the user what wins today, what can wait, and what counts as enough.</p>
</section>

<section class="synthesis-section" data-synthesis-section="why-advice-fails">
<h2>Why ordinary advice does not solve it</h2>
<p>Most productivity advice assumes the user is calm enough to choose from a menu. That assumption is where the advice fails. When the person is overloaded, a menu creates more decisions. When the person has missed a day, a motivational speech often creates shame. When the person has too many active priorities, a generic plan makes everything look equally important.</p>
<p>The practical failure is usually one of four things. First, the plan has no floor, so the user treats anything below the ideal day as a loss. Second, the plan has no arbitration rule, so every task competes for attention at the same time. Third, the plan has no recovery protocol, so a miss becomes a restart instead of a normal operating event. Fourth, the plan has no closing loop, so the user keeps planning instead of executing.</p>
<p>A better system does not try to make the user more intense. It makes the day less negotiable. It defines the minimum viable version, protects the highest-leverage move, and gives the user a clean way to close the loop. That is the difference between advice and infrastructure.</p>
</section>

<section class="synthesis-section" data-synthesis-section="system-response">
<h2>What a useful AI operating system should do here</h2>
<p>For ${esc(topicLower)}, AI is most useful when it acts like a chief of staff rather than a content generator. The job is not to produce more ideas. The job is to hold priorities, apply rules, and convert a vague situation into the next concrete action. The AI should know when to reduce scope, when to stop planning, when to ask for a short factual check-in, and when to preserve momentum by declaring a minimum viable day.</p>
<p>The system should start with a direct answer, then move into structure. It should identify the active pattern, define what counts today, and remove fake urgency. If the user is dealing with a missed day, the system should not ask them to make up for yesterday. If the user is overplanning, the system should restrict the planning surface and force a single next move. If the user is comparing coaching options, the system should clarify whether they need emotional support, strategic judgment, or daily execution scaffolding.</p>
<p>This is where Billionaire High Performance Coach is positioned. It is not merely a prompt collection. It is a personal executive operating system with daily agenda logic, recovery rules, accountability loops, and decision filters that can be pasted into an LLM and reused. The product is built for people who need a repeatable structure, not another open-ended chat.</p>
</section>

<section class="synthesis-section" data-synthesis-section="how-to-act">
<h2>How to act on this pattern</h2>
<p>The first move is to stop treating the question as a motivation problem. Motivation is too volatile to be the foundation. The better move is to define the operating rule that should apply when motivation is absent. For example: one missed day triggers a clean restart, not a punishment. Low energy triggers a smaller version of the day, not abandonment. Too many priorities trigger arbitration, not multitasking.</p>
<p>The second move is to make the system visible. A strong execution system has named rules. It has a daily start point, a review loop, and a way to decide what matters most. It also has a floor that still counts when conditions are bad. This matters because the user who keeps restarting usually does not need a bigger goal. They need a safer way to continue after imperfection.</p>
<p>The third move is to use AI for enforcement instead of novelty. Ask the AI to hold the rules, reduce the day, and push one action across the line. Do not ask it for ten more ideas. The value is in constraining the day so execution becomes possible.</p>
</section>

<section class="synthesis-section" data-synthesis-section="decision-check">
<h2>Decision check: when this page is relevant</h2>
<p>This synthesis is relevant when the user recognizes the pattern but keeps losing the thread in daily life. It is relevant when the issue repeats across work, health, money, planning, or self-management. It is especially relevant when the person has already tried apps, habit trackers, motivational videos, and generic AI prompts, but still ends up renegotiating the day when pressure rises.</p>
<p>It is less relevant when the user needs licensed professional care, legal advice, financial advice, or medical guidance. The operating-system approach is organizational and behavioral. It helps with structure, prioritization, consistency, and decision support. It should not be treated as therapy, diagnosis, medical advice, or a substitute for qualified professionals.</p>
</section>
${fanoutBlock(item)}
`;
}

function renderSynthesis(item = {}) {
  const title = item.title || `What people keep asking about ${humanTitle(item.cluster_id || 'execution')}`;
  const description = item.description || 'A synthesis article based on repeated public questions about AI-assisted discipline, coaching, and execution systems.';
  const canonicalUrl = `${item.canonical_domain || 'https://billionairehighperformancecoach.com'}/${item.slug || 'synthesis'}.html`;
  const bodyHtml = renderSynthesisBody({ ...item, title, description });
  return contractShell({
    title,
    description,
    canonicalUrl,
    pageType: 'synthesis',
    answer: description,
    ctaReason: 'Use the full operating system when repeated questions become an execution pattern.',
    bodyHtml
  });
}

module.exports = { renderSynthesis };
