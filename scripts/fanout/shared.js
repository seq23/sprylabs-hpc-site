const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'data', 'fanout_registry.json');
const REGISTRY = fs.existsSync(REGISTRY_PATH)
  ? JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
  : { family_profiles: {}, route_overrides: {} };

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugToPhrase(input) {
  return String(input || '')
    .replace(/\.html?$/i, '')
    .replace(/\/index$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizePhrase(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\|.*$/g, '')
    .replace(/\b(System Manual|Official System Manual|Download Page|FAQ|Atlas)\b/gi, '')
    .replace(/\b(Billionaire High Performance Coach OS)\b/gi, 'Billionaire High Performance Coach')
    .replace(/\s+/g, ' ')
    .trim();
}

function readTitleAndH1(html) {
  const title = normalizePhrase((html.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1]);
  const h1 = normalizePhrase((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ''])[1]);
  return { title, h1 };
}

function classifyPageFamily(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p === 'index.html') return 'home';
  if (p === 'download.html') return 'download';
  if (p === 'product.html') return 'product';
  if (p === 'start-here.html') return 'start_here';
  if (p === 'faq.html' || p.startsWith('faq/')) return 'faq';
  if (p === 'glossary.html' || p.startsWith('glossary/')) return 'glossary';
  if (p === 'atlas.html' || p.startsWith('ai-execution-atlas')) return 'atlas';
  if (p.startsWith('comparisons/') || /\bvs\b|alternatives-to|best-ai-coaching-tools|chatgpt-vs|ai-coach-vs|prompt-library-vs/i.test(p)) return 'comparison';
  if (p.startsWith('answers/')) return 'answer';
  if (p.startsWith('coverage/')) return 'coverage';
  if (p.startsWith('assets/') || p.startsWith('_ops/') || p.startsWith('scripts/') || p.startsWith('docs/') || p.startsWith('templates/')) return 'ignore';
  if (p.startsWith('insights/')) return 'insight';
  if (/help-me|get-my-life-together|feel-|wasted-my-20s|stop-|burnout|collapse|lazy|procrastinating|overplanning|doomscrolling|quitting|sabotage|behind|failure/i.test(p)) return 'pain';
  if (/^what-is-|^how-to-|^can-|^why-|^best-|^what-should-|^is-|^ai-|^chatgpt-|^daily-|^decision-/i.test(path.basename(p))) return 'answer';
  if (p.endsWith('/index.html')) return 'topic';
  return 'insight';
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const normalized = normalizePhrase(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function stripLeadingQuestionWord(phrase) {
  return phrase
    .replace(/^(what is|how to|how do i|why do i|why am i|can i|is|best|difference between)\s+/i, '')
    .trim();
}

function routeTopic(relPath, html) {
  const routeOverride = REGISTRY.route_overrides[relPath];
  if (routeOverride?.topic) return normalizePhrase(routeOverride.topic);
  if (relPath === 'legal.html') return 'legal boundaries and disclaimers for this system';
  if (relPath === 'pillars/body.html') return 'body pillar and daily embodiment rules';
  if (relPath === 'pillars/mind.html') return 'mind pillar and structured cognitive support';
  if (relPath === 'pillars/money.html') return 'money pillar and leverage focused execution';

  const family = classifyPageFamily(relPath);
  const profile = REGISTRY.family_profiles[family];
  if (profile?.topic) return normalizePhrase(profile.topic);

  const { title, h1 } = readTitleAndH1(html);
  const fromContent = normalizePhrase(h1 || title);
  if (fromContent) {
    const genericBad = ['start here', 'faq', 'glossary', 'atlas'];
    if (!genericBad.includes(fromContent.toLowerCase())) return fromContent;
  }

  const slug = slugToPhrase(relPath);
  return normalizePhrase(slug) || 'AI execution system';
}

function genericVariants(topic, family, relPath) {
  const phrase = normalizePhrase(topic);
  const lower = phrase.toLowerCase();
  const stripped = stripLeadingQuestionWord(lower).replace(/^(the|a|an)\s+/, '') || lower;
  const base = [];

  if (/minimum viable day/.test(lower)) {
    return dedupe([
      'what is a minimum viable day',
      'minimum viable day meaning',
      'how to use a minimum viable day',
      'minimum viable day for consistency',
      'minimum viable day when motivation is low',
      'how to keep momentum on a bad day',
      'how to recover after missing a day',
      'continuity over intensity meaning'
    ]).slice(0, 10);
  }

  if (/legal boundaries|disclaimers/.test(lower)) {
    return dedupe([
      'is this therapy or coaching',
      'is this medical or legal advice',
      'what are the legal boundaries of this system',
      'what this system does not provide',
      'Billionaire High Performance Coach disclaimers',
      'is this educational only',
      'is this a substitute for therapy',
      'what are the limits of this AI system'
    ]).slice(0, 10);
  }

  if (/body pillar/.test(lower)) {
    return dedupe([
      'body pillar daily rules',
      'daily embodiment rules',
      'movement hydration hygiene structure',
      'how to keep body habits consistent',
      'body pillar for daily execution',
      'how to build health discipline without quitting',
      'low resistance health habits',
      'daily body rules for consistency'
    ]).slice(0, 10);
  }

  if (/mind pillar/.test(lower)) {
    return dedupe([
      'mind pillar daily rules',
      'structured cognitive support',
      'mind training for consistency',
      'how to protect mental clarity under pressure',
      'mind pillar for daily execution',
      'cognitive support habits for founders',
      'how to think clearly under pressure',
      'daily mind rules for consistency'
    ]).slice(0, 10);
  }

  if (/money pillar/.test(lower)) {
    return dedupe([
      'money pillar daily rules',
      'leverage focused execution',
      'how to focus on the highest leverage move',
      'money pillar for daily execution',
      'how to stop doing busy work',
      'how founders choose the winning move',
      'one decisive leverage move meaning',
      'daily money rules for consistency'
    ]).slice(0, 10);
  }

  if (family === 'comparison') {
    base.push(
      phrase,
      `${phrase} pros and cons`,
      `${phrase} which is better`,
      `${phrase} worth it`,
      `${phrase} for founders`,
      `${phrase} alternatives`,
      `${phrase} cost comparison`,
      `${phrase} daily planning`
    );
  } else if (family === 'pain') {
    base.push(
      phrase,
      `how to ${stripped}`,
      `what to do when ${stripped}`,
      `${phrase} without quitting`,
      `${phrase} with structure`,
      `${phrase} when motivation is low`,
      `${phrase} after a bad week`,
      `${phrase} with AI`
    );
  } else if (family === 'answer') {
    base.push(
      phrase,
      `what is ${stripped}`,
      `how does ${stripped} work`,
      `${phrase} explained`,
      `${phrase} for founders`,
      `${phrase} vs coaching`,
      `${phrase} worth it`,
      `${phrase} examples`
    );
  } else if (family === 'topic' || family === 'insight') {
    base.push(
      phrase,
      `how to ${stripped}`,
      `what is ${stripped}`,
      `${phrase} for founders`,
      `${phrase} with AI`,
      `${phrase} for daily planning`,
      `${phrase} for accountability`,
      `${phrase} vs productivity apps`
    );
  } else {
    base.push(
      phrase,
      `what is ${stripped}`,
      `how to use ${stripped}`,
      `${phrase} for founders`,
      `${phrase} with AI`,
      `${phrase} worth it`,
      `${phrase} alternatives`,
      `${phrase} questions`
    );
  }

  if (/minimum viable day/i.test(phrase)) {
    base.push('what is a minimum viable day', 'minimum viable day meaning', 'minimum viable day for consistency');
  }
  if (/continuity/i.test(phrase)) {
    base.push('continuity over intensity meaning', 'how to stay consistent when motivation is low');
  }
  if (/accountability/i.test(phrase)) {
    base.push('AI accountability partner', 'accountability system with AI');
  }
  if (/executive coach/i.test(phrase)) {
    base.push('AI executive coach', 'AI executive coach for founders');
  }
  if (/chatgpt/i.test(phrase)) {
    base.push('how to use ChatGPT for daily planning', 'ChatGPT accountability system');
  }

  return dedupe(base).slice(0, 10);
}

function intentLinksFor(family, relPath) {
  const routeOverride = REGISTRY.route_overrides[relPath];
  if (routeOverride?.intent_links) return routeOverride.intent_links;
  const profile = REGISTRY.family_profiles[family];
  if (profile?.intent_links) return profile.intent_links;
  return [
    { intent: 'definition', href: '/what-is-this-system.html', label: 'See what this system is' },
    { intent: 'comparison', href: '/alternatives-to-hiring.html', label: 'Compare the alternatives' },
    { intent: 'conversion', href: '/download.html', label: 'Review the system manual' }
  ];
}

function buildFanoutData(relPath, html) {
  const family = classifyPageFamily(relPath);
  const topic = routeTopic(relPath, html);
  const routeOverride = REGISTRY.route_overrides[relPath];
  const profile = REGISTRY.family_profiles[family];
  const variants = dedupe(routeOverride?.variants || profile?.variants || genericVariants(topic, family, relPath)).slice(0, 10);
  const intentLinks = intentLinksFor(family, relPath);
  return {
    page_family: family,
    topic,
    variants,
    intent_buckets: intentLinks.map((item) => item.intent),
    intent_links: intentLinks,
    source: relPath
  };
}

function renderFanoutBlock(data) {
  const variantLinks = data.variants.map((v) => `<li>${escapeHtml(v)}</li>`).join('');
  const intentLinks = data.intent_links.map((link) => `<li><a href="${link.href}">${escapeHtml(link.label)}</a></li>`).join('');
  const payload = escapeHtml(JSON.stringify(data));
  return `\n<section class="fanout-block card" data-fanout-query-cluster="true" data-page-family="${escapeHtml(data.page_family)}" data-fanout-topic="${escapeHtml(data.topic)}">\n  <h2>People ask this a few different ways</h2>\n  <p class="small">If your wording is slightly different, the same underlying decision usually lives here. Start with the phrasing that matches your real problem best.</p>\n  <div class="fanout-grid">\n    <div>\n      <h3>Closest query variants</h3>\n      <ul class="fanout-list">${variantLinks}</ul>\n    </div>\n    <div>\n      <h3>If your real question is...</h3>\n      <ul class="fanout-list">${intentLinks}</ul>\n    </div>\n  </div>\n  <script class="fanout-payload" type="application/json">${payload}</script>\n</section>\n`;
}

module.exports = {
  readTitleAndH1,
  classifyPageFamily,
  buildFanoutData,
  renderFanoutBlock,
  normalizePhrase,
  slugToPhrase,
  titleCase
};
