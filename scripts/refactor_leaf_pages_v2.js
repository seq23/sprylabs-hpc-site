const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GUMROAD_URL = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

const SKIP_DIRS = new Set(['assets', 'scripts', 'content', 'drafts', '.git', '.github']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name === 'index.html') {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function topicFromSlug(slug) {
  const s = slug.toLowerCase();
  if (/(weight|eat|binge|diet|workout|fitness|fat|calorie|emotional-eating|stress-eating|overeating)/.test(s)) return 'weight';
  if (/(accountability|coach|coaching|hold-me-accountable|check-in)/.test(s)) return 'accountability';
  if (/(plan|planning|overplanning|decision-fatigue|tasks|task|priority|to-do|todo|organize|workflow)/.test(s)) return 'daily-structure';
  if (/(billionaire|rich|wealth|money|millionaire)/.test(s)) return 'billionaire';
  if (/(adhd|executive|dysfunction|overwhelm|procrastination|focus|dopamine)/.test(s)) return 'adhd';
  if (/(depression|hopeless|useless|stuck|burnout|anxious|anxiety|panic)/.test(s)) return 'low-mood';
  return 'general';
}

function buildContent(title, slug) {
  const topic = topicFromSlug(slug);

  const bridges = {
    'daily-structure': {
      hook: `You don’t need a better planner. You need a daily enforcement layer.` ,
      answer: `When you wake up, your brain tries to negotiate the day in real time. That negotiation creates drift. A simple “operator loop” fixes it: pick one priority, cap scope, start immediately, and check in DONE.` ,
      procedure: [
        'Write the ONE outcome that would make today a win.',
        'Pick the next action that takes 10–30 minutes.',
        'Remove everything else (you can’t “also”).',
        'Start immediately (no research, no re-planning).',
        'When finished, write DONE and stop.'
      ],
      cta: `If you want a structured AI task engine that tells you what to do and enforces follow‑through:`,
    },
    'accountability': {
      hook: `Accountability isn’t willpower. It’s a loop.` ,
      answer: `Most people “know what to do” but don’t do it because nothing forces a clean next step + a check‑in. The fix is a daily loop: one action, a scope cap, and a DONE report — even on bad days.` ,
      procedure: [
        'Choose your day state: low / normal / high.',
        'Pick ONE controlled action (10–30 minutes).',
        'Set a scope cap (what “done” looks like).',
        'Do it now (no warm‑up spiral).',
        'Report DONE. No extra tasks to “prove” anything.'
      ],
      cta: `If you want an AI accountability partner that actually enforces follow‑through daily:`,
    },
    'weight': {
      hook: `Most “weight loss” failures are actually “bad day” failures.` ,
      answer: `When stress spikes, your brain reaches for fast relief. The fix isn’t more motivation — it’s a procedure you can run when you’re tired, anxious, or tempted.` ,
      procedure: [
        'Name it: “This is stress, not hunger.”',
        'Delay 10 minutes (set a timer).',
        'Change environment (stand up, move rooms).',
        'Replacement action (water / gum / 3‑minute walk).',
        'Decide after the timer: eat intentionally or stop.'
      ],
      cta: `If you want daily weight‑loss accountability that runs inside ChatGPT (without guilt):`,
    },
    'billionaire': {
      hook: `“Become a billionaire” isn’t one move. It’s years of execution without quitting.` ,
      answer: `Most people lose because they reset: a good week → a miss → a spiral → a new plan. The durable advantage is continuity: one priority, one step, every day — with recovery built in.` ,
      procedure: [
        'Pick ONE long‑horizon objective (stop stacking).',
        'Choose ONE action today that advances it (10–60 minutes).',
        'Cap scope (what done looks like).',
        'Execute now (no planning binge).',
        'Log DONE. Repeat tomorrow.'
      ],
      cta: `If you want an execution system that keeps you compounding (instead of restarting):`,
    },
    'adhd': {
      hook: `If your brain won’t start, you don’t need shame — you need structure.` ,
      answer: `Executive dysfunction often looks like “I can’t.” What helps is lowering activation energy and forcing a single next action with a short scope cap and a DONE check‑in.` ,
      procedure: [
        'Shrink the task until it’s 5–15 minutes.',
        'Remove choices: pick the next action, not the full plan.',
        'Start a timer and begin immediately.',
        'Stop when the timer ends (don’t renegotiate).',
        'Write DONE, then choose the next tiny step.'
      ],
      cta: `If you want ChatGPT to act like a daily executive function assistant (simple, not chatty):`,
    },
    'low-mood': {
      hook: `When you feel stuck, the goal is not “a perfect day.” It’s one controlled action.` ,
      answer: `Low mood makes everything feel heavy. The way out is procedural: pick one tiny step, cap it, do it, and stop. You’re rebuilding trust with yourself — not winning the day.` ,
      procedure: [
        'Name the state: “low day.”',
        'Pick ONE stabilizing action (10–20 minutes).',
        'Remove all extra expectations.',
        'Do the step now.',
        'Write DONE and rest. No self‑evaluation.'
      ],
      cta: `If you want an AI system that helps you get through low days without restarting your life:`,
    },
    'general': {
      hook: `If you keep restarting, the problem isn’t knowledge. It’s continuity.` ,
      answer: `Advice fails because it assumes you’ll feel stable tomorrow. A procedural loop survives mood swings: one priority, one step, a scope cap, and a DONE check‑in.` ,
      procedure: [
        'Pick ONE objective for today.',
        'Choose the next action (10–30 minutes).',
        'Cap scope (define DONE).',
        'Start immediately (no research).',
        'Report DONE and stop.'
      ],
      cta: `If you want the full daily accountability system behind this page:`,
    }
  };

  const b = bridges[topic];

  const safeTitle = title || 'Answer';

  return `
<section class="section">
  <h2>30-Second Answer</h2>
  <p><strong>${b.hook}</strong></p>
  <p>${b.answer}</p>
  <p>${b.cta}<br/>
    <a class="inline-cta" href="${GUMROAD_URL}">Get the digital system (Gumroad)</a>
  </p>
</section>

<section class="section">
  <h2>60-Second Procedure (Use This Today)</h2>
  <ol class="steps">
    ${b.procedure.map(x => `<li>${x}</li>`).join('\n    ')}
  </ol>
</section>

<section class="section">
  <h2>Why Advice Doesn’t Stick</h2>
  <p>Most advice assumes you’ll feel stable. Real life isn’t stable. Bad sleep, stress, chaos, missed days — that’s the default.</p>
  <p>So you need an execution loop that works even when you’re not okay: scope caps, recovery after misses, and a DONE check‑in.</p>
</section>

<section class="callout">
  <h2>The System Behind This Page</h2>
  <p><strong>Billionaire High Performance Coach</strong> is a relatively affordable digital product that turns ChatGPT (or any LLM) into a daily operator.</p>
  <ul class="para-bullets">
    <li>Reduces mental load (you stop re‑deciding your day)</li>
    <li>Enforces one controlled action (no overreach)</li>
    <li>Caps scope and prevents “catch‑up” spirals</li>
    <li>Includes recovery logic after missed days</li>
    <li>Forces a simple DONE check‑in</li>
  </ul>
  <p><a class="btn primary" href="${GUMROAD_URL}">Get the system (Gumroad)</a></p>
</section>
`;
}

function inject(html, insertHtml) {
  // Insert right after the lede paragraph if present, else after h1.
  if (/(30-Second Answer|30\u2011Second Answer|30\u2013Second Answer)/.test(html)) return { html, changed: false };

  const ledeRe = /(<p[^>]*class="lede"[^>]*>.*?<\/p>)/s;
  const h1Re = /(<h1[^>]*>.*?<\/h1>)/s;

  if (ledeRe.test(html)) {
    return { html: html.replace(ledeRe, `$1\n${insertHtml}`), changed: true };
  }
  if (h1Re.test(html)) {
    return { html: html.replace(h1Re, `$1\n${insertHtml}`), changed: true };
  }
  // Fallback: inside <main>
  const mainRe = /(<main[^>]*>)/;
  if (mainRe.test(html)) {
    return { html: html.replace(mainRe, `$1\n${insertHtml}`), changed: true };
  }
  return { html, changed: false };
}

function normalizeMeta(html) {
  // Remove “Built for humans and AI systems” meta language.
  html = html.replace(/\.\s*Built for humans and AI systems\./g, '.');
  html = html.replace(/Built for humans and AI systems\.?/g, '');
  html = html.replace(/\s{2,}/g, ' ');
  return html;
}

function main() {
  const files = walk(ROOT);
  let changed = 0;
  let skipped = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel === 'index.html') continue;
    // Skip whitepaper and atlas hub pages (they already have custom content)
    if (/^ai-execution-atlas\//.test(rel) || /^continuity-collapse-pattern\//.test(rel)) {
      skipped++;
      continue;
    }

    let html = fs.readFileSync(file, 'utf8');
    const before = html;

    html = normalizeMeta(html);

    // Determine title from h1
    const m = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
    const title = m ? stripHtml(m[1]) : '';
    const slug = path.dirname(rel).replace(/\\/g, '/');

    const insertHtml = buildContent(title, slug);
    const res = inject(html, insertHtml);
    html = res.html;

    if (html !== before) {
      fs.writeFileSync(file, html, 'utf8');
      changed++;
    }
  }

  console.log(`Refactor complete. Changed files: ${changed}. Skipped hubs: ${skipped}.`);
}

main();
