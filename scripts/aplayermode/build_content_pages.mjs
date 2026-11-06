#!/usr/bin/env node
/**
 * Builds the A Player Mode content pages (aplayermode/pages/<slug>.html), served at the apex by
 * workers/aplayermode-com (CONTENT_PAGES). One template, so every page has the same search shape
 * (page-shape): title with the query first, one H1, a 40-60 word definition under it, a quick
 * answer, question H2s, a list or table, a visible FAQ with FAQPage + Speakable schema, links to
 * the sibling pages, one next step, and the byline with dates.
 *
 * Source of the pages and their target searches: the search and blue-ocean decision approved on
 * 6 Nov 2026 (https://claude.ai/artifact/SwVYwzu6LEfBiKVaf71zny, section 4). Every product fact is
 * from the live aplayermode.com home page; no number, review or result is made up (risk R-PRF-01,
 * R-ADV-05, R-ADV-06). Prices are the live page's own.
 *
 *   node scripts/aplayermode/build_content_pages.mjs           writes the pages
 *   node scripts/aplayermode/build_content_pages.mjs --check   fails if a committed page differs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// The publisher node comes from the repo's one definition (CLAUDE.md: one definition per contract).
const { organizationNode } = createRequire(import.meta.url)('../lib/organization_node.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'aplayermode/pages');
const SITE = 'https://aplayermode.com';
const ORG_ID = 'https://billionairehighperformancecoach.com/spry-labs#organization';
const PUBLISHED = '2026-11-06';
const UPDATED = '2026-11-06';
const JOIN = 'https://app.aplayermode.com/join';
const GUMROAD = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach';

// The pages, in the order of the decision's table. `path` is the apex URL; `file` is under pages/.
export const PAGES = [
  {
    file: 'ai-chief-of-staff',
    path: '/ai-chief-of-staff/',
    crumb: 'AI chief of staff',
    title: 'AI chief of staff: what it does, build or buy | A Player Mode',
    description: 'An AI chief of staff keeps your priorities in order, follows up on what you promised and gets each day ready. How it works, and whether to build or buy one.',
    h1: 'AI chief of staff: what it does, and whether to build or buy one',
    definition: 'An AI chief of staff is software that does for one person what a human chief of staff does for an executive: it keeps priorities in order, follows up on what was promised and gets each day ready, so the plan lives in the system instead of in your head.',
    quick: 'You can build an AI chief of staff yourself in ChatGPT or Claude, or have one run for you. A Player Mode offers both: Billionaire High Performance Coach OS ($49 once) installs the five roles into the AI you already use, and the A Player Mode app runs them for you every day.',
    bestFor: 'Founders, operators and anyone carrying too much who want the job of a chief of staff done without hiring one.',
    sections: [
      {
        h2: 'What does an AI chief of staff do?',
        lead: 'It does the follow-through work a busy person usually does alone, every day, without being asked.',
        html: `<ul>
<li>Has your agenda ready each morning, with one priority first.</li>
<li>Turns a goal into a plan and the plan into one step a day.</li>
<li>Catches promises before they slip and flags who you owe a reply.</li>
<li>Keeps your projects lined up with your bigger goals.</li>
<li>Shrinks the next day after a miss, instead of piling up catch-up.</li>
</ul>
<p>In A Player Mode this is one of five roles that work together: Executive Coach, Executive Assistant, Chief of Staff, Accountability Partner and Cognitive Behavioral Mindset Coach.</p>`,
      },
      {
        h2: 'Should you build an AI chief of staff or buy one?',
        lead: 'Build it if you enjoy keeping a system running; have it run for you if the point is to stop holding everything yourself.',
        html: `<table class="phone-cards">
<thead><tr><th>Way</th><th>What you do</th><th>What it costs</th></tr></thead>
<tbody>
<tr><td data-label="Way">Build your own in ChatGPT or Claude</td><td data-label="What you do">Write the prompts, paste in the plan each day, remember to open it</td><td data-label="What it costs">Your AI subscription and your time</td></tr>
<tr><td data-label="Way">Billionaire High Performance Coach OS</td><td data-label="What you do">Install it once into the AI you already use, then say the trigger each morning</td><td data-label="What it costs">$49 once, on Gumroad</td></tr>
<tr><td data-label="Way">The A Player Mode app</td><td data-label="What you do">Answer easy-tap questions for about 3 minutes; it builds the plan and runs the day</td><td data-label="What it costs">From $9.99/month for the Founding 100, then $24.99/month</td></tr>
</tbody></table>
<p>Put simply: your $20 ChatGPT gives advice; this makes tomorrow actually happen. A chat gives good answers, but it does not hold you to a plan across days unless you bring the plan back every time.</p>`,
      },
      {
        h2: 'How do you build an AI chief of staff yourself?',
        lead: 'Give one AI chat a fixed set of roles, your rules and a daily trigger, and come back to it every morning.',
        html: `<ol>
<li>Write down your goals, your non-negotiables and what a minimum day looks like for you.</li>
<li>Give the chat its roles: plan the day, keep the priority list, follow up, coach you when you stall.</li>
<li>Pick one trigger phrase you say each morning to get the day's plan.</li>
<li>End each day with a short check-in, so tomorrow starts from what really happened.</li>
</ol>
<p>Billionaire High Performance Coach OS is the finished version of these steps: a 50-page operating manual, an executable prompt pack, a platform optimization guide and the Arbitration Engine, for ChatGPT, Claude, Gemini, Perplexity or DeepSeek.</p>`,
      },
      {
        h2: 'What does the A Player Mode app do differently?',
        lead: 'It keeps its own record of your plans, promises and goals, so nothing depends on you reopening a chat.',
        html: `<ul>
<li>Every morning your plan is ready: one priority, a short start, then the day.</li>
<li>The Radar catches dropped promises and flags who you owe a reply.</li>
<li>Bad days shrink automatically. No catch-up, no guilt.</li>
<li>On higher plans it acts for you: Executive Suite acts when you tap yes; Autopilot handles recurring things on its own, inside rules you set. It saves money; it never spends it.</li>
</ul>`,
      },
    ],
    faq: [
      ['Is an AI chief of staff the same as an AI executive assistant?', 'Not quite. An executive assistant handles the day: the agenda, the replies, the calendar. A chief of staff keeps the bigger picture lined up: priorities, projects and follow-through across weeks. A Player Mode does both, as two of its five roles, alongside a coach, an accountability partner and a mindset coach.'],
      ['Can ChatGPT be my chief of staff?', 'It can give the advice a chief of staff would give, if you set it up and bring it your plan every day. What it does not do on its own is remember to follow up or hold you to the plan across days. That gap is what the A Player Mode app is built to close.'],
      ['How much does an AI chief of staff cost?', 'Building one yourself costs your AI subscription and your time. Billionaire High Performance Coach OS is $49 once. The A Player Mode app starts at $9.99 a month for the first 100 members, then $24.99 a month for Executive Roundtable; Executive Suite is $39.99 and Autopilot $79.99.'],
    ],
    siblings: ['/questions/what-does-a-chief-of-staff-do/', '/ai-executive-assistant/', '/founders/'],
  },
  {
    file: 'ai-executive-assistant',
    path: '/ai-executive-assistant/',
    crumb: 'AI executive assistant',
    title: 'AI executive assistant for one person | A Player Mode',
    description: 'An AI executive assistant has your agenda ready, catches dropped promises and drafts the replies you owe. What to expect, and how A Player Mode does it.',
    h1: 'AI executive assistant: what it does for one busy person',
    definition: 'An AI executive assistant is software that handles the daily work a human executive assistant would: it has your agenda ready, keeps track of what you promised, flags the replies you owe and keeps your calendar realistic, for one person rather than a team.',
    quick: 'A good AI executive assistant has your day ready before you ask and catches what you would forget. In A Player Mode, Executive Assistant is one of five roles: your agenda is ready every morning, prioritised, and the Radar catches dropped promises and flags who you owe a reply.',
    bestFor: 'People who want the help an executive assistant gives without hiring one, and who want more than a calendar tool.',
    sections: [
      {
        h2: 'What should an AI executive assistant do?',
        lead: 'It should take the remembering and the sequencing off you, not add another app to manage.',
        html: `<ul>
<li>Have the agenda ready each morning, prioritised.</li>
<li>Catch promises you made in email before they are due.</li>
<li>Flag, draft or send the replies you owe, depending on how much you let it do.</li>
<li>Spot calendar clashes and propose the fix.</li>
<li>Track birthdays, bills, renewals and appointments.</li>
</ul>`,
      },
      {
        h2: 'How much does A Player Mode do for you on each plan?',
        lead: 'All three plans do all five jobs; the difference is who does the last step.',
        html: `<table class="phone-cards">
<thead><tr><th>Plan</th><th>Who does the last step</th><th>Replies you owe</th><th>Price</th></tr></thead>
<tbody>
<tr><td data-label="Plan">Executive Roundtable</td><td data-label="Who does the last step">You do</td><td data-label="Replies you owe">Flags them</td><td data-label="Price">$24.99/month ($9.99 for the Founding 100)</td></tr>
<tr><td data-label="Plan">Executive Suite</td><td data-label="Who does the last step">You tap yes, it does it</td><td data-label="Replies you owe">Drafts them</td><td data-label="Price">$39.99/month</td></tr>
<tr><td data-label="Plan">Autopilot</td><td data-label="Who does the last step">It does it, inside your rules</td><td data-label="Replies you owe">Sends them</td><td data-label="Price">$79.99/month</td></tr>
</tbody></table>
<p>Buying a plan never grants autonomy: you switch on each permission yourself.</p>`,
      },
      {
        h2: 'Is an AI executive assistant better than a human one?',
        lead: 'No; it is different. A human assistant brings judgement and a relationship; an AI one costs far less and is there every morning.',
        html: `<p>An executive assistant is a salaried hire who works your hours. An AI executive assistant does the routine part of the job (the agenda, the follow-ups, the calendar fixes) at an app price, and keeps going on weekends and bad days. Many people who could never justify a hire can justify that.</p>`,
      },
      {
        h2: 'How is it different from a calendar or to-do app?',
        lead: 'A to-do app waits for you to plan; an executive assistant plans with you and follows up.',
        html: `<p>A Player Mode builds the plan from a few easy taps, has it ready each morning, and shrinks the day when things go wrong. Its coaching modes change how it works with you: Executive Review when your head is full, Recovery after a bad day, Sprint when a deadline is close, Deep Work for one hard task, and High-Pressure when you are stuck.</p>`,
      },
    ],
    faq: [
      ['What is the best AI personal assistant?', 'The best one is the one that keeps working when you stop paying attention. Look for three things: it has your day ready without being asked, it remembers what you promised, and it adjusts after a bad day instead of piling up catch-up. A Player Mode was built around those three.'],
      ['Does A Player Mode read my email?', 'Only if you connect it. Executive Roundtable and Executive Suite connect 1 calendar and 1 inbox; Autopilot can connect work and personal accounts at once. The Radar uses the inbox to catch promises and replies you owe. What it keeps and what you can delete are set out in the app’s Privacy Policy.'],
      ['Is there an AI executive assistant app?', 'Yes. The A Player Mode app runs on the web and on Android today, with secure card checkout by Stripe. The App Store and Google Play versions are awaiting store approval.'],
    ],
    siblings: ['/ai-chief-of-staff/', '/founders/', '/life-os/'],
  },
  {
    file: 'founders',
    path: '/founders/',
    crumb: 'For founders',
    title: 'Founder coach and AI chief of staff for founders | A Player Mode',
    description: 'For founders: every decision lands on you and follow-ups slip. A Player Mode gives you one priority a day, catches dropped follow-ups and coaches you.',
    h1: 'For founders: a coach and a chief of staff in one app',
    definition: 'A founder coach helps a founder decide what matters, act on it and recover from hard weeks. A Player Mode gives founders that coaching plus the follow-through of a chief of staff: one priority a day, dropped follow-ups caught, and a plan that holds across days.',
    quick: 'For founders, every decision lands on you and follow-ups slip. A Player Mode takes that off your plate: one priority a day, dropped follow-ups caught, and coaching one question at a time, from $9.99/month for the first 100 members.',
    bestFor: 'Founders, entrepreneurs and operators with equity who have more inputs than hours and no chief of staff.',
    sections: [
      {
        h2: 'What overwhelms founders, and what comes off your plate?',
        lead: 'The overload is the decisions and the follow-ups; the fix is one priority a day and nothing dropped.',
        html: `<table class="phone-cards">
<thead><tr><th>In your head today</th><th>What A Player Mode does</th></tr></thead>
<tbody>
<tr><td data-label="In your head today">"What should I do today?"</td><td data-label="What A Player Mode does">Your agenda arrives, prioritised</td></tr>
<tr><td data-label="In your head today">"Am I forgetting something?"</td><td data-label="What A Player Mode does">The Radar catches dropped promises</td></tr>
<tr><td data-label="In your head today">"Who do I owe a reply?"</td><td data-label="What A Player Mode does">Flags it, drafts it or sends it, by plan</td></tr>
<tr><td data-label="In your head today">"I missed yesterday"</td><td data-label="What A Player Mode does">Minimum day, no catch-up</td></tr>
<tr><td data-label="In your head today">"I'm overwhelmed"</td><td data-label="What A Player Mode does">Coaching, one question at a time</td></tr>
</tbody></table>`,
      },
      {
        h2: 'Is an AI coach a replacement for a founder coach or CEO coach?',
        lead: 'It replaces the daily part, not the person: a human coach brings judgement in scheduled sessions; A Player Mode is there every morning.',
        html: `<p>Executive coaches commonly charge hundreds to thousands of dollars per session. A Player Mode's Executive Roundtable is $24.99 a month, and the first 100 members pay $9.99. It is not a coaching service or therapy: it plans, follows up and coaches you through the day, and many founders use it between sessions with a human coach.</p>`,
      },
      {
        h2: 'What is the Billionaire High Performance Coach Track?',
        lead: 'It is a Track for people playing an ownership game: founders, and operators who hold equity.',
        html: `<ul>
<li>Ownership and compounding outrank linear income; linear effort gets the question "does this scale without you?"</li>
<li>The Billionaire Decision Filter weighs choices on asymmetric upside, downside containment and leverage over labor.</li>
<li>High-Pressure Coaching comes pre-selected for this Track, one tap to confirm, never forced.</li>
</ul>
<p>It is the app version of Billionaire High Performance Coach OS, which you can also install into your own AI for $49 once.</p>`,
      },
      {
        h2: 'What about founder burnout?',
        lead: 'A Player Mode is built so a bad week does not break the plan: after a miss it shrinks the next day instead of adding catch-up.',
        html: `<p>The Recovery mode gives a minimum day with no catch-up and no guilt, and the Resilience Track protects recovery capacity so a volatile season never breaks continuity. A Player Mode does not provide medical or psychological advice and is not a substitute for a licensed professional.</p>`,
      },
    ],
    faq: [
      ['How is A Player Mode different from an accountability app?', 'Most accountability apps track whether you did a habit. A Player Mode plans the day with you, catches dropped follow-ups, and changes how it coaches you with one tap. Its Accountability Partner role works across days: Never Miss Twice, and a minimum day after a miss, instead of a broken streak.'],
      ['Does it work for operators with side projects?', 'Yes. Operators with side projects are one of the groups it was built for: the job that gets you promoted, plus the thing you are building. It puts real work first and keeps each project in its own lane.'],
      ['What does it cost for a founder?', 'The first 100 members get Executive Roundtable at $9.99 a month, and it stays $9.99 while they stay subscribed. After that, Executive Roundtable is $24.99 a month, Executive Suite $39.99 and Autopilot $79.99. Billionaire High Performance Coach OS is $49 once.'],
    ],
    siblings: ['/ai-chief-of-staff/', '/ai-executive-assistant/', '/questions/what-does-a-chief-of-staff-do/'],
  },
  {
    file: 'what-does-a-chief-of-staff-do',
    path: '/questions/what-does-a-chief-of-staff-do/',
    crumb: 'What does a chief of staff do?',
    title: 'What does a chief of staff do? Can AI do it? | A Player Mode',
    description: 'A chief of staff turns an executive\'s priorities into action: the agenda, the follow-ups and project alignment. What the job involves, and the AI version.',
    h1: 'What does a chief of staff do?',
    definition: 'A chief of staff is a senior right hand to an executive: they turn the executive\'s priorities into action by running the agenda, following up on decisions, keeping projects aligned with goals and making sure nothing important waits on the executive\'s memory.',
    quick: 'A chief of staff makes sure an executive\'s time goes to what matters and that decisions turn into action. Most people never get one. An AI chief of staff does the routine part of the job for one person: the daily agenda, the follow-ups and keeping projects lined up.',
    bestFor: 'Anyone asking what the role involves, and people wondering whether they could have the same help without a hire.',
    sections: [
      {
        h2: 'What are a chief of staff\'s main duties?',
        lead: 'The job varies by company, but it usually comes down to time, follow-through and alignment.',
        html: `<ul>
<li><b>Priorities and time:</b> deciding what reaches the executive and in what order.</li>
<li><b>Follow-through:</b> making sure decisions and promises turn into action.</li>
<li><b>Alignment:</b> keeping projects and people pointed at the same goals.</li>
<li><b>Preparation:</b> getting meetings, briefs and the week ready ahead of time.</li>
<li><b>Gatekeeping:</b> handling what does not need the executive at all.</li>
</ul>`,
      },
      {
        h2: 'How is a chief of staff different from an executive assistant?',
        lead: 'An executive assistant runs the day; a chief of staff runs the priorities behind it.',
        html: `<table class="phone-cards">
<thead><tr><th>What differs</th><th>Executive assistant</th><th>Chief of staff</th></tr></thead>
<tbody>
<tr><td data-label="Focus">Focus</td><td data-label="Executive assistant">The calendar, travel, email and the day</td><td data-label="Chief of staff">Priorities, projects and follow-through</td></tr>
<tr><td data-label="Time frame">Time frame</td><td data-label="Executive assistant">Today and this week</td><td data-label="Chief of staff">This quarter and this year</td></tr>
<tr><td data-label="Question it answers">Question it answers</td><td data-label="Executive assistant">"Where do I need to be?"</td><td data-label="Chief of staff">"Is this the right thing to spend time on?"</td></tr>
</tbody></table>`,
      },
      {
        h2: 'Can AI do a chief of staff\'s job for one person?',
        lead: 'It can do the routine, daily part: the agenda, the follow-ups and keeping goals and projects lined up.',
        html: `<p>What AI does not bring is a person's judgement and relationships. What it does bring is consistency: it is there every morning and it does not forget. In A Player Mode, Chief of Staff is one of five roles, described as strategic alignment between projects, priorities and long-term goals, working alongside an Executive Coach, an Executive Assistant, an Accountability Partner and a Cognitive Behavioral Mindset Coach.</p>`,
      },
    ],
    faq: [
      ['Who needs a chief of staff?', 'Traditionally, CEOs and senior leaders whose time is the bottleneck. The same problem hits founders, operators and parents: more inputs than hours, and every follow-up living in their head. An AI chief of staff brings the routine part of the job to people who would never hire one.'],
      ['Is chief of staff a senior role?', 'Usually, yes. A chief of staff works directly for an executive and often sits in leadership meetings, though the scope varies a lot from one organization to the next. The AI version described on this site is personal: it works for one person and their own day.'],
      ['What is a personal chief of staff?', 'A personal chief of staff manages one person\'s priorities across work and life rather than a company\'s. A Player Mode does this as an app: it covers Mind, Body and Spirit by default, so family, health and admin sit in the same plan as work.'],
    ],
    siblings: ['/ai-chief-of-staff/', '/ai-executive-assistant/', '/founders/'],
  },
  {
    file: 'parents',
    path: '/parents/',
    crumb: 'For parents',
    title: 'The mental load: what it is and what to hand off | A Player Mode',
    description: 'The mental load is the invisible work of remembering everything a household needs. What it is, and how A Player Mode takes the logistics off your plate.',
    h1: 'The mental load: what it is, and what a parent can hand off',
    definition: 'The mental load is the invisible work of remembering, planning and keeping track of everything a household needs: the pickups, forms, birthdays, appointments and renewals. It is tiring because it never switches off, and because most of it is noticed only when something is missed.',
    quick: 'Parents carry pickups, forms, birthdays and appointments on top of work. A Player Mode takes the logistics off your plate: family time is booked first, and the dates, forms and renewals are remembered for you, so they stop living in your head.',
    bestFor: 'Working parents and the default parent in any household: the one who remembers everything.',
    sections: [
      {
        h2: 'What counts as the mental load?',
        lead: 'Anything you have to remember so that the household keeps running.',
        html: `<ul>
<li>School forms, permission slips and pickups.</li>
<li>Birthdays, presents and the parties around them.</li>
<li>Doctor, dentist and other appointments.</li>
<li>Bills, renewals and subscriptions.</li>
<li>Meals, groceries and what runs out next.</li>
</ul>
<p>It is also called invisible labor, because the planning and remembering rarely show, only the result.</p>`,
      },
      {
        h2: 'What is a default parent?',
        lead: 'The default parent is the one everyone turns to by default: the school calls them, and they remember what is due.',
        html: `<p>Being the default parent means holding the household's calendar and to-do list in your head, often alongside a full-time job. The way out is not to try harder to remember; it is to move the remembering somewhere else.</p>`,
      },
      {
        h2: 'What can you hand off to A Player Mode?',
        lead: 'The remembering and the planning: what is due, when, and what to do about it.',
        html: `<table class="phone-cards">
<thead><tr><th>In your head today</th><th>What A Player Mode does</th></tr></thead>
<tbody>
<tr><td data-label="In your head today">"Am I forgetting something?"</td><td data-label="What A Player Mode does">Tracks birthdays, bills, renewals and appointments (Executive Suite) and prepares them to one-tap approve</td></tr>
<tr><td data-label="In your head today">"When is family time?"</td><td data-label="What A Player Mode does">The Home Front Track schedules family time and defends it like the most important meeting of the week</td></tr>
<tr><td data-label="In your head today">"What should I do today?"</td><td data-label="What A Player Mode does">Your agenda arrives, prioritised, with family, home, health and money in it</td></tr>
<tr><td data-label="In your head today">"I missed yesterday"</td><td data-label="What A Player Mode does">A minimum day, no catch-up, no guilt</td></tr>
</tbody></table>`,
      },
      {
        h2: 'Is A Player Mode a family organizer app?',
        lead: 'No; a family organizer is a shared list. A Player Mode plans your own day and carries the logistics for you.',
        html: `<p>Shared calendars and lists still need someone to remember to look and to act. A Player Mode does the planning: it has your day ready each morning, puts family time in first and remembers the dates around it.</p>`,
      },
    ],
    faq: [
      ['How do you reduce the mental load?', 'Move the remembering out of your head and into a system that acts on it. Write down everything you track, decide what can be dropped, then let something else hold the dates and remind you at the right time. A Player Mode does that holding and planning for you each day.'],
      ['Is the mental load the same as invisible labor?', 'They overlap. Invisible labor is the unseen work of running a household; the mental load is the thinking part of it: remembering, planning and anticipating. Both are tiring because nobody sees them until something is missed.'],
      ['How much does A Player Mode cost for a parent?', 'The first 100 members get Executive Roundtable at $9.99 a month, and it stays $9.99 while they stay subscribed. Executive Suite, which tracks birthdays, bills, renewals and appointments, is $39.99 a month. Cancel any time from the app\'s settings.'],
    ],
    siblings: ['/life-os/', '/ai-executive-assistant/', '/ai-chief-of-staff/'],
  },
  {
    file: 'life-os',
    path: '/life-os/',
    crumb: 'Life OS',
    title: 'Life OS: a life operating system that runs itself | A Player Mode',
    description: 'A life OS holds your goals, routines and commitments in one system so you stop running your life from memory. How to build one, or have it run for you.',
    h1: 'Life OS: a life operating system that runs your day',
    definition: 'A life OS, or life operating system, is one personal system that holds your goals, routines, commitments and rules, so you run your life from the system instead of from memory. Many people build one as a Notion template; others want one that plans and follows up for them.',
    quick: 'A life OS works when it decides the next step for you and keeps going after a bad day. Templates hold information; A Player Mode runs it: it builds a Mind, Body, Spirit plan from a few easy taps and has your day ready every morning.',
    bestFor: 'People who have built a Notion life OS or a personal operating system and found they stopped opening it.',
    sections: [
      {
        h2: 'What goes into a life OS?',
        lead: 'Your areas of life, your goals in each, your routines and the rules that keep you on track.',
        html: `<ul>
<li><b>Mind:</b> work, business and career, money, learning, focus and mental health.</li>
<li><b>Body:</b> movement, food, sleep, weight and health routines.</li>
<li><b>Spirit:</b> faith, meditation, gratitude, nature, service, family and relationships.</li>
<li><b>Rules:</b> your minimum day, your non-negotiables and what happens after a miss.</li>
</ul>
<p>These are A Player Mode's three pillars, on by default, so the basics are covered without you deciding to cover them.</p>`,
      },
      {
        h2: 'Why do most life OS templates stop working?',
        lead: 'A template stores the plan but never runs it: you still have to open it, decide and remember.',
        html: `<p>The work of a life OS is the daily part: choosing today's priority, following up and recovering after a bad day. A template leaves that to you. A Player Mode does it: one priority each morning, a short start, then the day, and after a miss it shrinks the next day instead of adding catch-up.</p>`,
      },
      {
        h2: 'How do you set up a life OS with A Player Mode?',
        lead: 'In about 3 minutes, by answering easy-tap questions.',
        html: `<ol>
<li>Answer easy-tap questions: about 3 minutes to a working plan. Stop any time; nothing is lost.</li>
<li>It builds your Mind, Body, Spirit plan and Tracks: your goals, your rules and your minimum day. You approve each piece.</li>
<li>It runs your day: every morning your plan is ready. Bad days shrink automatically.</li>
</ol>
<p>Tracks are background filters that shape every plan, such as Operator Discipline, Strategic Patience, Resilience or Home Front. APM suggests the ones that fit; you approve them and can switch any off.</p>`,
      },
    ],
    faq: [
      ['What is a personal operating system?', 'A personal operating system is the same idea as a life OS: a set of rules, routines and one place for your commitments, so your days follow a system rather than your mood. A Player Mode is a personal operating system that plans and follows up for you.'],
      ['Can I build a life OS in Notion?', 'Yes, and many people do. A Notion life OS is good at holding information. What it does not do is plan your day, follow up on promises or adjust after a bad day; you do that yourself each time you open it. A Player Mode does those parts for you.'],
      ['Is A Player Mode a life OS app?', 'Yes, in the sense that it holds your goals, routines and rules in one place. Its plans are called Executive Roundtable, Executive Suite and Autopilot; all three do all five jobs, from $9.99 a month for the first 100 members.'],
    ],
    siblings: ['/parents/', '/ai-chief-of-staff/', '/founders/'],
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const crumbOf = (p) => PAGES.find((x) => x.path === p)?.crumb ?? p;

function schema(page) {
  const url = SITE + page.path;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organizationNode(),
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: 'en',
        isPartOf: { '@id': `${SITE}/#website` },
        publisher: { '@id': ORG_ID },
        datePublished: PUBLISHED,
        dateModified: UPDATED,
        breadcrumb: { '@id': `${url}#breadcrumb` },
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.definition', '.quick-answer', '.faq-answer'] },
        about: { '@id': `${SITE}/#app` },
      },
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: page.h1,
        description: page.description,
        mainEntityOfPage: { '@id': `${url}#webpage` },
        author: { '@type': 'Person', name: 'S.L. Taylor', url: `${SITE}/about/` },
        publisher: { '@id': ORG_ID },
        datePublished: PUBLISHED,
        dateModified: UPDATED,
        image: `${SITE}/aplayermode/img/og.png`,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'A Player Mode', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: page.crumb, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        url,
        mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
    ],
  };
}

export function render(page) {
  const url = SITE + page.path;
  const sections = page.sections.map((s) => `
  <section class="section-q">
    <h2>${esc(s.h2)}</h2>
    <p><b>${esc(s.lead)}</b></p>
    ${s.html}
  </section>`).join('\n');
  const faq = page.faq.map(([q, a]) => `    <details class="faq"><summary>${esc(q)}</summary><p class="faq-answer">${esc(a)}</p></details>`).join('\n');
  const sib = page.siblings.map((p) => `<li><a href="${p}">${esc(crumbOf(p))} ›</a></li>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<!-- Generated by scripts/aplayermode/build_content_pages.mjs; edit there, not here.
     Served at ${url} by workers/aplayermode-com (CONTENT_PAGES). -->
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/aplayermode/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="/aplayermode/img/favicon-16.png" sizes="16x16" type="image/png">
<link rel="apple-touch-icon" href="/aplayermode/img/apple-touch-icon.png">
<link rel="manifest" href="/aplayermode/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="A Player Mode">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.h1)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="${SITE}/aplayermode/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.h1)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${SITE}/aplayermode/img/og.png">
<script type="application/ld+json">
${JSON.stringify(schema(page), null, 1)}
</script>
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#E9E5DE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1B1916" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&amp;family=Outfit:wght@600;700&amp;display=swap">
<link rel="stylesheet" href="/aplayermode/aplayermode.css">
<script defer src="/aplayermode/config.js"></script>
<script defer src="/aplayermode/app.js"></script>
<script defer src="/aplayermode/preview-links.js"></script>
</head>
<body>

<header class="topbar">
  <div class="wrap">
    <a class="brand" href="/"><span class="apm-mark" aria-hidden="true"></span><span class="brand-word">A Player Mode</span></a>
    <a class="btn btn-ghost btn-join-top" href="${JOIN}" rel="noopener">Join · $9.99</a>
  </div>
</header>

<main id="top" class="section content-page">
 <div class="wrap narrow">
  <p class="crumbs"><a href="/">← A Player Mode</a> · ${esc(page.crumb)}</p>
  <h1>${esc(page.h1)}</h1>
  <p class="definition">${esc(page.definition)}</p>

  <section class="section-q">
    <h2>Quick answer</h2>
    <p class="quick-answer">${esc(page.quick)}</p>
    <p class="small"><b>Best for:</b> ${esc(page.bestFor)}</p>
  </section>
${sections}

  <section class="section-q" id="faq">
    <h2>Frequently asked questions</h2>
${faq}
  </section>

  <aside class="next-step" aria-label="Get A Player Mode">
    <h2>Get your five-person executive team</h2>
    <p>The app runs your day for you; the digital product installs the same five roles into the AI you already use.</p>
    <a class="btn btn-primary" href="${JOIN}" rel="noopener">Join the Founding 100 — $9.99/month</a>
    <p class="small hero-count" data-founding-left hidden></p>
    <p class="small">First 100 members. Stays $9.99/mo while subscribed. Cancel any time.</p>
    <a class="btn btn-ghost" href="${GUMROAD}" rel="noopener">Get BHPC · $49</a>
    <p class="small">Billionaire High Performance Coach OS: $49 once, on Gumroad.</p>
  </aside>

  <nav class="related" aria-label="Related pages">
    <h2>Related</h2>
    <ul class="arrow-list">${sib}<li><a href="/">A Player Mode home ›</a></li></ul>
  </nav>

  <p class="byline">By S.L. Taylor · Published by Spry Labs · Published 6 Nov 2026 · Updated 6 Nov 2026 · <a href="/about/">About</a></p>
 </div>
</main>

<footer class="footer">
  <div class="wrap">
    <p><b>A Player Mode</b> and <b>Billionaire High Performance Coach</b> are products of Spry Labs. Developed by S.L. Taylor through Spry Labs. <a href="/about/">About Spry Labs and A Player Mode</a>.</p>
    <p>A Player Mode does not provide medical, psychological, legal, financial or therapeutic advice. Results are examples, not guarantees.</p>
    <p>&copy; 2026 Spry Labs. All rights reserved.</p>
  </div>
</footer>

</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  if (PAGES.length === 0) { console.error('NAMED STOP [NO_PAGES] the page list is empty'); process.exit(1); }
  // Search Readiness b1 / b2 (the Monday audit failed them on 6 Nov 2026): refuse to write a page
  // whose title or description the audit would fail, rather than ship it and wait for Monday.
  const bad = PAGES.flatMap((p) => [
    p.title.length > 65 ? `${p.file}: title is ${p.title.length} chars (max 65)` : null,
    p.description.length < 120 || p.description.length > 160 ? `${p.file}: description is ${p.description.length} chars (120-160)` : null,
  ].filter(Boolean));
  if (bad.length) { console.error(`NAMED STOP [SNIPPET_BOUNDS] ${bad.join('; ')}`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  let differ = 0;
  for (const page of PAGES) {
    const file = path.join(OUT, `${page.file}.html`);
    const html = render(page);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== html) { console.error(`differs: ${file}`); differ += 1; }
    } else fs.writeFileSync(file, html);
  }
  if (check && differ) process.exit(1);
  console.log(`OUTPUT content pages: ${PAGES.length} ${check ? 'checked' : 'written'}`);
}
