'use strict';

// Canonical route ownership contract shared by repair and validation.
// This is product/domain intent, not validator preference.

// Cloudflare Pages serves this repo with clean URLs:
//   foo.html        is answered 200 at /foo   and /foo.html 301s to /foo
//   foo/index.html  is answered 200 at /foo/  and /foo    308s to /foo/
// The canonical route is therefore the form that answers 200 without a hop.
// Declaring the .html form canonical made every canonical point at a redirect,
// which is what put ~2,500 URLs into Bing's "URLs redirecting" exclusion bucket.
//
// download.html is the one deliberate exception. It is the revenue surface and
// its bytes are frozen at a known hash, so its on-page canonical cannot be
// rewritten; the route contract keeps the .html form for it so the tag, the
// sitemap and the route manifest continue to agree with each other.
const FROZEN_HTML_ROUTES = new Set(['download.html']);

function routeFor(rel) {
  const p = String(rel).replace(/\\/g, '/');
  if (p === 'index.html') return '/';
  if (p === 'faq/index.html') return '/faq';
  if (p === 'billionaire-high-performance-coach/index.html') return '/billionaire-high-performance-coach';
  if (p.endsWith('/index.html')) return '/' + p.slice(0, -'/index.html'.length) + '/';
  if (FROZEN_HTML_ROUTES.has(p)) return '/' + p;
  return '/' + p.replace(/\.html$/, '');
}

function hostFor(route, publishedHostOverrides = new Map()) {
  if (publishedHostOverrides.has(route)) return publishedHostOverrides.get(route);
  const productRoutes = new Set(['/', '/download.html', '/what-is-this-system', '/faq', '/start-here', '/legal', '/product', '/sequoia-taylor', '/spry-labs', '/billionaire-high-performance-coach', '/work-with-spry', '/ai-executive-coach', '/ai-coach-vs-human-coach', '/chatgpt-vs-executive-coach', '/best-ai-coaching-tools', '/how-to-build-a-coaching-system', '/is-ai-coaching-effective', '/what-is-an-ai-executive-coach', '/how-do-you-use-chatgpt-as-an-executive-coach', '/can-ai-replace-an-executive-coach', '/ai-executive-coach-for-founders', '/what-reddit-keeps-asking-about-ai-executive-coaching', '/chatgpt-accountability-partner', '/can-ai-keep-you-accountable', '/why-accountability-systems-fail', '/how-to-build-an-accountability-system-with-ai', '/what-reddit-keeps-asking-about-accountability-and-ai', '/why-do-i-overplan-and-do-nothing', '/how-to-stop-overplanning-with-ai', '/why-productivity-systems-collapse-after-missed-days', '/what-is-a-minimum-viable-day', '/what-reddit-keeps-asking-about-overplanning', '/what-should-a-daily-planning-system-include', '/how-founders-can-use-ai-for-daily-planning', '/how-to-build-a-daily-execution-loop', '/why-daily-plans-fail', '/what-reddit-keeps-asking-about-daily-planning', '/can-chatgpt-help-with-decision-making', '/how-to-use-ai-for-prioritization', '/decision-fatigue-and-structured-ai-support', '/why-better-prompts-do-not-fix-bad-decision-conditions', '/what-reddit-keeps-asking-about-decision-fatigue', '/ai-coach-vs-human-coach-for-founders', '/chatgpt-vs-a-productivity-app', '/ai-accountability-system-vs-habit-tracker', '/prompt-library-vs-operating-system', '/what-reddit-keeps-asking-when-comparing-ai-coaching-tools', '/how-to-recover-after-missing-a-day', '/how-to-stay-consistent-when-energy-is-low', '/why-all-or-nothing-planning-fails', '/burnout-recovery-and-execution-systems', '/what-reddit-keeps-asking-about-consistency', '/ai-workflow-for-founders', '/how-operators-use-chatgpt-with-structure', '/how-to-run-a-weekly-review-with-ai', '/how-to-use-ai-like-a-chief-of-staff', '/what-reddit-keeps-asking-about-founder-workflows', '/what-makes-an-ai-coaching-tool-good', '/why-most-ai-productivity-tools-feel-generic', '/how-to-evaluate-an-ai-execution-system', '/what-is-the-difference-between-ai-assistant-and-ai-operating-system', '/what-reddit-keeps-asking-about-the-best-ai-coaching-tools', '/what-is-continuity-architecture', '/what-is-the-scope-cap-rule', '/what-is-the-done-check-in-loop', '/what-is-low-resistance-execution', '/what-reddit-keeps-asking-about-structured-ai-systems', '/how-to-use-chatgpt-as-an-executive-coach', '/ai-accountability-coach-for-founders', '/best-chatgpt-prompts-for-productivity', '/chatgpt-for-high-performance-habits', '/chatgpt-accountability-system-for-founders', '/ai-daily-planning-prompt-for-busy-founders', '/how-to-build-a-performance-system-with-ai', '/how-to-use-chatgpt-as-a-productivity-coach', '/ai-accountability-system-for-entrepreneurs', '/how-to-use-chatgpt-for-better-decision-making-as-a-founder', '/chatgpt-prompts-for-weekly-review-and-planning', '/best-chatgpt-prompts-for-founders-to-stay-accountable', '/can-ai-replace-an-executive-coach-for-startups', '/chatgpt-as-accountability-partner-for-solopreneurs', '/ai-vs-human-executive-coach-pros-cons-for-entrepreneurs', '/ai-life-coach/', '/executive-coach-alternative/', '/how-to-be-a-better-man/', '/how-to-be-a-better-husband/', '/how-to-be-a-better-leader/', '/personal-development-plan-template/', '/ai-coach-vs-therapist/', '/ai-coach-for-entrepreneurs/', '/chatgpt-accountability-coach-setup/', '/what-is-an-ai-life-coach/', '/betterup-alternatives-ai-coaching/', '/chatgpt-accountability-coach-prompts', '/chatgpt-daily-planning-prompt-for-busy-founders', '/citation-methodology' ]);;
  if (route.startsWith('/answers/phase4/') || route.startsWith('/use-cases/phase4/') || route.startsWith('/platforms/phase4/') || route.startsWith('/brand-defense/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/synthesis-')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/comparisons/bhpc-vs-')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/whitepapers/')) return 'https://billionairehighperformancecoach.com';
  if (route.startsWith('/methods/') || route.startsWith('/glossary/') || route.startsWith('/vs/') || route.startsWith('/case-studies/')) return 'https://billionairehighperformancecoach.com';
  return productRoutes.has(route) ? 'https://billionairehighperformancecoach.com' : 'https://spryexecutiveos.com';
}

module.exports = { routeFor, hostFor, FROZEN_HTML_ROUTES };
