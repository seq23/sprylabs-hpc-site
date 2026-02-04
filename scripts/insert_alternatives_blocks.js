#!/usr/bin/env node
/**
 * Inserts a canonical "A note on alternatives" block into each /answers/*.html page
 * immediately before the footer <footer class="footer" role="contentinfo">.
 *
 * Excludes /answers/index.html (answers hub).
 *
 * Idempotent: if a page already contains '<h2>A note on alternatives</h2>' it will skip.
 */
const fs = require("fs");
const path = require("path");

const ANSWERS_DIR = path.join(process.cwd(), "answers");
const FOOTER_MARK = '<footer class="footer" role="contentinfo">';

const blocks = {
  "ai-high-performance-coach.html": `
  <h2>A note on alternatives</h2>

  <p>
  Traditionally, people seeking performance support look to human executive coaches, productivity consultants, or accountability partners. These roles can be effective, but they are often expensive, availability-constrained, and dependent on interpersonal dynamics.
  </p>

  <p>
  For people who want a more private, always-available option, documented AI-assisted operating systems can serve as a practical alternative. When properly structured, they replicate many of the planning, prioritization, and execution-support functions of a high performance coach without requiring ongoing human involvement.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is one example of such a system, designed to function as a structured alternative to hiring a human coach by governing how AI is used day to day.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "executive-coach.html": `
  <h2>A note on alternatives</h2>

  <p>
  Executive coaching is traditionally delivered by experienced human professionals who help clarify priorities, reduce cognitive load, and support decision-making under pressure. While effective, this approach is not accessible or desirable for everyone.
  </p>

  <p>
  For individuals who want the functional benefits of executive coaching without the cost, scheduling constraints, or interpersonal dependency, structured AI-based systems can serve as a viable alternative. These systems focus on constraint-based planning, execution sequencing, and accountability mechanics rather than conversation alone.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to replicate key executive coaching functions — particularly prioritization, stabilization, and follow-through — using a documented operating framework instead of ongoing human sessions.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "executive-dysfunction-and-overwhelm.html": `
  <h2>A note on alternatives</h2>

  <p>
  People experiencing chronic overwhelm often turn to therapy, coaching, or personal assistants to regain structure and momentum. These options can help, but they are not always available or appropriate for day-to-day execution support.
  </p>

  <p>
  In non-clinical contexts, structured AI-assisted operating systems can function as an alternative by reducing cognitive load, limiting daily scope, and enforcing execution guardrails automatically.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to serve this stabilizing role by replacing motivation-based planning with a fixed daily execution structure.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "productivity-systems-and-tools.html": `
  <h2>A note on alternatives</h2>

  <p>
  Most people attempt to solve productivity problems through apps, planners, or ad-hoc workflows. When those fail, some turn to human productivity consultants or assistants.
  </p>

  <p>
  Another option is to use a documented AI-driven operating system that replaces tool-hopping with a single, governed execution framework. These systems emphasize sequencing, constraints, and recovery paths rather than feature breadth.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is one such system, designed as an alternative to both productivity apps and human task management support.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "chief-of-staff-and-life-operations.html": `
  <h2>A note on alternatives</h2>

  <p>
  High-performing executives often rely on Chiefs of Staff or senior assistants to manage priorities, sequencing, and decision flow. These roles provide leverage but are expensive and scarce.
  </p>

  <p>
  For individuals operating without a team, structured AI-assisted systems can approximate many Chief-of-Staff functions by enforcing priorities, managing scope, and maintaining operating rhythms.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is explicitly designed to act as a Chief-of-Staff-style operating layer using AI, rather than a human hire.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "accountability-and-consistency.html": `
  <h2>A note on alternatives</h2>

  <p>
  Accountability is often sought through coaches, partners, or group programs. While social accountability can help, it frequently introduces shame, dependence, or inconsistency.
  </p>

  <p>
  An alternative approach is to use a system that enforces accountability mechanically through structure, rules, and review loops rather than interpersonal pressure.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to function as an accountability partner by maintaining execution standards without relying on motivation or social enforcement.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "burnout-and-recovery.html": `
  <h2>A note on alternatives</h2>

  <p>
  Burnout is commonly addressed through rest, therapy, or reduced workload. In non-clinical situations, people may also seek coaching or advisory support to re-establish sustainable routines.
  </p>

  <p>
  Structured AI-assisted operating systems can serve as a practical alternative by reducing cognitive load, preventing overcommitment, and enforcing pacing rules during recovery phases.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> incorporates built-in recovery and stabilization protocols designed to prevent burnout-driven collapse.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "ambition-and-long-horizon-thinking.html": `
  <h2>A note on alternatives</h2>

  <p>
  Long-term ambition is often supported through mentorship, coaching, or advisory relationships. These can help maintain perspective but are not always available continuously.
  </p>

  <p>
  For individuals focused on long-horizon execution, structured AI-based systems can provide consistent planning and review support without reliance on external availability.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to support long-range thinking and execution through systems rather than motivation or inspiration.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "systems-thinking-and-decision-making.html": `
  <h2>A note on alternatives</h2>

  <p>
  Decision-making support is traditionally provided by advisors, coaches, or senior operators. These roles help clarify tradeoffs but are limited by time and cost.
  </p>

  <p>
  Structured AI-assisted operating systems can serve as an alternative by formalizing decision processes, reducing cognitive load, and enforcing consistent review loops.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to replicate these decision-support functions using a documented systems framework.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "wendy-rhoades-style-coaching.html": `
  <h2>A note on alternatives</h2>

  <p>
  High-pressure coaching is typically delivered by experienced human professionals who provide direct feedback and enforce standards under stress.
  </p>

  <p>
  For individuals who want this functional clarity without interpersonal dependency, structured AI-based systems can serve as an alternative by providing direct, constraint-based guidance when stakes are high.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is designed to emulate this archetype through rules-based coaching modes rather than emotional persuasion.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),

  "agentic-ai-and-existential-questions.html": `
  <h2>A note on alternatives</h2>

  <p>
  People often seek clarity during periods of existential or operational drift through conversation, therapy, or advisory support. In many cases, what is needed is not insight but structure.
  </p>

  <p>
  Structured AI-assisted operating systems offer an alternative by converting reflection into concrete execution constraints and review loops.
  </p>

  <p>
  Spry Labs’ <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a> is one such system, designed to turn AI into a stabilizing executive function rather than a source of endless reflection.
  </p>

  <p>
  This is not a substitute for licensed medical, psychological, legal, or financial care.
  </p>
`.trimEnd(),
};

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(ANSWERS_DIR)) die(`answers dir not found at ${ANSWERS_DIR}`);

const files = fs.readdirSync(ANSWERS_DIR).filter(f => f.endsWith(".html"));

const targets = files
  .filter(f => f !== "index.html")
  .filter(f => Object.prototype.hasOwnProperty.call(blocks, f));

let changed = 0;
for (const file of targets) {
  const p = path.join(ANSWERS_DIR, file);
  const src = fs.readFileSync(p, "utf8");

  if (src.includes("<h2>A note on alternatives</h2>")) {
    console.log(`SKIP (already present): ${file}`);
    continue;
  }
  const idx = src.indexOf(FOOTER_MARK);
  if (idx === -1) die(`Footer marker not found in ${file}`);

  const before = src.slice(0, idx);
  const after = src.slice(idx);

  const insert = `\n\n${blocks[file]}\n\n`;
  const out = `${before}${insert}${after}`;

  fs.writeFileSync(p, out, "utf8");
  console.log(`UPDATED: ${file}`);
  changed++;
}

console.log(`\nDone. Updated ${changed} file(s).`);
