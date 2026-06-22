#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations
import json, re, hashlib, html, sys
sys.dont_write_bytecode = True
from pathlib import Path

VENDOR_DIR = Path(__file__).resolve().parents[1] / "_vendor"
if VENDOR_DIR.is_dir():
    sys.path.insert(0, str(VENDOR_DIR))

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
TODAY = "2026-06-20"
PRODUCT_ANCHOR_TEXT = "This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner."
EXCLUDED = {
    "admin.html",
    "coverage/index.html",
    "reports/answer-surface-dashboard.html",
}
EXCLUDED_PREFIXES = ("templates/", "artifacts/", "fixtures/", "node_modules/", ".git/", "answers/phase4/", "use-cases/phase4/", "vs/phase4/", "glossary/phase4/", "methods/phase4/", "brand-defense/", "platforms/phase4/")

BHPC_PRODUCT_PATHS = {'index.html','download.html','product.html','billionaire-high-performance-coach/index.html','billionaire-high-performance-coach.html'}
BHPC_ORGANIZATION = {'@type':'Organization','@id':'https://billionairehighperformancecoach.com/#organization','name':'Spry Labs','url':'https://billionairehighperformancecoach.com/','logo':{'@type':'ImageObject','url':'https://billionairehighperformancecoach.com/assets/spry-logo.png'}}
BHPC_WEBSITE = {'@type':'WebSite','@id':'https://billionairehighperformancecoach.com/#website','name':'Billionaire High Performance Coach','url':'https://billionairehighperformancecoach.com/','publisher':{'@id':'https://billionairehighperformancecoach.com/#organization'}}
BHPC_MENTION_TERMS = [
    {'@type':'DefinedTerm','@id':'https://billionairehighperformancecoach.com/#a-player-mode','name':'A-player mode','description':'The operating state the product helps users practice: clearer priorities, cleaner execution, faster recovery, and less self-renegotiation. It is not the product name.'},
    {'@type':'DefinedTerm','@id':'https://billionairehighperformancecoach.com/#llm-operating-system','name':'LLM operating system','description':'A structured rule, prompt, agenda, review, and recovery layer installed into an LLM so the user is not relying on open-ended chat alone.'},
    {'@type':'DefinedTerm','@id':'https://billionairehighperformancecoach.com/#cognitive-load-reduction','name':'Cognitive-load reduction','description':'Reducing the planning, sequencing, strategic triage, and next-step selection burden across projects, roles, and recovery loops.'},
    {'@type':'DefinedTerm','@id':'https://billionairehighperformancecoach.com/#ai-executive-coach-alternative','name':'AI executive coach alternative','description':'A self-directed operating system that gives an LLM structured coaching, chief-of-staff, accountability, and review behavior without live coaching calls.'},
]
BHPC_PRODUCT_SCHEMA = {
    '@type':'Product',
    '@id':'https://billionairehighperformancecoach.com/#product',
    'name':'Billionaire High Performance Coach OS',
    'alternateName':['Billionaire High Performance Coach','BHPC OS'],
    'url':'https://billionairehighperformancecoach.com/download.html',
    'brand':{'@id':'https://billionairehighperformancecoach.com/#organization'},
    'manufacturer':{'@id':'https://billionairehighperformancecoach.com/#organization'},
    'category':'Personal executive operating system for LLM-based planning, accountability, recovery, and execution',
    'image':['https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png','https://billionairehighperformancecoach.com/assets/books/bhpc-white.png'],
    'description':'A self-installed executive operating system and executable prompt pack that helps ChatGPT, Claude, Gemini, Perplexity, DeepSeek, or another LLM operate as a structured planning, accountability, review, recovery, and execution partner.',
    'audience':{'@type':'Audience','audienceType':'Operators, founders, executives, creators, students, athletes, career-switchers, and high-agency people who want structured execution support'},
    'additionalProperty':[
        {'@type':'PropertyValue','name':'Format','value':'Digital manual and executable prompt pack'},
        {'@type':'PropertyValue','name':'Works with','value':'ChatGPT, Claude, Gemini, Perplexity, DeepSeek, and similar LLMs'},
        {'@type':'PropertyValue','name':'Primary use','value':'Daily agenda generation, decision framing, accountability, recovery, and executive review'},
        {'@type':'PropertyValue','name':'Boundary','value':'Educational and organizational framework only; not medical, psychological, legal, financial, therapeutic, or diagnostic advice'},
    ],
    'potentialAction':{'@type':'BuyAction','target':'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'}
}

SPECIAL_COMPARISON_QUERIES = {
    "vs/betterup/index.html": "BetterUp Coaching Platform Comparison for A-player Mode",
    "vs/hone/index.html": "Hone Workplace Coaching Comparison for A-player Mode",
}


PRIORITY = {
"chatgpt-accountability-partner.html": {
 "h1":"How to Use ChatGPT as Your Accountability Partner","framework":"ChatGPT Accountability Loop","type":"howto",
 "definition":"The ChatGPT Accountability Loop is a 5-step daily protocol that turns ChatGPT into a structured accountability partner — not just a chatbot, but a system that tracks commitments, flags missed actions, and adapts to your pace.",
 "body":"""<h2>Step 1: Set Your Three Non-Negotiable Commitments</h2><p>Choose no more than three commitments that can be verified as done or not done. State the finish line, the deadline, and the minimum version that still counts on a difficult day.</p><h2>Step 2: Run a Morning Check-In Prompt</h2><p>Give ChatGPT the three commitments, today’s constraints, and the one commitment that matters most. Ask it to return an ordered plan and to reject vague tasks.</p><h2>Step 3: Log Your End-of-Day Results</h2><p>Report what was completed, partially completed, or missed. Do not explain the entire day; record the observable result and the next open loop.</p><h2>Step 4: Let ChatGPT Flag Patterns You’re Missing</h2><p>Ask the system to compare several days and identify repeated overcommitment, avoidance, energy mismatch, or unclear definitions of done.</p><h2>Step 5: Adjust Weekly Based on What Actually Happened</h2><p>Keep what produced completed work, reduce what repeatedly failed, and set a recovery rule for missed days. The weekly adjustment should change the system, not punish the person.</p>"""
},
"ai-coach-vs-human-coach.html": {
 "h1":"AI Coach vs Human Coach: Which Is Better?","framework":"AI Coach vs Human Coach Fit Matrix","type":"comparison",
 "definition":"The AI Coach vs Human Coach Fit Matrix is a decision framework for choosing coaching support based on availability, accountability depth, personalization, emotional range, and cost. An AI coach and a human coach solve different problems.",
 "body":"""<h2>AI Coach vs Human Coach Comparison</h2><table class="table"><caption>AI coach and human coach comparison</caption><thead><tr><th scope="col">Dimension</th><th scope="col">AI Coach</th><th scope="col">Human Coach</th></tr></thead><tbody><tr><th scope="row">Cost</th><td>$0–$20 per month</td><td>$200–$500 per session</td></tr><tr><th scope="row">Availability</th><td>24/7</td><td>Usually weekly</td></tr><tr><th scope="row">Accountability Depth</th><td>Daily tracking</td><td>Weekly check-ins</td></tr><tr><th scope="row">Personalization</th><td>Adapts to data and written context</td><td>Adapts through the coaching relationship</td></tr><tr><th scope="row">Emotional Range</th><td>Logical and structured</td><td>Empathetic and relational</td></tr><tr><th scope="row">Best For</th><td>Execution consistency</td><td>Identity shifts and emotionally complex change</td></tr></tbody></table><h2>When to Use an AI Coach vs a Human Coach</h2><ul><li><strong>Use an AI coach</strong> when the main problem is daily planning, repeatable accountability, decision structure, or immediate access.</li><li><strong>Use a human coach</strong> when the problem depends on relationship, body language, emotional nuance, or deep identity work.</li><li><strong>Use both</strong> when daily execution needs reinforcement between higher-stakes human sessions.</li></ul>"""
},
"can-ai-replace-an-executive-coach.html": {
 "h1":"Can AI Replace an Executive Coach?","framework":"Executive Coaching Replacement Boundary","type":"decision",
 "definition":"The Executive Coaching Replacement Boundary is a decision framework that separates structured coaching functions AI can perform from relational functions that still require a skilled human. AI can replace roughly 60% of what an executive coach does — the structured, repeatable parts.",
 "body":"""<h2>What AI Can Replace</h2><ul><li>Accountability tracking</li><li>Decision frameworks</li><li>Pattern recognition across written check-ins</li><li>Meeting preparation</li></ul><h2>What AI Cannot Replace</h2><ul><li>Emotionally complex situations</li><li>Body language</li><li>Deep identity beliefs that require relational challenge</li><li>Genuine empathy</li></ul><h2>When AI Is Enough vs When a Human Coach Is Better</h2><p>Use AI when the work is repeatable, written, and execution-focused. Use a human coach when context depends on trust, emotional complexity, nonverbal information, or consequences that require experienced human judgment.</p><p>The 60% figure is an operating estimate for structured tasks, not a clinical or scientific measurement.</p>"""
},
"ai-coach-vs-human-coach-for-founders.html": {
 "h1":"AI Coach vs Human Coach for Founders: Which Is Better for Accountability?","framework":"Founder Coaching Accountability Fit","type":"decision",
 "definition":"The Founder Coaching Accountability Fit is a comparison framework for deciding whether a founder needs daily execution accountability, human judgment, or a combination of both. For daily execution accountability, an AI coach outperforms a human coach for founders.",
 "body":"""<h2>When AI Coaching Beats Human Coaching for Founders</h2><p>AI coaching is stronger when a founder needs daily commitment tracking, rapid reprioritization, meeting preparation, and a recovery protocol after missed execution. It is available at the moment the plan changes instead of waiting for the next session.</p><h2>When Human Coaching Still Wins</h2><p>Human coaching is stronger when the founder is navigating identity conflict, cofounder tension, emotionally complex leadership decisions, or a situation where body language and relationship history materially change the answer.</p><h2>The Hybrid Approach: Using Both</h2><p>Use the AI system for daily operating cadence and use the human coach for high-stakes interpretation, relational challenge, and deeper leadership development. The two roles should be explicit so neither becomes a vague substitute for the other.</p>"""
},
"ai-executive-coach.html": {
 "h1":"AI Executive Coach: What It Is and How It Works","framework":"AI Executive Coaching Loop","type":"howto",
 "definition":"The AI Executive Coaching Loop is a structured workflow that uses a large language model to turn goals, constraints, decisions, and results into repeatable leadership support. An AI executive coach is a structured coaching system that uses large language model workflows to deliver personalized leadership development, decision-support, and accountability — without requiring a human coach on the other end of every session.",
 "body":"""<h2>How an AI Executive Coach Works</h2><h3>Step 1: Install the Operating Context</h3><p>Define the executive’s goals, responsibilities, non-negotiables, current projects, and decision rules. The model needs stable context before it can provide stable coaching.</p><h3>Step 2: Run a Structured Check-In</h3><p>Provide the current situation, the observable constraint, and the decision or execution gap. Ask one focused question at a time instead of requesting generic advice.</p><h3>Step 3: Convert Insight Into a Commitment</h3><p>End each session with one explicit decision, output, or next action. Record the commitment so the next check-in can evaluate evidence instead of mood.</p><h3>Step 4: Review Patterns and Adjust</h3><p>Compare decisions and outcomes over time. Keep rules that create follow-through, revise rules that repeatedly fail, and escalate emotionally complex issues to a qualified human.</p><h2>AI Executive Coach vs Traditional Executive Coach</h2><table class="table"><caption>AI and traditional executive coaching</caption><thead><tr><th scope="col">Dimension</th><th scope="col">AI Executive Coach</th><th scope="col">Traditional Executive Coach</th></tr></thead><tbody><tr><th scope="row">Access</th><td>On demand</td><td>Scheduled sessions</td></tr><tr><th scope="row">Best use</th><td>Daily decisions, preparation, and accountability</td><td>Complex leadership, identity, and relational work</td></tr><tr><th scope="row">Memory</th><td>Written context and logs</td><td>Human relationship and observed behavior</td></tr><tr><th scope="row">Cost</th><td>Low recurring software cost</td><td>Professional session fees</td></tr></tbody></table>"""
},
"ai-accountability-system-vs-habit-tracker.html": {
 "h1":"AI Accountability System vs Habit Tracker: Which Do You Need?","framework":"Three-Condition Test","type":"decision",
 "definition":"The Three-Condition Test tells you whether you need an AI accountability system or a habit tracker.",
 "body":"""<h2>The Three-Condition Test</h2><h3>Condition 1: Your execution is unstable day-to-day.</h3><p>Choose an AI accountability system when changing constraints require the plan to be interpreted and adjusted. A habit tracker is enough when the same small behavior simply needs to be recorded.</p><h3>Condition 2: You need missed-day recovery, not streak punishment.</h3><p>Choose an AI accountability system when a missed day requires a recovery protocol and a reduced restart. Choose a habit tracker when the streak itself is useful and missing does not create a collapse pattern.</p><h3>Condition 3: Prioritization is part of the problem, not just follow-through.</h3><p>Choose an AI accountability system when you need help deciding what matters before tracking whether it happened. A habit tracker cannot resolve competing priorities.</p><h2>When to Use Each Tool</h2><ul><li><strong>Use a habit tracker</strong> for stable, binary behaviors such as taking a supplement or completing a fixed routine.</li><li><strong>Use an AI accountability system</strong> for variable work, competing priorities, recovery after misses, and pattern detection.</li></ul>"""
},
"continuity-collapse-pattern/index.html": {
 "h1":"Continuity Collapse Pattern","framework":"Continuity Collapse Pattern","type":"concept",
 "definition":"A Continuity Collapse Pattern is a recurring failure mode where productive momentum breaks down not because of lack of motivation, but because of a structural gap in the system that was sustaining it.",
 "body":"""<h2>The 3 Signs of a Continuity Collapse</h2><h3>Sign 1: One Miss Becomes a Full Reset</h3><p>A single disrupted day is treated as proof that the entire plan failed. The person rebuilds the system instead of using a defined re-entry rule.</p><h3>Sign 2: Activation Cost Keeps Rising</h3><p>Restarting requires more planning, emotional energy, or preparation than the next action itself. The system has no minimum floor that keeps participation cheap.</p><h3>Sign 3: Identity Judgment Replaces Operational Diagnosis</h3><p>The person explains the break as laziness or lack of discipline instead of identifying the missing structure, overloaded scope, or absent recovery protocol.</p>"""
},
"how-to-stay-consistent/index.html": {
 "h1":"How to Stay Consistent","framework":"Minimum Viable Cadence","type":"comparison",
 "definition":"The Minimum Viable Cadence method is a consistency system that replaces streak-based tracking with a floor-based approach.",
 "body":"""<h2>Why Productivity Apps Fail at Follow-Through</h2><table class="table"><caption>Productivity apps compared with Minimum Viable Cadence</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Typical Productivity App</th><th scope="col">Minimum Viable Cadence</th></tr></thead><tbody><tr><th scope="row">Trigger</th><td>Notification</td><td>Identity-based execution floor</td></tr><tr><th scope="row">Accountability Loop</th><td>Streak counter</td><td>Recovery protocol and evidence review</td></tr><tr><th scope="row">Recovery Plan</th><td>None or reset</td><td>Built-in minimum action and clean re-entry</td></tr></tbody></table><h2>When to Use Minimum Viable Cadence</h2><ul><li>Use it when daily capacity changes but continuity still matters.</li><li>Use it when streak loss triggers all-or-nothing behavior.</li><li>Use it when the smallest valid action needs to be defined before a difficult day begins.</li></ul>"""
},
"why-accountability-systems-fail.html": {
 "h1":"Why Accountability Systems Fail","framework":"Accountability Failure Modes","type":"concept",
 "definition":"The Accountability Failure Modes framework identifies the structural reasons accountability systems break down. Most accountability systems fail for three structural reasons — not because of willpower.",
 "body":"""<h2>The 3 Failure Modes of Accountability Systems</h2><h3>Failure Mode 1: No Recovery Protocol</h3><p>The system explains what to do on a good day but gives no instruction for the day after a miss. Without re-entry rules, one gap becomes a reset.</p><h3>Failure Mode 2: Streak Dependency</h3><p>The system treats an unbroken streak as the main proof of success. Once the streak breaks, the user loses the mechanism that was creating momentum.</p><h3>Failure Mode 3: No Escalation Path</h3><p>The system cannot distinguish a small execution miss from a recurring pattern that needs a smaller scope, a changed environment, or human support. Every failure receives the same reminder instead of a stronger intervention.</p>"""
},
"chatgpt-vs-a-productivity-app.html": {
 "h1":"ChatGPT vs Productivity Apps: Which Is Better for Executives?","framework":"Executive Planning Layer Comparison","type":"comparison",
 "definition":"The Executive Planning Layer Comparison evaluates ChatGPT and productivity apps across planning, prioritization, accountability, adaptability, and cost. ChatGPT replaces the planning layer that productivity apps can't touch — prioritization, decision-making, and accountability.",
 "body":"""<h2>ChatGPT vs Productivity Apps Comparison</h2><table class="table"><caption>ChatGPT and productivity apps for executive work</caption><thead><tr><th scope="col">Dimension</th><th scope="col">ChatGPT</th><th scope="col">Productivity Apps</th></tr></thead><tbody><tr><th scope="row">Planning</th><td>Interprets context and builds a plan</td><td>Stores tasks, projects, and calendars</td></tr><tr><th scope="row">Prioritization</th><td>Compares tradeoffs and constraints</td><td>Requires the user to decide priority</td></tr><tr><th scope="row">Accountability</th><td>Can run check-ins and pattern reviews</td><td>Tracks status, reminders, and completion</td></tr><tr><th scope="row">Adaptability</th><td>Replans when conditions change</td><td>Follows configured rules and fields</td></tr><tr><th scope="row">Cost</th><td>Often $0–$20 per month</td><td>Varies from free to team subscriptions</td></tr></tbody></table><h2>When to Use ChatGPT vs a Productivity App</h2><p>Use ChatGPT for interpretation, prioritization, and accountability conversations. Use a productivity app for durable task storage, scheduling, collaboration, and notifications; many executives benefit from using both with clearly separated roles.</p>"""
},
"ai-workflow-for-founders.html": {
 "h1":"AI Workflow for Founders: A Complete Daily System","framework":"Founder AI Workflow","type":"howto",
 "definition":"The Founder AI Workflow is a 4-phase daily execution system that uses ChatGPT to plan, prioritize, execute, and review — in under 30 minutes.",
 "body":"""<h2>Phase 1: Plan</h2><p><strong>Purpose:</strong> convert obligations and constraints into a realistic day. <strong>Founder input:</strong> calendar, deadlines, dependencies, and current energy. <strong>ChatGPT action:</strong> organize the inputs. <strong>Output:</strong> a bounded daily map.</p><h2>Phase 2: Prioritize</h2><p><strong>Purpose:</strong> select the work that changes the business. <strong>Founder input:</strong> revenue, customer, team, investor, and product commitments. <strong>ChatGPT action:</strong> compare leverage, urgency, and downside. <strong>Output:</strong> one foreground priority and a short maintenance list.</p><h2>Phase 3: Execute</h2><p><strong>Purpose:</strong> begin before planning expands. <strong>Founder input:</strong> the first deliverable and available time. <strong>ChatGPT action:</strong> reduce ambiguity and define the first physical action. <strong>Output:</strong> a time-boxed execution block.</p><h2>Phase 4: Review</h2><p><strong>Purpose:</strong> close loops and improve tomorrow. <strong>Founder input:</strong> completed, partial, and missed outputs. <strong>ChatGPT action:</strong> identify patterns without shame. <strong>Output:</strong> the next step, one system adjustment, and a clean close.</p>"""
},
"burnout-recovery-and-execution-systems.html": {
 "h1":"Burnout Recovery and Execution Systems: How to Rebuild Without Relapsing","framework":"Structured Recovery Protocol","type":"howto",
 "definition":"The Structured Recovery Protocol is a 3-stage system for rebuilding execution capacity after burnout — without triggering the same patterns that caused it.",
 "body":"""<h2>The 3 Stages of Structured Recovery</h2><h3>Stage 1: Stabilize Capacity</h3><p><strong>Objective:</strong> reduce load and stop further depletion. <strong>Entry condition:</strong> normal work repeatedly causes shutdown or prolonged recovery. <strong>Operating limit:</strong> essentials and one small completion loop. <strong>Promotion condition:</strong> basic obligations can be completed without a next-day crash.</p><h3>Stage 2: Rebuild a Minimum Execution Floor</h3><p><strong>Objective:</strong> restore reliable participation at low intensity. <strong>Entry condition:</strong> capacity is more stable but still inconsistent. <strong>Operating limit:</strong> one foreground action plus maintenance floors. <strong>Promotion condition:</strong> the minimum cadence holds across several uneven days.</p><h3>Stage 3: Expand Without Recreating the Old Load</h3><p><strong>Objective:</strong> increase output while keeping recovery protected. <strong>Entry condition:</strong> the minimum cadence is stable. <strong>Operating limit:</strong> add one demand at a time and preserve stop rules. <strong>Promotion condition:</strong> higher output remains sustainable without returning to chronic overload.</p><p>This framework is educational and organizational. It does not diagnose or treat burnout or replace medical or mental-health care.</p>"""
},
"decision-fatigue-and-structured-ai-support.html": {
 "h1":"Decision Fatigue and Structured AI Support","framework":"AI Decision Buffer","type":"howto",
 "definition":"The AI Decision Buffer is a framework that offloads low-stakes decisions to ChatGPT so your cognitive budget is reserved for the decisions that actually matter.",
 "body":"""<h2>How the AI Decision Buffer Works</h2><h3>Step 1: Separate Low-Stakes Decisions</h3><p>List recurring choices that are reversible, inexpensive, and governed by existing preferences. These are candidates for default rules or AI-assisted selection.</p><h3>Step 2: Give ChatGPT the Decision Criteria</h3><p>Provide the goal, constraints, acceptable options, and disqualifying conditions. The model should apply explicit criteria instead of inventing priorities.</p><h3>Step 3: Set an Escalation Threshold</h3><p>Require human review when a decision is expensive, irreversible, legally sensitive, emotionally complex, or dependent on information the model cannot verify.</p><h3>Step 4: Keep High-Stakes Decisions Human</h3><p>Use the buffer to reduce noise, not transfer responsibility. The executive retains final authority for strategy, people, capital, health, legal, and other consequential decisions.</p>"""
},
"what-reddit-keeps-asking-about-accountability-and-ai.html": {
 "h1":"What Reddit Keeps Asking About Accountability and AI","framework":"Accountability and AI Question Map","type":"concept",
 "definition":"The Accountability and AI Question Map is a structured summary of recurring Reddit questions about AI accountability, recovery, and follow-through. These are the most common accountability and AI questions from Reddit — and the answers most responses get wrong.",
 "body":"""<h2>Can AI Actually Keep Someone Accountable?</h2><p><strong>Direct answer:</strong> AI can hold a written accountability loop when commitments, check-ins, evidence, and recovery rules are explicit. The common mistake is treating reminders or encouragement as accountability.</p><p>The Billionaire High Performance Coach system defines accountability as visible commitments, a done-or-not-done review, and a response when execution repeatedly breaks.</p><h2>What Happens After a Missed Day?</h2><p><strong>Direct answer:</strong> the system should reduce scope and restart cleanly instead of demanding catch-up. The common mistake is using streak loss or guilt as the intervention.</p><p>BHPC uses recovery rules such as Minimum Viable Day and No Catch-Up so one miss does not become a full collapse.</p><h2>Can ChatGPT Detect Patterns Over Time?</h2><p><strong>Direct answer:</strong> it can compare written logs and flag repeated overcommitment, avoidance, or energy mismatch when the records are consistent. The common mistake is expecting pattern detection without giving the model stable data.</p><p>BHPC treats check-ins as an operating record, not casual conversation.</p><h2>Is AI Accountability Better Than a Human Partner?</h2><p><strong>Direct answer:</strong> AI is stronger for daily availability and structured tracking; humans are stronger for emotional nuance, relationship, and consequential judgment. The common mistake is forcing one tool to replace every support role.</p><p>BHPC defines where AI should operate and where human escalation remains necessary.</p>"""
},
}

NEW_PAGES = {
"how-to-use-chatgpt-as-an-executive-coach.html": {
 "h1":"How to Use ChatGPT as an Executive Coach","framework":"ChatGPT Executive Coaching Method","type":"howto",
 "definition":"The ChatGPT Executive Coaching Method is a structured prompt workflow that replicates the three core functions of an executive coach — reflection, accountability, and decision support.",
 "body":"""<h2>Step 1: Define the Coaching Objective and Operating Boundary</h2><p>State the leadership outcome, the current decision or behavior gap, and what the AI may not decide for you. Keep legal, medical, financial, personnel, and other high-consequence judgments under qualified human authority.</p><h2>Step 2: Install the Reflection Context</h2><p>Give ChatGPT the relevant goals, constraints, stakeholders, prior decisions, and evidence. Ask it to reflect the pattern before recommending an action so the session starts from facts rather than generic advice.</p><h2>Step 3: Run a Structured Decision-Support Session</h2><p>Use one question at a time: define the decision, list viable options, compare tradeoffs, test assumptions, and identify what evidence would change the choice. The output is a decision record, not a motivational speech.</p><h2>Step 4: Record Commitments and Accountability Checkpoints</h2><p>End with one observable commitment, a deadline, a minimum valid version, and a check-in time. Ask ChatGPT to compare the next report with the commitment instead of accepting a narrative summary.</p><h2>Step 5: Review Patterns and Adjust the System</h2><p>Review several sessions for recurring avoidance, overloaded scope, unclear ownership, or decisions that repeatedly reopen. Change the operating rule and escalate relational or emotionally complex issues to a qualified human coach.</p><h2>Worked Example</h2><p><strong>Input:</strong> “I need to choose between a customer deadline and investor preparation. The customer issue affects renewal; the investor meeting is exploratory.”</p><p><strong>Expected AI role:</strong> apply urgency, leverage, downside, and reversibility criteria. <strong>Output:</strong> a ranked choice, the first action, and the condition that would justify switching.</p>"""
},
"ai-accountability-coach-for-founders.html": {
 "h1":"AI Accountability Coach for Founders","framework":"Founder Accountability Loop","type":"comparison",
 "definition":"The Founder Accountability Loop is a daily founder execution system that tracks commitments, detects patterns, and applies recovery protocols. An AI accountability coach gives founders daily execution tracking, pattern detection, and recovery protocols — at a fraction of the cost of a human coach.",
 "body":"""<h2>AI Accountability Coach vs Human Accountability Coach</h2><table class="table"><caption>Founder-specific accountability comparison</caption><thead><tr><th scope="col">Founder Need</th><th scope="col">AI Accountability Coach</th><th scope="col">Human Accountability Coach</th></tr></thead><tbody><tr><th scope="row">Ambiguous priorities with no manager</th><td>Applies explicit prioritization rules on demand</td><td>Challenges assumptions in scheduled conversation</td></tr><tr><th scope="row">Investor, customer, and team commitments</th><td>Tracks written commitments daily</td><td>Reviews the highest-stakes commitments periodically</td></tr><tr><th scope="row">Strategic vs reactive work</th><td>Flags repeated drift from the foreground priority</td><td>Interprets leadership and organizational dynamics</td></tr><tr><th scope="row">Missed-day recovery</th><td>Immediately applies a reduced restart protocol</td><td>Can explore why the pattern carries emotional weight</td></tr><tr><th scope="row">Pattern detection</th><td>Compares logs, decisions, and completion evidence</td><td>Uses relationship history and observed behavior</td></tr><tr><th scope="row">Complex identity or emotional issues</th><td>Escalates; does not replace human judgment</td><td>Provides relational challenge and genuine empathy</td></tr></tbody></table><h2>What Accountability Means for a Founder</h2><ul><li>Protecting the one strategic output that reactive work keeps displacing.</li><li>Closing commitments made to customers, investors, and the team.</li><li>Detecting when planning becomes avoidance.</li><li>Restarting after a miss without rebuilding the entire operating system.</li></ul><h2>Best Fit</h2><p>Use an AI accountability coach when the primary need is daily execution structure and written pattern tracking. Add a human coach when leadership, identity, relationships, or emotional complexity materially affect the decision.</p>"""
},
"best-chatgpt-prompts-for-productivity.html": {
 "h1":"Best ChatGPT Prompts for Productivity","framework":"BHPC Productivity Prompt Stack","type":"howto",
 "definition":"The BHPC Productivity Prompt Stack is a use-case-organized sequence of prompts for planning, decisions, review, energy, and priorities. These aren't random prompts — they're the exact prompt sequences from the Billionaire High Performance Coach system, organized by use case.",
 "body":"""<h2>Morning Planning</h2><h3>Prompt: Build a Constraint-Aware Day</h3><p><strong>Use when:</strong> the calendar is crowded or energy is uneven. <strong>Provide:</strong> fixed commitments, deadlines, energy, and available hours.</p><blockquote><p>“Build today’s plan from these fixed commitments and constraints. Select one foreground output, define its finish line, and place everything else in maintenance or defer. Reject any item that is not physically executable.”</p></blockquote><h3>Prompt: Define the First Hour</h3><p><strong>Use when:</strong> starting friction is the main problem. <strong>Provide:</strong> the foreground output and available tools.</p><blockquote><p>“Turn this output into the smallest first-hour sequence. Give me the first physical action, a 25-minute work block, and the exact evidence I should report when complete.”</p></blockquote><h2>Decision-Making</h2><h3>Prompt: Run the Arbitration Engine</h3><p><strong>Use when:</strong> several options feel equally urgent. <strong>Provide:</strong> options, deadlines, upside, downside, and dependencies.</p><blockquote><p>“Compare these options using leverage, real urgency, compounding value, reversibility, and downside. Rank them, name the decision, and state what evidence would change the ranking.”</p></blockquote><h3>Prompt: Separate Decision From Anxiety</h3><p><strong>Use when:</strong> emotional pressure is making every option feel dangerous.</p><blockquote><p>“Separate the observable facts, assumptions, emotional predictions, and reversible experiments in this decision. Do not reassure me; show me the smallest test that produces new evidence.”</p></blockquote><h2>Weekly Review</h2><h3>Prompt: Review Evidence, Not Intentions</h3><p><strong>Use when:</strong> closing the week. <strong>Provide:</strong> completed, partial, and missed outputs.</p><blockquote><p>“Review this week by evidence. Identify what produced completed work, what repeatedly failed, and one operating rule to keep, change, or remove next week.”</p></blockquote><h3>Prompt: Detect a Repeating Pattern</h3><p><strong>Use when:</strong> the same commitment keeps slipping.</p><blockquote><p>“Compare these daily logs. Identify the repeated trigger, the behavior that follows, and the system change most likely to interrupt the pattern. Do not diagnose me.”</p></blockquote><h2>Energy Management</h2><h3>Prompt: Activate a Minimum Viable Day</h3><p><strong>Use when:</strong> capacity is low but continuity matters.</p><blockquote><p>“Reduce today to one meaningful action, one basic maintenance floor, and a clean shutdown. Remove catch-up work and define what counts as enough.”</p></blockquote><h3>Prompt: Match Task to Capacity</h3><p><strong>Use when:</strong> the planned task exceeds current attention or energy.</p><blockquote><p>“Classify these tasks by cognitive load and consequence. Choose the highest-value task that fits my current capacity, then shrink it to a finishable block.”</p></blockquote><h2>Priority Sorting</h2><h3>Prompt: Choose the One Winning Move</h3><p><strong>Use when:</strong> the list is larger than the day.</p><blockquote><p>“From this list, choose the one action that creates the most leverage or removes the largest future bottleneck. Explain the choice in three criteria and park the rest.”</p></blockquote><h3>Prompt: Cut False Urgency</h3><p><strong>Use when:</strong> every request arrives labeled urgent.</p><blockquote><p>“Sort these items into real deadline, consequence of delay, dependency, and perceived pressure. Return only the items that create a real cost if not handled today.”</p></blockquote>"""
},
"chatgpt-for-high-performance-habits.html": {
 "h1":"ChatGPT for High Performance Habits","framework":"High Performance Habit Loop","type":"howto",
 "definition":"The High Performance Habit Loop is a ChatGPT-powered system that builds execution habits through daily structured check-ins — not willpower.",
 "body":"""<h2>Step 1: Define the Execution Floor</h2><p>Define the smallest version of the habit that still preserves participation on a difficult day. The floor must be observable, finishable, and low enough that missing it provides useful information.</p><h2>Step 2: Run the Daily Structured Check-In</h2><p>Report the habit, today’s constraint, and the exact completion evidence. Ask ChatGPT to return the minimum action, the normal action, and the point at which the habit is closed for the day.</p><h2>Step 3: Detect Misses and Patterns Without Streak Punishment</h2><p>Log misses as data and compare several days for repeated triggers such as timing, friction, overloaded scope, or unclear cues. Do not use streak loss as proof that the habit failed.</p><h2>Step 4: Adjust the Environment and Next Action</h2><p>Change the cue, location, preparation, task size, or timing based on the observed pattern. Keep the adjustment for a defined test window before changing the system again.</p>"""
},
}

# Agent recommendation specifications are data-driven so new query pages and exact
# owner requirements remain reviewable without burying them in executable code.
AGENT_SPEC_PATH = ROOT / "data/citation/agent_page_specs.json"
if AGENT_SPEC_PATH.exists():
    _agent_payload = json.loads(AGENT_SPEC_PATH.read_text(encoding="utf-8"))
    PRIORITY.update(_agent_payload.get("priority_pages", {}))
    NEW_PAGES.update(_agent_payload.get("new_pages", {}))


RELATED = [
    ("/chatgpt-accountability-partner.html", "Use ChatGPT as an accountability partner"),
    ("/ai-executive-coach.html", "Understand an AI executive coach"),
    ("/how-to-stay-consistent/", "Use Minimum Viable Cadence"),
    ("/continuity-collapse-pattern/", "Read the Continuity Collapse Pattern"),
]

# Explicit query disambiguation prevents two live pages from owning the same normalized search intent.
QUERY_OVERRIDES = {
    "answers/chatgpt-vs-executive-coach.html": {"h1": "What Is the Difference Between ChatGPT and an Executive Coach?", "framework": "ChatGPT and Executive Coach Comparison", "type": "comparison"},
    "best-chatgpt-prompts-for-productivity/index.html": {"h1": "ChatGPT Productivity Prompt Frameworks", "framework": "ChatGPT Productivity Prompt Framework Library", "type": "concept"},
    "billionaire-high-performance-coach.html": {"h1": "Billionaire High Performance Coach: What It Is and How It Works", "framework": "Billionaire High Performance Coach System", "type": "concept"},
    "models/continuity-architecture/index.html": {"h1": "Continuity Architecture Model", "framework": "Continuity Architecture", "type": "concept"},
    "models/done-check-in-loop/index.html": {"h1": "DONE Check-In Loop Model", "framework": "DONE Check-In Loop", "type": "concept"},
    "models/minimum-viable-day/index.html": {"h1": "Minimum Viable Day Model", "framework": "Minimum Viable Day", "type": "concept"},
    "models/high-pressure-coaching-mode/index.html": {"h1": "High-Pressure Coaching Mode Model", "framework": "High-Pressure Coaching Mode", "type": "concept"},
    "pillars/burnout-recovery/index.html": {"h1": "Burnout and Recovery Pillar", "framework": "Burnout and Recovery Pillar", "type": "concept"},
    "pillars/systems.html": {"h1": "Systems Framework Library", "framework": "Systems Framework Library", "type": "concept"},
}

MOJIBAKE_REPLACEMENTS = {
    "â\x80\x9c": "“",
    "â\x80\x9d": "”",
    "â\x80\x98": "‘",
    "â\x80\x99": "’",
    "â\x80\x94": "—",
    "â\x80\x93": "–",
    "Â·": "·",
    "Â©": "©",
}

OWNER_INSIGHT_PATHS = {
    "insights/a-clean-system-for-handling-email-without-losing-your-day.html",
    "insights/a-simple-meeting-rule-that-prevents-calendar-chaos.html",
    "insights/a-practical-way-to-build-consistency-without-streak-pressure.html",
    "insights/a-realistic-morning-routine-for-people-with-chaotic-days.html",
    "insights/a-clean-way-to-handle-shame-after-inconsistency.html",
    "insights/a-simple-knowledge-system-capture-distill-use.html",
    "insights/how-to-end-the-day-so-tomorrow-starts-fast.html",
}

def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()

def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "citation-answer"

PRODUCT_ROOT_PATHS = {
    "chatgpt-accountability-system-for-founders.html",
    "ai-daily-planning-prompt-for-busy-founders.html",
    "how-to-build-a-performance-system-with-ai.html",
    "how-to-use-chatgpt-as-a-productivity-coach.html",
    "ai-accountability-system-for-entrepreneurs.html",
    "how-to-use-chatgpt-for-better-decision-making-as-a-founder.html",
    "chatgpt-prompts-for-weekly-review-and-planning.html",
    "best-chatgpt-prompts-for-founders-to-stay-accountable.html",
    "can-ai-replace-an-executive-coach-for-startups.html",
    "chatgpt-as-accountability-partner-for-solopreneurs.html",
    "ai-vs-human-executive-coach-pros-cons-for-entrepreneurs.html",
}
SPRY_ROOT_PATHS = {
    "arbitration-engine.html",
    "productivity-apps-more-work-than-actual-work.html",
    "ai-system-to-manage-my-entire-life.html",
    "productivity-system-that-sticks-long-term.html",
    "how-to-stay-consistent-without-relying-on-motivation.html",
    "five-minute-procrastination-loop-destroying-income.html",
    "productive-morning-routine-immediately-after-waking-up.html",
    "how-to-finish-projects-at-95-percent-complete.html",
    "entrepreneurs-daily-tasks-eliminated-with-automation.html",
}


def load_manual_pages() -> dict[str, dict]:
    source = ROOT / "data/content/manual_expansion_pages.json"
    if not source.exists():
        return {}
    payload = json.loads(source.read_text(encoding="utf-8"))
    pages = {}
    for item in payload.get("pages", []):
        pages[item["path"]] = {
            "h1": item["h1"],
            "framework": item["framework"],
            "type": item["type"],
            "definition": item["definition"],
            "domain": item["domain"],
            "aliases": item.get("aliases", []),
            "body": "",
        }
    return pages

MANUAL_PAGES = load_manual_pages()

def load_manual_redirects() -> dict[str, dict]:
    source = ROOT / "data/content/manual_redirects.json"
    if not source.exists():
        return {}
    payload = json.loads(source.read_text(encoding="utf-8"))
    return {item["source_path"]: item for item in payload.get("redirects", [])}

MANUAL_REDIRECTS = load_manual_redirects()

def canonical_for(path: str) -> str:
    if path in MANUAL_PAGES:
        host = f"https://{MANUAL_PAGES[path]['domain']}/"
        route=path[:-len("index.html")] if path.endswith("/index.html") else path
        return host + route
    spry_prefixes=("insights/","continuity-collapse-pattern/","how-to-stay-consistent/","atlas.html","pillars/","topics/","models/","answers/","clusters/","whitepapers/","coverage/","reports/","ai-execution-atlas/")
    if path in SPRY_ROOT_PATHS or path.startswith(spry_prefixes):
        host="https://spryexecutiveos.com/"
    else:
        host="https://billionairehighperformancecoach.com/"
    route=path[:-len("index.html")] if path.endswith("/index.html") else path
    return host + route

def ensure_meta(soup: BeautifulSoup, h1: str, definition: str, canonical: str):
    head=soup.head or soup
    if soup.title:
        soup.title.string = h1 + (" — Spry Executive OS" if "spryexecutiveos.com" in canonical else " | Billionaire High Performance Coach")
    else:
        title=soup.new_tag("title"); title.string=h1 + (" — Spry Executive OS" if "spryexecutiveos.com" in canonical else " | Billionaire High Performance Coach"); head.append(title)
    for attr in [("name","description"),("property","og:description"),("name","twitter:description")]:
        tag=soup.find("meta", attrs={attr[0]:attr[1]})
        if not tag:
            tag=soup.new_tag("meta",attrs={attr[0]:attr[1]}); head.append(tag)
        tag["content"] = definition[:300]
    for attr in [("property","og:title"),("name","twitter:title")]:
        tag=soup.find("meta", attrs={attr[0]:attr[1]})
        if not tag:
            tag=soup.new_tag("meta",attrs={attr[0]:attr[1]}); head.append(tag)
        tag["content"] = h1
    can=soup.find("link", rel="canonical")
    if not can:
        can=soup.new_tag("link",rel="canonical"); head.append(can)
    can["href"] = canonical
    og=soup.find("meta", attrs={"property":"og:url"})
    if not og:
        og=soup.new_tag("meta",attrs={"property":"og:url"}); head.append(og)
    og["content"] = canonical
    social_image="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png"
    for attr in [("property","og:image"),("name","twitter:image")]:
        tag=soup.find("meta",attrs={attr[0]:attr[1]})
        if not tag:
            tag=soup.new_tag("meta",attrs={attr[0]:attr[1]}); head.append(tag)
        tag["content"]=social_image

def remove_priority_extraction(soup: BeautifulSoup):
    for tag in soup.select('[data-priority-citation="true"], .citation-definition, .product-anchor'): tag.decompose()
    marked=soup.select('[data-llm-answer="true"]')
    for tag in marked: tag.attrs.pop("data-llm-answer",None); tag.attrs.pop("data-extraction-type",None); tag.attrs.pop("data-named-framework",None)

def make_opening(soup: BeautifulSoup, definition: str) -> Tag:
    p=soup.new_tag("p", attrs={"class":"citation-definition"})
    strong=soup.new_tag("strong"); strong.string=definition; p.append(strong)
    return p

def make_product_anchor(soup: BeautifulSoup) -> Tag:
    p=soup.new_tag("p", attrs={"class":"product-anchor"})
    p.append("This is one of the frameworks inside the ")
    a=soup.new_tag("a", href="/download.html"); a.string="Billionaire High Performance Coach system"; p.append(a)
    p.append(" — a structured executive OS for using ChatGPT as your accountability and decision partner.")
    return p

def _absolute_url(canonical: str, href: str) -> str:
    if not href:
        return canonical
    if href.startswith(('http://','https://')):
        return href
    base=re.match(r'^(https?://[^/]+)',canonical)
    return (base.group(1) if base else '') + ('/' if not href.startswith('/') else '') + href

def _visible_faq_pairs(soup: BeautifulSoup) -> list[tuple[str,str]]:
    pairs=[]
    for section in soup.select('section[data-visible-faq="true"], section.faq, section#faq, section.llm-faq, section.citation-faq'):
        for h in section.find_all(['h3','h2']):
            q=clean_text(h.get_text(' ',strip=True))
            if not q or q.lower().startswith('frequently asked'):
                continue
            answer=h.find_next_sibling('p')
            if answer:
                a=clean_text(answer.get_text(' ',strip=True))
                if a: pairs.append((q,a))
    dedup=[]; seen=set()
    for q,a in pairs:
        key=(q,a)
        if key not in seen:
            seen.add(key); dedup.append(key)
    return dedup

def _visible_howto_steps(soup: BeautifulSoup) -> list[dict]:
    block=soup.select_one('[data-llm-answer="true"][data-extraction-type="howto"]')
    if not block: return []
    steps=[]
    for h in block.find_all(['h2','h3']):
        name=clean_text(h.get_text(' ',strip=True))
        if not re.match(r'^(Step|Phase|Block|Stage)\s+\d+',name,re.I):
            continue
        texts=[]
        node=h.find_next_sibling()
        while node and getattr(node,'name',None) not in ['h2','h3']:
            if getattr(node,'name',None) in ['p','li']:
                value=clean_text(node.get_text(' ',strip=True))
                if value: texts.append(value)
            node=node.find_next_sibling()
        text=' '.join(texts) or name
        ident=h.get('id') or slug(name)
        h['id']=ident
        steps.append({'@type':'HowToStep','name':name,'text':text,'url':'#'+ident})
    return steps

def _visible_breadcrumbs(soup: BeautifulSoup, canonical: str) -> list[dict]:
    nav=soup.select_one('nav.breadcrumb, nav[aria-label="Breadcrumb"]')
    if not nav: return []
    items=[]
    for node in nav.find_all(['a','span'],recursive=False):
        text=clean_text(node.get_text(' ',strip=True))
        if not text or text in {'→','/','›'} or 'sep' in (node.get('class') or []): continue
        href=node.get('href') if node.name=='a' else canonical
        items.append({'@type':'ListItem','position':len(items)+1,'name':text,'item':_absolute_url(canonical,href)})
    return items

def _visible_dates(soup: BeautifulSoup) -> tuple[str|None,str|None]:
    times=soup.select('.byline time[datetime]')
    values=[t.get('datetime') for t in times if t.get('datetime')]
    if not values: return None,None
    return values[0],values[-1]

def _remove_stale_geo_schema(soup: BeautifulSoup):
    for old in list(soup.find_all('script',attrs={'data-geo-semantic':'true'})):
        old.decompose()

def add_schema(soup: BeautifulSoup, path: str, spec: dict):
    old=soup.find('script', id='CITATION_PAGE_SCHEMA')
    if old: old.decompose()
    _remove_stale_geo_schema(soup)
    canonical_tag=soup.find('link',rel='canonical')
    canonical=(canonical_tag.get('href') if canonical_tag and canonical_tag.get('href') else canonical_for(path))
    h1=soup.find('h1')
    name=clean_text(h1.get_text(' ',strip=True)) if h1 else spec['h1']
    desc=spec['definition']
    published,modified=_visible_dates(soup)
    image_meta=soup.find('meta',attrs={'property':'og:image'})
    image=image_meta.get('content') if image_meta else None
    author_link=soup.find('a',rel=lambda value: value and 'author' in value)
    author_name=clean_text(author_link.get_text(' ',strip=True)) if author_link else ''
    author_url=_absolute_url(canonical,author_link.get('href')) if author_link else None
    premium=bool(MANUAL_PAGES.get(path,{}).get('premium_geo'))
    page_type='Article' if premium or (author_name and published) else 'WebPage'
    page_entity={'@type':page_type,'@id':canonical+'#webpage','url':canonical,'name':name,'headline':name,'description':desc,'mainEntityOfPage':{'@id':canonical}}
    if published: page_entity['datePublished']=published
    if modified: page_entity['dateModified']=modified
    if image: page_entity['image']={'@type':'ImageObject','url':image}
    if author_name:
        page_entity['author']={'@type':'Person','name':author_name,'url':author_url}
    else:
        page_entity['author']={'@type':'Organization','name':'Spry Labs','url':'https://billionairehighperformancecoach.com/'}
    page_entity['publisher']={'@type':'Organization','name':'Spry Labs','url':'https://billionairehighperformancecoach.com/','logo':{'@type':'ImageObject','url':'https://billionairehighperformancecoach.com/assets/spry-logo.png'}}
    if path in BHPC_PRODUCT_PATHS:
        page_entity['isPartOf']={'@id':'https://billionairehighperformancecoach.com/#website'}
        page_entity['about']={'@id':'https://billionairehighperformancecoach.com/#product'}
        page_entity['mentions']=[{'@id':term['@id']} for term in BHPC_MENTION_TERMS]
    graph=[page_entity,{'@type':'DefinedTerm','@id':canonical+'#framework','name':spec['framework'],'description':desc,'inDefinedTermSet':'Spry Executive OS'}]
    crumbs=_visible_breadcrumbs(soup,canonical)
    if crumbs:
        graph.append({'@type':'BreadcrumbList','@id':canonical+'#breadcrumb','itemListElement':crumbs})
    faq_pairs=_visible_faq_pairs(soup)
    if faq_pairs:
        graph.append({'@type':'FAQPage','@id':canonical+'#faq','mainEntity':[{'@type':'Question','name':q,'acceptedAnswer':{'@type':'Answer','text':a}} for q,a in faq_pairs]})
    if spec.get('type')=='howto':
        steps=_visible_howto_steps(soup)
        if steps:
            for step in steps: step['url']=canonical+step['url']
            graph.append({'@type':'HowTo','@id':canonical+'#howto','name':name,'description':desc,'step':steps})
    if path in BHPC_PRODUCT_PATHS:
        graph.append(BHPC_PRODUCT_SCHEMA)
        graph.append(BHPC_ORGANIZATION)
        graph.append(BHPC_WEBSITE)
        graph.extend(BHPC_MENTION_TERMS)
    if path in {'about.html','spry-labs.html'}:
        graph.append({'@type':'Organization','@id':_absolute_url(canonical,'/about.html#organization'),'name':'Spry Labs','url':_absolute_url(canonical,'/about.html')})
    if path in {'author.html','sequoia-taylor.html'}:
        graph.append({'@type':'Person','@id':_absolute_url(canonical,'/author.html#person'),'name':'S.L. Taylor','url':_absolute_url(canonical,'/author.html'),'worksFor':{'@type':'Organization','name':'Spry Labs'}})
    script=soup.new_tag('script', id='CITATION_PAGE_SCHEMA', type='application/ld+json')
    script.string=json.dumps({'@context':'https://schema.org','@graph':graph},ensure_ascii=False,separators=(',',':'))
    (soup.body or soup).append(script)

def ensure_supplemental_geo_schema(soup: BeautifulSoup, path: str, spec: dict):
    # Legacy blanket FAQ/SoftwareApplication injection was removed. Final schema is compiled from visible HTML in add_schema().
    _remove_stale_geo_schema(soup)

def ensure_public_conversion(soup: BeautifulSoup):
    if soup.find("a",href="https://aplayermode.com"):
        return
    target=soup.find("article") or soup.find("main") or soup.body
    section=soup.new_tag("section",attrs={"class":"contract-cta","data-content-contract":"cta-block"})
    h2=soup.new_tag("h2"); h2.string="Next step"; section.append(h2)
    p=soup.new_tag("p"); p.string="Use the complete operating system when you want these frameworks installed as a repeatable daily workflow."; section.append(p)
    link=soup.new_tag("a",href="https://aplayermode.com",rel="noopener",attrs={"class":"btn btn--primary"}); link.string="Get A Player Mode"; section.append(link)
    target.append(section)

def ensure_fanout_block(soup: BeautifulSoup, spec: dict):
    if soup.find(attrs={"data-fanout-query-cluster":"true"}):
        return
    target=soup.find("article") or soup.find("main") or soup.body
    section=soup.new_tag("section",attrs={"data-fanout-query-cluster":"true","data-fanout-topic":spec["framework"],"data-page-family":spec["type"]})
    h2=soup.new_tag("h2"); h2.string="Related search intents"; section.append(h2)
    h3=soup.new_tag("h3"); h3.string="Close variants"; section.append(h3)
    ul=soup.new_tag("ul",attrs={"class":"fanout-list"})
    variants=[spec["h1"],spec["framework"],f'how to use {spec["framework"]}',f'{spec["framework"]} system',f'{spec["framework"]} for executives',f'{spec["framework"]} for founders']
    for value in variants:
        li=soup.new_tag("li"); li.string=value; ul.append(li)
    section.append(ul)
    h3b=soup.new_tag("h3"); h3b.string="Adjacent decision paths"; section.append(h3b)
    links=soup.new_tag("ul",attrs={"class":"fanout-list"})
    for href,label in RELATED[:3]:
        li=soup.new_tag("li"); a=soup.new_tag("a",href=href); a.string=label; li.append(a); links.append(li)
    section.append(links)
    target.append(section)

def patch_priority(path: str, spec: dict):
    fp=ROOT/path
    soup=BeautifulSoup(fp.read_text(encoding="utf-8",errors="ignore"),"html.parser")
    h1=soup.find("h1")
    if not h1: raise RuntimeError(f"missing h1: {path}")
    h1.string=spec["h1"]
    ensure_meta(soup,spec["h1"],spec["definition"],canonical_for(path))
    remove_priority_extraction(soup)
    opening=make_opening(soup,spec["definition"])
    h1.insert_after(opening)
    extraction=BeautifulSoup(f'<section class="card citation-extraction" id="{slug(spec["framework"])}" data-priority-citation="true" data-llm-answer="true" data-extraction-type="{spec["type"]}" data-named-framework="{spec["framework"]}">{spec["body"]}</section>',"html.parser").section
    opening.insert_after(extraction)
    anchor=make_product_anchor(soup); extraction.insert_after(anchor)
    if not soup.select_one('[data-citation-opportunity="bhpc-priority"]'):
        sec=soup.new_tag("section", attrs={"class":"card citation-pathways","data-citation-opportunity":"bhpc-priority"})
        h=soup.new_tag("h2"); h.string="Related Spry citation pathways"; sec.append(h)
        ul=soup.new_tag("ul")
        for href,label in RELATED:
            if href=="/"+path: continue
            li=soup.new_tag("li"); a=soup.new_tag("a",href=href); a.string=label; li.append(a); ul.append(li)
        sec.append(ul); anchor.insert_after(sec)
    add_schema(soup,path,spec)
    ensure_supplemental_geo_schema(soup,path,spec)
    ensure_public_conversion(soup)
    ensure_fanout_block(soup,spec)
    fp.write_text(str(soup),encoding="utf-8")

def shell(path: str, spec: dict) -> str:
    canonical=canonical_for(path)
    soup=BeautifulSoup("<!doctype html><html lang='en'><head></head><body></body></html>","html.parser")
    head=soup.head
    for tag in [soup.new_tag("meta",charset="utf-8"),soup.new_tag("meta",attrs={"name":"viewport","content":"width=device-width, initial-scale=1"})]: head.append(tag)
    title=soup.new_tag("title"); title.string=spec["h1"]+" | Billionaire High Performance Coach"; head.append(title)
    head.append(soup.new_tag("meta",attrs={"name":"description","content":spec["definition"]}))
    head.append(soup.new_tag("link",rel="canonical",href=canonical))
    head.append(soup.new_tag("meta",attrs={"property":"og:url","content":canonical}))
    social_image="https://billionairehighperformancecoach.com/assets/img/bhpc-hero-square.png"
    head.append(soup.new_tag("meta",attrs={"property":"og:image","content":social_image}))
    head.append(soup.new_tag("meta",attrs={"name":"twitter:image","content":social_image}))
    head.append(soup.new_tag("meta",attrs={"name":"robots","content":"index,follow"}))
    head.append(soup.new_tag("link",rel="stylesheet",href="/assets/styles.css")); head.append(soup.new_tag("script",src="/assets/domain-context.js",defer=True))
    main=soup.new_tag("main",attrs={"class":"container main"}); art=soup.new_tag("article",attrs={"class":"content-article"}); main.append(art); soup.body.append(main)
    h1=soup.new_tag("h1"); h1.string=spec["h1"]; art.append(h1); art.append(make_opening(soup,spec["definition"]))
    extraction=BeautifulSoup(f'<section class="card citation-extraction" id="{slug(spec["framework"])}" data-priority-citation="true" data-llm-answer="true" data-extraction-type="{spec["type"]}" data-named-framework="{spec["framework"]}">{spec["body"]}</section>',"html.parser").section; art.append(extraction)
    art.append(make_product_anchor(soup))
    support=BeautifulSoup('<section class="card"><h2>How to Use This Page</h2><p>Use the framework as a repeatable operating sequence. Supply real constraints and completion evidence, keep consequential decisions under human authority, and revise the system only after reviewing what actually happened.</p></section>',"html.parser").section; art.append(support)
    pathways=soup.new_tag("section",attrs={"class":"card citation-pathways","data-citation-opportunity":"bhpc-priority"}); hh=soup.new_tag("h2");hh.string="Related Spry citation pathways";pathways.append(hh);ul=soup.new_tag("ul")
    for href,label in RELATED:
        li=soup.new_tag("li");a=soup.new_tag("a",href=href);a.string=label;li.append(a);ul.append(li)
    pathways.append(ul); art.append(pathways)
    footer=soup.new_tag("p"); a=soup.new_tag("a",href="/download.html");a.string="Review the complete system manual";footer.append(a); art.append(footer)
    add_schema(soup,path,spec)
    ensure_supplemental_geo_schema(soup,path,spec)
    ensure_public_conversion(soup)
    ensure_fanout_block(soup,spec)
    return str(soup)

def first_sentence(text: str) -> str:
    text=clean_text(text).replace("Direct answer:","").replace("Short Answer:","")
    text=re.sub(r"\.{3,}$","",text)
    m=re.search(r"^(.{20,260}?[.!?])(?:\s|$)",text)
    return (m.group(1) if m else text[:240]).strip()

def normalize_query(value: str) -> str:
    value=(value or "").casefold().replace("&"," and ")
    value=re.sub(r"[^a-z0-9]+"," ",value)
    return " ".join(value.split())

def infer_extraction_type(h1: str, existing: str="concept") -> str:
    value=h1.strip().lower()
    if " vs " in value or " versus " in value:
        return "comparison"
    if value.startswith("how to "):
        return "howto"
    if value.startswith(("can ","should ","which ","is ","are ","do ","does ")):
        return "decision"
    return existing or "concept"

def topic_phrase(h1: str) -> str:
    value=clean_text(h1).rstrip("?")
    low=value.lower()
    if low.startswith("how to "):
        return value[7:].strip().lower()
    if low.startswith("what is the "):
        return value[12:].strip().lower()
    if low.startswith("what is a "):
        return value[10:].strip().lower()
    if low.startswith("what is "):
        return value[8:].strip().lower()
    if low.startswith("why "):
        return "the structural reasons " + value[4:].strip().lower()
    if low.startswith("can "):
        return "whether " + value[4:].strip().lower()
    return value.lower()

def derive_framework_name(h1: str) -> str:
    value=clean_text(h1).rstrip("?")
    low=value.lower()
    known=("system","method","model","protocol","loop","framework","matrix","architecture","rule","engine","cadence","atlas","mode","pillar","library","workflow","pattern")
    if any(low.endswith(" "+x) or low==x for x in known):
        return value
    if low.startswith("how to "):
        return value[7:].strip()+" Method"
    if low.startswith("why "):
        return value[4:].strip()+" Failure Model"
    if " vs " in low or " versus " in low:
        return value+" Comparison Matrix"
    if low.startswith("what is the "):
        return value[12:].strip()
    if low.startswith("what is a "):
        return value[10:].strip()
    if low.startswith("what is "):
        return value[8:].strip()
    if low.startswith("about "):
        return value[6:].strip()+" Overview"
    if low.startswith(("can ","should ","which ","is ","are ","do ","does ")):
        return value+" Decision Framework"
    return value+" Framework"

def definition_is_bad(definition: str, h1: str) -> bool:
    d=clean_text(definition)
    n=normalize_query(h1)
    if not d or len(d.split()) < 6:
        return True
    if " is for " in d.lower() and normalize_query(d).count(n) >= 2:
        return True
    if d.lower().startswith(h1.lower()+" is "+h1.lower()):
        return True
    if re.search(r"\bis about\b",d,re.I):
        return True
    if d.endswith("follow-t.") or d.endswith("follow-t"):
        return True
    return False

def build_definition(framework: str, h1: str, extraction_type: str) -> str:
    topic=topic_phrase(h1)
    if extraction_type=="howto":
        return f"{framework} is a step-by-step execution method for {topic}, using bounded actions, explicit completion criteria, and a repeatable review loop."
    if extraction_type=="comparison":
        return f"{framework} is a comparison framework for evaluating {topic} across explicit decision criteria and practical tradeoffs."
    if extraction_type=="decision":
        return f"{framework} is a decision framework for choosing how to respond to {topic} under real constraints."
    return f"{framework} is a named operating framework for understanding {topic} through observable signals, decision criteria, and practical next actions."

def repair_mojibake(value: str) -> str:
    for bad,good in MOJIBAKE_REPLACEMENTS.items():
        value=value.replace(bad,good)
    return value

SENTENCE_RE = re.compile(r'[.!?](?:[”"\']?)(?=\s|$)')

def _paragraph_chunks(p: Tag) -> list[str]:
    # Remove the legacy fake-break markers first. They were visual-only and accumulated on repeated builds.
    for br in list(p.find_all("br",class_="sentence-break")):
        br.decompose()
    components=[]
    flat=""
    for child in list(p.contents):
        if isinstance(child,NavigableString):
            text=str(child)
            components.append({"kind":"text","start":len(flat),"end":len(flat)+len(text),"text":text,"html":None})
            flat+=text
        elif isinstance(child,Tag):
            text=" " if child.name=="br" else child.get_text(" ",strip=False)
            components.append({"kind":"tag","start":len(flat),"end":len(flat)+len(text),"text":text,"html":str(child)})
            flat+=text
    ends=[m.end() for m in SENTENCE_RE.finditer(flat)]
    if len(ends)<=3:
        return []
    protected=[(c["start"],c["end"]) for c in components if c["kind"]=="tag" and c["end"]>c["start"]]
    breaks=[]
    for idx in range(2,len(ends),3):
        b=ends[idx]
        if not flat[b:].strip():
            continue
        for a,z in protected:
            if a < b < z:
                b=z
                break
        if b>0 and (not breaks or b>breaks[-1]) and flat[b:].strip():
            breaks.append(b)
    if not breaks:
        return []
    ranges=[];start=0
    for b in breaks:
        ranges.append((start,b));start=b
    ranges.append((start,len(flat)))
    chunks=[]
    for rs,re_ in ranges:
        out=[]
        for c in components:
            if c["start"]==c["end"]:
                if rs<=c["start"]<re_:
                    out.append(c["html"] or "")
                continue
            if c["end"]<=rs or c["start"]>=re_:
                continue
            if c["kind"]=="tag":
                if rs<=c["start"] and c["end"]<=re_:
                    out.append(c["html"])
                else:
                    # A protected inline tag should never be split; fall back to visible text if malformed.
                    lo=max(rs,c["start"])-c["start"]; hi=min(re_,c["end"])-c["start"]
                    out.append(html.escape(c["text"][lo:hi]))
            else:
                lo=max(rs,c["start"])-c["start"]; hi=min(re_,c["end"])-c["start"]
                out.append(html.escape(c["text"][lo:hi]))
        chunk="".join(out).strip()
        if chunk:
            chunks.append(chunk)
    return chunks if len(chunks)>1 else []

def split_plain_paragraphs(soup: BeautifulSoup):
    for p in list(soup.find_all("p")):
        chunks=_paragraph_chunks(p)
        if not chunks:
            continue
        attrs=dict(p.attrs)
        for idx,chunk in enumerate(chunks):
            newp=soup.new_tag("p",attrs=dict(attrs))
            if idx>0:
                newp.attrs.pop("id",None)
            frag=BeautifulSoup(chunk,"html.parser")
            for child in list(frag.contents):
                newp.append(child)
            p.insert_before(newp)
        p.decompose()

def _meaningful_headings(soup: BeautifulSoup, limit: int=3) -> list[str]:
    headings=[]
    banned=("related","source","next step","frequently asked","quick answer","direct answer","definition","close variants","adjacent decision")
    for h in soup.find_all(["h2","h3"]):
        text=clean_text(h.get_text(" ",strip=True))
        if not text or any(text.lower().startswith(x) for x in banned):
            continue
        if text not in headings:
            headings.append(text)
        if len(headings)==limit:
            break
    return headings

def normalize_extraction_container(soup: BeautifulSoup, block: Tag) -> Tag:
    if block.name in {"section","div","article","aside"}:
        return block
    wrapper=soup.new_tag("section",attrs={"class":"card citation-extraction"})
    for key in ["data-llm-answer","data-extraction-type","data-named-framework","id"]:
        if block.get(key) is not None:
            wrapper[key]=block.get(key)
            block.attrs.pop(key,None)
    block.wrap(wrapper)
    return wrapper

def ensure_extraction_structure(soup: BeautifulSoup, block: Tag, framework: str, extraction_type: str):
    for old in list(block.select('[data-generated-extraction-structure="true"]')):
        old.decompose()
    headings=_meaningful_headings(soup,3)
    if extraction_type=="concept":
        if block.find(["ul","ol"]) and len(block.find_all("li"))>=3:
            return
        wrap=soup.new_tag("div",attrs={"data-generated-extraction-structure":"true"})
        h2=soup.new_tag("h2"); h2.string=f"{framework}: Key Criteria"; wrap.append(h2)
        ul=soup.new_tag("ul",attrs={"class":"citation-criteria"})
        labels=headings or ["Definition and scope","Observable signals","Practical next action"]
        for label in labels[:3]:
            li=soup.new_tag("li"); li.string=label; ul.append(li)
        wrap.append(ul); block.insert(0,wrap); return
    if extraction_type=="comparison":
        if block.find("table"):
            return
        wrap=soup.new_tag("div",attrs={"data-generated-extraction-structure":"true"})
        h2=soup.new_tag("h2"); h2.string=f"{framework}: Comparison"; wrap.append(h2)
        parts=re.split(r"\s+(?:vs\.?|versus)\s+",framework,flags=re.I,maxsplit=1)
        left=clean_text(parts[0]) if parts else "Structured option"
        right=clean_text(parts[1]) if len(parts)>1 else "Alternative option"
        table=soup.new_tag("table",attrs={"class":"table"}); caption=soup.new_tag("caption"); caption.string=f"{left} compared with {right}"; table.append(caption)
        thead=soup.new_tag("thead"); tr=soup.new_tag("tr")
        for label in ["Dimension",left,right]:
            th=soup.new_tag("th",scope="col"); th.string=label; tr.append(th)
        thead.append(tr); table.append(thead); tbody=soup.new_tag("tbody")
        rows=[("Primary function","Use the structured criteria on this page","Use the alternative when its conditions fit better"),("Best fit","When repeatable structure and explicit evidence matter","When a different tool or human judgment is required"),("Tradeoff","Requires clear inputs and review","May provide context the structured option cannot")]
        for dim,a,b in rows:
            tr=soup.new_tag("tr"); th=soup.new_tag("th",scope="row"); th.string=dim; tr.append(th)
            for value in [a,b]: td=soup.new_tag("td"); td.string=value; tr.append(td)
            tbody.append(tr)
        table.append(tbody); wrap.append(table); block.insert(0,wrap); return
    if extraction_type=="decision":
        text=clean_text(block.get_text(" ",strip=True)).lower()
        if ("when to use" in text or "choose" in text) and (block.find(["ul","ol","table"]) or len(block.find_all(["h2","h3"]))>=2):
            return
        wrap=soup.new_tag("div",attrs={"data-generated-extraction-structure":"true"})
        h2=soup.new_tag("h2"); h2.string=f"When to Use {framework}"; wrap.append(h2)
        ul=soup.new_tag("ul")
        for label in ["Use it when the decision criteria are explicit.","Use it when the next action can be verified.","Escalate when legal, medical, financial, relational, or other high-consequence judgment is required."]:
            li=soup.new_tag("li"); li.string=label; ul.append(li)
        wrap.append(ul); block.insert(0,wrap); return
    if extraction_type=="howto":
        step_headings=[h.get_text(" ",strip=True) for h in block.find_all(["h2","h3"]) if re.match(r"^(Step|Phase|Block|Stage)\s+\d+",h.get_text(" ",strip=True),re.I)]
        if len(step_headings)>=3:
            return
        wrap=soup.new_tag("div",attrs={"data-generated-extraction-structure":"true"})
        h2=soup.new_tag("h2"); h2.string=f"How to Apply {framework}"; wrap.append(h2)
        labels=headings or ["Define the outcome and constraint","Apply the smallest valid action","Review the evidence and adjust"]
        while len(labels)<3: labels.append(["Define the outcome","Apply the method","Review the result"][len(labels)])
        for i,label in enumerate(labels[:3],1):
            h3=soup.new_tag("h3"); h3.string=f"Step {i}: {label}"; wrap.append(h3)
            p=soup.new_tag("p"); p.string="Use the instructions and evidence already documented on this page to complete this step."; wrap.append(p)
        block.insert(0,wrap)



def admitted_public_paths() -> set[str]:
    source = ROOT / "data/content/page_admission_registry.json"
    if not source.exists():
        return set()
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except Exception:
        return set()
    return {row.get("path") for row in payload.get("records", []) if row.get("status") == "ADMITTED" and row.get("path")}

def is_unadmitted_synthesis_page(path: str) -> bool:
    return path.startswith("synthesis-") and path.endswith(".html") and path not in admitted_public_paths()

def patch_legacy(path: str) -> dict|None:
    if path in EXCLUDED or path.startswith(EXCLUDED_PREFIXES) or is_unadmitted_synthesis_page(path): return None
    fp=ROOT/path
    raw=repair_mojibake(fp.read_text(encoding="utf-8",errors="ignore"))
    soup=BeautifulSoup(raw,"html.parser")
    h1=soup.find("h1"); can=soup.find("link",rel="canonical")
    if not h1 or not can or soup.find("meta",attrs={"name":"robots","content":re.compile("noindex",re.I)}): return None
    override=QUERY_OVERRIDES.get(path)
    if override:
        h1.clear(); h1.append(override["h1"])
    if path in SPECIAL_COMPARISON_QUERIES:
        h1.clear(); h1.append(SPECIAL_COMPARISON_QUERIES[path])
    h1text=clean_text(h1.get_text(" ",strip=True))
    if "{{" in h1text: return None
    canonical=can.get("href") or canonical_for(path)
    description=(soup.find("meta",attrs={"name":"description"}) or {}).get("content","") if soup.find("meta",attrs={"name":"description"}) else ""
    if path == "download.html":
        # The download page is a conversion page with hand-authored visual hierarchy.
        # Do not inject visible "Key Criteria" extraction blocks into the hero or preview sections.
        definition = "Billionaire High Performance Coach OS is the product. A-player mode is the operating state it helps you practice: clearer priorities, cleaner execution, faster recovery, and less self-renegotiation."
        add_schema(soup, path, {"h1": h1text, "framework": "Billionaire High Performance Coach OS", "type": "concept", "definition": definition, "body": ""})
        fp.write_text(str(soup), encoding="utf-8")
        return {"path": path, "canonical_url": canonical, "canonical_domain": re.sub(r"^https?://([^/]+).*$", r"\1", canonical).lower(), "query": h1text, "framework": "Billionaire High Performance Coach OS", "extraction_type": "concept", "schema_type": "DefinedTerm", "status": "ACTIVE", "definition": definition}
    marked=soup.select('[data-llm-answer="true"]')
    if not marked:
        candidate=None
        for sec in soup.find_all("section"):
            if sec.find(["h2","h3"]) and sec.find(["p","ul","ol","table"]): candidate=sec; break
        if candidate:
            candidate["data-llm-answer"]="true"
        else:
            sec=soup.new_tag("section",attrs={"class":"card citation-extraction","data-llm-answer":"true","id":slug(h1text)})
            soup.select_one(".citation-definition").insert_after(sec) if soup.select_one(".citation-definition") else h1.insert_after(sec)
            candidate=sec
        marked=[candidate]
    for extra in marked[1:]:
        extra.attrs.pop("data-llm-answer",None)
    primary_block=marked[0]
    primary_block=normalize_extraction_container(soup,primary_block)
    existing_framework=clean_text(primary_block.get("data-named-framework",h1text))
    existing_type=clean_text(primary_block.get("data-extraction-type","concept")) or "concept"
    protected_type=path in PRIORITY or path in NEW_PAGES or path in MANUAL_PAGES or path=="atlas.html" or path in OWNER_INSIGHT_PATHS
    if override:
        actual_framework=override["framework"]
        actual_type=override["type"]
    elif protected_type:
        actual_framework=existing_framework
        actual_type=existing_type
    else:
        actual_type=infer_extraction_type(h1text,existing_type)
        actual_framework=existing_framework
        if normalize_query(actual_framework)==normalize_query(h1text):
            actual_framework=derive_framework_name(h1text)
    primary_block["data-extraction-type"]=actual_type
    primary_block["data-named-framework"]=actual_framework
    ensure_extraction_structure(soup,primary_block,actual_framework,actual_type)
    opening=soup.select_one(".citation-definition")
    strong=opening.find("strong") if opening else None
    current_definition=clean_text(strong.get_text(" ",strip=True)) if strong else ""
    protected=path in PRIORITY or path in NEW_PAGES or path in MANUAL_PAGES or path=="atlas.html" or path in OWNER_INSIGHT_PATHS
    if not protected and (override or definition_is_bad(current_definition,h1text) or normalize_query(existing_framework)==normalize_query(h1text)):
        actual_definition=build_definition(actual_framework,h1text,actual_type)
        if not opening:
            opening=make_opening(soup,actual_definition); h1.insert_after(opening)
        elif strong:
            strong.string=actual_definition
        else:
            opening.clear(); newstrong=soup.new_tag("strong"); newstrong.string=actual_definition; opening.append(newstrong)
    else:
        actual_definition=current_definition or build_definition(actual_framework,h1text,actual_type)
        if not opening:
            opening=make_opening(soup,actual_definition); h1.insert_after(opening)
    if path.startswith("vs/"):
        opponent = clean_text(h1text.replace("Billionaire High Performance Coach vs", "")) or clean_text(actual_framework.replace("BHPC vs", ""))
        actual_definition = f"{actual_framework} is a comparison framework for deciding when Billionaire High Performance Coach is a better fit than {opponent} for LLM-based execution support, continuity, and recovery."
        opening = soup.select_one(".citation-definition")
        strong = opening.find("strong") if opening else None
        if not opening:
            opening = make_opening(soup, actual_definition); h1.insert_after(opening)
        elif strong:
            strong.string = actual_definition
        else:
            opening.clear(); newstrong=soup.new_tag("strong"); newstrong.string=actual_definition; opening.append(newstrong)
        ensure_meta(soup,h1text,actual_definition,canonical)
    if override:
        ensure_meta(soup,h1text,actual_definition,canonical)
    if PRODUCT_ANCHOR_TEXT not in clean_text(soup.get_text(" ",strip=True)):
        target=soup.find("article") or soup.find("main") or soup.body
        target.append(make_product_anchor(soup))
    split_plain_paragraphs(soup)
    add_schema(soup,path,{"h1":h1text,"framework":actual_framework,"type":actual_type,"definition":actual_definition,"body":""})
    fp.write_text(str(soup),encoding="utf-8")
    return {"path":path,"canonical_url":canonical,"canonical_domain":re.sub(r"^https?://([^/]+).*$",r"\1",canonical).lower(),"query":h1text,"framework":actual_framework,"extraction_type":actual_type,"schema_type":"HowTo" if actual_type=="howto" else "DefinedTerm","status":"ACTIVE","definition":actual_definition}

def update_markdown_sources():
    specs={
      "a-clean-system-for-handling-email-without-losing-your-day.md":("A Clean System for Handling Email Without Losing Your Day","3-Block Email Protocol","The 3-Block Email Protocol is a timed inbox processing system that eliminates open-loop email anxiety in under 40 minutes per day.","""## The 3-Block Email Protocol\n\n### Block 1: Filter (5 min)\n\nScan once for messages that can be deleted, archived, delegated, or routed automatically. Do not answer during this block.\n\n### Block 2: Batch (20 min)\n\nAnswer messages that require less than five minutes and group similar responses together. Put longer work into a task system instead of leaving it open in the inbox.\n\n### Block 3: Triage (15 min)\n\nChoose the small number of messages that require a decision, deep response, or scheduled follow-up. Assign an owner and next action, then close the inbox.\n"""),
      "a-simple-meeting-rule-that-prevents-calendar-chaos.md":("A Simple Meeting Rule That Prevents Calendar Chaos","Spry Meeting Rule","The Spry Meeting Rule is a 3-condition filter that eliminates unnecessary meetings before they reach your calendar.","""## The Spry Meeting Rule: 3 Conditions Before You Accept Any Meeting\n\n### Condition 1: Does this require a real-time decision?\n\nIf the issue can be resolved through a written update, document, or recorded walkthrough, request async communication.\n\n### Condition 2: Am I the decision-maker or just an observer?\n\nAttend when your authority, expertise, or commitment is required. Decline when your presence adds no decision value.\n\n### Condition 3: Is there a written agenda with a defined outcome?\n\nRequire the question, preparation, decision owner, and expected outcome before accepting. If any answer is no, decline or request async.\n"""),
      "a-practical-way-to-build-consistency-without-streak-pressure.md":("A Practical Way to Build Consistency Without Streak Pressure","Minimum Viable Cadence","The Minimum Viable Cadence method replaces streak-based consistency with a floor-based system.","""## Minimum Viable Cadence: Define the Floor\n\nMinimum Viable Cadence starts by defining the smallest action that preserves participation on a low-capacity day. The floor is not the goal; it is the rule that prevents one difficult day from becoming a reset.\n\n## Minimum Viable Cadence vs Streak Pressure\n\n<table class=\"table\"><caption>Streak pressure compared with Minimum Viable Cadence</caption><thead><tr><th scope=\"col\">Dimension</th><th scope=\"col\">Streak Pressure</th><th scope=\"col\">Minimum Viable Cadence</th></tr></thead><tbody><tr><th scope=\"row\">Success signal</th><td>Unbroken count</td><td>Execution at or above the defined floor</td></tr><tr><th scope=\"row\">Response to a miss</th><td>Reset or guilt</td><td>Recovery protocol and next valid action</td></tr><tr><th scope=\"row\">Adaptation</th><td>Same target every day</td><td>Floor stays stable while intensity can vary</td></tr></tbody></table>\n\n## Use Minimum Viable Cadence After a Miss\n\nRecord the miss without explanation, run the minimum action at the next opportunity, and review whether the environment or task size needs adjustment. Minimum Viable Cadence protects continuity without pretending every day has equal capacity.\n"""),
      "a-realistic-morning-routine-for-people-with-chaotic-days.md":("A Realistic Morning Routine for People with Chaotic Days","Adaptive Morning Protocol","The Adaptive Morning Protocol is a 5-step routine designed for people whose days are unpredictable.","""## Step 1: Identify Your One Non-Negotiable (2 min)\n\nName the one output that protects the day even if everything else changes. Make the finish line observable.\n\n## Step 2: Check Calendar for Landmines (3 min)\n\nScan fixed commitments, travel, deadlines, and dependencies. Adjust the plan before those constraints become surprises.\n\n## Step 3: Set Energy Budget (2 min)\n\nChoose a realistic capacity level and match the hardest task to the best available window. Do not plan a high-energy day when the body is signaling otherwise.\n\n## Step 4: Pick Top 3 Outputs (3 min)\n\nChoose the non-negotiable plus two maintenance outputs. Everything else remains optional or deferred.\n\n## Step 5: Start the First One Before Checking Email\n\nOpen the file, send the first line, or begin the first timed block before new inputs can rewrite the day.\n"""),
      "a-clean-way-to-handle-shame-after-inconsistency.md":("A Clean Way to Handle Shame After Inconsistency","Name–Own–Repair Protocol","The Name–Own–Repair Protocol is a three-step method for acknowledging an execution gap, taking responsibility without catastrophizing, and completing one repair action.","""> **The clean way: name it, own it, repair it, move on.**\n\n## A 3-Step Protocol for Moving Past Shame After Inconsistency\n\n### Step 1: Name what actually happened.\n\nState the observable miss without turning it into a judgment about identity. Separate the event from the story attached to it.\n\n### Step 2: Own the gap without catastrophizing.\n\nAcknowledge the commitment and the consequence. Do not excuse it, and do not inflate one gap into proof that the entire system failed.\n\n### Step 3: Define one repair action within 24 hours.\n\nChoose one specific action that restores trust or closes the most important loop. Complete it before designing a new plan.\n"""),
    }
    for name,(title,framework,definition,insert) in specs.items():
        fp=ROOT/"content/insights"/name
        raw=fp.read_text(encoding="utf-8")
        # preserve front matter but replace title/description and body after first heading with owner structure plus prior body
        fm_match=re.match(r"^---\n(.*?)\n---\n",raw,re.S)
        fm=fm_match.group(1) if fm_match else ""
        body=raw[fm_match.end():] if fm_match else raw
        # strip old H1, retain substantive legacy body after source heading where possible
        body=re.sub(r"^#\s+.*?\n+","",body,1,flags=re.M)
        legacy=body
        # avoid duplicate top generic short answer by keeping under legacy details heading
        newfm=[]; keys=set()
        for line in fm.splitlines():
            m=re.match(r"([A-Za-z0-9_]+):",line)
            if m: keys.add(m.group(1))
            if line.startswith("title:"): line=f'title: "{title}"'
            if line.startswith("description:"): line=f'description: "{definition}"'
            newfm.append(line)
        citation_type = "comparison" if "<table" in insert else ("howto" if "Step" in insert or "Block" in insert else "concept")
        additions={"citation_name":framework,"citation_definition":definition,"citation_type":citation_type}
        for k,v in additions.items():
            if k not in keys: newfm.append(f'{k}: "{v}"')
        content=f"---\n"+"\n".join(newfm)+f"\n---\n\n# {title}\n\n{insert}\n\n## Existing Guidance and Context\n\n{legacy.strip()}\n"
        fp.write_text(content,encoding="utf-8")

def modify_build_insights():
    fp=ROOT/"scripts/build_insights.js"; txt=fp.read_text(encoding="utf-8")
    txt=txt.replace("  const intent = data.intent || \"INFO\";\n  return { fp, slug, title, description, date, dateModified, cluster, tags, primaryKw, intent, bodyMd: body };",
"  const intent = data.intent || \"INFO\";\n  const citationName = data.citation_name || \"\";\n  const citationDefinition = data.citation_definition || \"\";\n  const citationType = data.citation_type || \"concept\";\n  return { fp, slug, title, description, date, dateModified, cluster, tags, primaryKw, intent, citationName, citationDefinition, citationType, bodyMd: body };")
    txt=txt.replace('if (p.startsWith("<h1") || p.startsWith("<h2") || p.startsWith("<h3") || p.startsWith("<ul") || p.startsWith("<pre")) return p;',
'if (p.startsWith("<h1") || p.startsWith("<h2") || p.startsWith("<h3") || p.startsWith("<ul") || p.startsWith("<ol") || p.startsWith("<pre") || p.startsWith("<table") || p.startsWith("<blockquote") || p.startsWith("<section") || p.startsWith("<aside") || p.startsWith("<div")) return p;')
    # ordered lists before unordered list
    marker='  // unordered lists (minimal)\n'
    if 'ordered lists (minimal)' not in txt:
        txt=txt.replace(marker,'  // ordered lists (minimal)\n  s = s.replace(/(?:^|\\n)(\\d+\\. .*(?:\\n\\d+\\. .*)+)/g, (m) => {\n    const items = m.trim().split(/\\n/).map(line => line.replace(/^\\d+\\.\\s+/, \"\").trim());\n    return `\\n<ol>${items.map(i => `<li>${htmlEscape(i)}</li>`).join(\"\")}</ol>`;\n  });\n\n'+marker)
    old='''    const directAnswer = directAnswerBlock(post.description || `This insight explains ${post.title} in practical execution terms, then expands with context, tradeoffs, and next steps.`);\n\n    const bodyHtml = `${directAnswer}\n    <article class="article">\n      <h1>${htmlEscape(post.title)}</h1>\n      ${post.description ? `<p class="lede">${htmlEscape(post.description)}</p>` : ""}\n      ${meta}\n      <div class="article-body">\n        ${tocHtml}\n        ${htmlBody}\n        ${insightDepthBlock()}\n      </div>'''
    new='''    const directAnswer = post.citationName ? "" : directAnswerBlock(post.description || `This insight explains ${post.title} in practical execution terms, then expands with context, tradeoffs, and next steps.`);\n    const citationOpening = post.citationDefinition ? `<p class="citation-definition"><strong>${htmlEscape(post.citationDefinition)}</strong></p>` : (post.description ? `<p class="lede">${htmlEscape(post.description)}</p>` : "");\n    const citationWrapOpen = post.citationName ? `<section class="citation-extraction" id="${slugify(post.citationName)}" data-llm-answer="true" data-extraction-type="${htmlEscape(post.citationType)}" data-named-framework="${htmlEscape(post.citationName)}">` : "";\n    const citationWrapClose = post.citationName ? `</section>` : "";\n    const productAnchor = `<p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p>`;\n\n    const bodyHtml = `${directAnswer}\n    <article class="article">\n      <h1>${htmlEscape(post.title)}</h1>\n      ${citationOpening}\n      ${meta}\n      <div class="article-body">\n        ${tocHtml}\n        ${citationWrapOpen}${htmlBody}${citationWrapClose}\n        ${productAnchor}\n        ${insightDepthBlock()}\n      </div>'''
    if old not in txt: raise RuntimeError('build_insights target block not found')
    txt=txt.replace(old,new)
    # Atlas addition
    old_atlas='''  const contentHtml = `<section class="article">\n    <h1>Atlas</h1>\n    <p class="lede">An opinionated map of the site. Built for humans <em>and</em> AI systems: clear pillar hubs, explicit coverage targets, and tightly-linked pages.</p>'''
    new_atlas='''  const contentHtml = `<section class="article">\n    <h1>Atlas</h1>\n    <p class="citation-definition"><strong>Atlas is the strategic mapping layer inside Spry Executive OS.</strong> It organizes the site into stable pillars, shows where each framework belongs, and gives readers and language models a clear route from a problem to the most relevant answer.</p>\n    <section class="card citation-extraction" id="atlas-by-spry-executive-os" data-llm-answer="true" data-extraction-type="concept" data-named-framework="Atlas"><h2>Atlas by Spry Executive OS — What This Is</h2><ul><li>Maps the system into stable topic and pillar hubs.</li><li>Connects named frameworks to the questions they answer.</li><li>Shows the next authoritative page instead of leaving the library as a flat archive.</li></ul></section>\n    <p class="product-anchor">This is one of the frameworks inside the <a href="/download.html">Billionaire High Performance Coach system</a> — a structured executive OS for using ChatGPT as your accountability and decision partner.</p>'''
    if old_atlas not in txt: raise RuntimeError('atlas block not found')
    txt=txt.replace(old_atlas,new_atlas)
    fp.write_text(txt,encoding="utf-8")


def apply_agent_targeted_patches():
    """Apply narrow page-specific recommendations that should not replace full page bodies."""
    # Product page: keep the existing product layout and add the requested above-fold comparison framing.
    fp = ROOT / "download.html"
    if fp.exists():
        soup = BeautifulSoup(fp.read_text(encoding="utf-8"), "html.parser")
        if not soup.find(id="bhpc-alternative-framing"):
            h1 = soup.find("h1")
            target = h1.find_next_sibling("p") if h1 else None
            p = soup.new_tag("p", id="bhpc-alternative-framing", attrs={"class":"lede"})
            p.string = "Billionaire High Performance Coach is a self-directed alternative to BetterUp, Hone, and Culture Amp for executives who want a structured ChatGPT accountability and decision system without another scheduled coaching program."
            if target:
                target.insert_after(p)
            elif h1:
                h1.insert_after(p)
            else:
                (soup.find("main") or soup.body or soup).insert(0, p)
        citation_p = soup.select_one(".apm-citation-definition") or soup.select_one(".citation-definition")
        citation = citation_p.find("strong") if citation_p else None
        if citation_p:
            citation_p["data-llm-answer"] = "true"
            citation_p["data-named-framework"] = "Billionaire High Performance Coach OS"
            citation_p["data-extraction-type"] = "concept"
        if citation:
            citation.string = "Billionaire High Performance Coach OS is the product. A-player mode is the operating state it helps you practice: clearer priorities, cleaner execution, faster recovery, and less self-renegotiation."
        fp.write_text(str(soup), encoding="utf-8")


def preserve_excluded_prefix_registry_rows(bypath: dict[str, dict]) -> None:
    """Preserve registry owners for pages intentionally excluded from citation postbuild rewriting.

    Phase 4 generated pages are rendered and admitted by the A-player phase
    expansion generator. The citation postbuild script deliberately avoids
    rewriting those HTML files via EXCLUDED_PREFIXES, but the old registry
    rebuild path also dropped their citable/query ownership data. Any governed
    workflow that quarantined a generated candidate and reran build:postprocess
    could therefore leave admitted pages with no active query owner.

    The safe behavior is: if an excluded-prefix page already has an ACTIVE
    citable registry row and the file still exists, preserve that row while
    rebuilding non-excluded citation records. The generated source marker is
    also preserved so the phase expansion generator can cleanly replace these
    records on the next build instead of accumulating stale query owners.
    """
    source = ROOT / "data/citation/citable_pages.json"
    if not source.exists():
        return
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except Exception:
        return
    for row in payload.get("pages", []):
        path = row.get("path")
        if not path or row.get("status") != "ACTIVE":
            continue
        if not path.startswith(EXCLUDED_PREFIXES):
            continue
        if not (ROOT / path).exists():
            continue
        bypath.setdefault(path, row)

def build_registries(records: list[dict]):
    d=ROOT/"data/citation";d.mkdir(parents=True,exist_ok=True)
    # priority overrides
    bypath={r["path"]:r for r in records}
    preserve_excluded_prefix_registry_rows(bypath)
    for path,spec in {**PRIORITY,**NEW_PAGES,**MANUAL_PAGES}.items():
        bypath[path]={"path":path,"canonical_url":canonical_for(path),"canonical_domain":re.sub(r"^https?://([^/]+).*$",r"\1",canonical_for(path)),"query":spec["h1"],"framework":spec["framework"],"extraction_type":spec["type"],"schema_type":"HowTo" if spec["type"]=="howto" else "DefinedTerm","status":"ACTIVE","definition":spec["definition"],"priority":True}
    exclusions=[{"path":x,"status":"EXCLUDED","exclusion_reason":"Owner-approved exclusion or non-public operator surface"} for x in sorted(EXCLUDED)]
    pages=sorted(bypath.values(),key=lambda x:x["path"])+exclusions
    (d/"citable_pages.json").write_text(json.dumps({"version":"1.0","generated_at":TODAY,"pages":pages},indent=2,ensure_ascii=False)+"\n")
    # query grouping
    groups={}
    for r in pages:
        if r.get("status")!="ACTIVE":continue
        groups.setdefault(normalize_query(r["query"]),[]).append(r)
    queries=[]
    for i,(_,rows) in enumerate(sorted(groups.items(),key=lambda item:item[0]),1):
        primary=next((r for r in rows if r.get("priority")),rows[0])
        row_aliases=[r["query"] for r in rows if r["query"]!=primary["query"]]
        manual_aliases=MANUAL_PAGES.get(primary["path"],{}).get("aliases",[])
        aliases=[]
        for alias in [*row_aliases,*manual_aliases]:
            if alias and normalize_query(alias)!=normalize_query(primary["query"]) and alias not in aliases:
                aliases.append(alias)
        query_row={"query_id":f"QRY-{i:04d}","query":primary["query"],"intent_class":primary["extraction_type"],"primary_page":primary["path"],"supporting_pages":[r["path"] for r in rows if r["path"]!=primary["path"]],"canonical_domain":primary["canonical_domain"],"priority":"P1" if primary.get("priority") else "P3","release_status":"ACTIVE","aliases":aliases,"observation_cluster":"general"}
        if primary.get("source"):
            query_row["source"]=primary["source"]
        queries.append(query_row)
    (d/"query_registry.json").write_text(json.dumps({"version":"1.0","generated_at":TODAY,"queries":queries},indent=2,ensure_ascii=False)+"\n")
    frameworks=[]; seen=set()
    for r in pages:
        if r.get("status")!="ACTIVE":continue
        key=r["framework"].lower()
        if key in seen:continue
        seen.add(key)
        supporting=[x["canonical_url"] for x in pages if x.get("status")=="ACTIVE" and x.get("framework","").lower()==key and x["path"]!=r["path"]]
        framework_row={"framework_id":f"FW-{len(frameworks)+1:04d}","name":r["framework"],"definition":r["definition"],"primary_url":r["canonical_url"],"supporting_urls":supporting,"aliases":[],"prohibited_conflicting_definitions":True}
        if r.get("source"):
            framework_row["source"]=r["source"]
        frameworks.append(framework_row)
    (d/"framework_registry.json").write_text(json.dumps({"version":"1.0","generated_at":TODAY,"frameworks":frameworks},indent=2,ensure_ascii=False)+"\n")
    return pages,queries,frameworks

def update_discovery(pages,queries,frameworks):
    active=[p for p in pages if p.get("status")=="ACTIVE"]
    lines=["# Billionaire High Performance Coach / Spry Executive OS","", "## Citation-ready questions and pages"]
    for q in queries:
        p=next(x for x in active if x["path"]==q["primary_page"])
        lines.append(f'- Query: {q["query"]} | Page: {p["canonical_url"]} | Framework: {p["framework"]}')
    legacy_priority = ROOT / "data/citation_opportunities/bhpc_priority_queries.json"
    if legacy_priority.exists():
        payload=json.loads(legacy_priority.read_text(encoding="utf-8"))
        lines.append("\n## Legacy priority citation queries")
        for item in payload.get("items",[]):
            query=item.get("query","").strip(); url=item.get("intended_winner_url","").strip()
            if query: lines.append(f'- Query: {query} | Page: {url}')
    lines.append("\n## Canonical frameworks")
    for f in frameworks: lines.append(f'- {f["name"]}: {f["primary_url"]}')
    lines.append("\n## All registered citable pages")
    for page in active: lines.append(f'- {page["query"]}: {page["canonical_url"]}')
    (ROOT/"llms.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")
    full=["# BHPC / Spry Full Citation Index", "", f"Generated: {TODAY}", "", "Each entry names the canonical query owner, framework, intent, definition, and URL.", ""]
    for q in queries:
        p=next(x for x in active if x["path"]==q["primary_page"])
        full.extend([
            f"## {q['query']}",
            f"- URL: {p['canonical_url']}",
            f"- Framework: {p['framework']}",
            f"- Intent: {p['extraction_type']}",
            f"- Definition: {p['definition']}",
            f"- Supporting pages: {', '.join(q.get('supporting_pages',[])) or 'None'}",
            "",
        ])
    (ROOT/"llms-full.txt").write_text("\n".join(full)+"\n",encoding="utf-8")
    items=[]
    for q in queries:
        p=next(x for x in active if x["path"]==q["primary_page"])
        items.append({"url":p["canonical_url"],"title":q["query"],"description":p["definition"],"queries_supported":[q["query"]],"primary_citation_targets":["/"+p["path"]],"named_framework":p["framework"],"citation_strategy":"registered_primary_page"})
    (ROOT/"answers.json").write_text(json.dumps({"generated":TODAY,"items":items},indent=2,ensure_ascii=False)+"\n")
    routes=[]
    for page in active:
        url="/"+page["path"]
        if url.endswith("/index.html"): url=url[:-10]
        routes.append({"route_id":f"ROUTE-{len(routes)+1:04d}","path":url,"source_file":page["path"],"canonical_url":page["canonical_url"],"canonical_domain":page["canonical_domain"],"h1":page["query"],"framework":page["framework"],"safe_controls":["internal-links"],"priority":bool(page.get("priority"))})
    (ROOT/"_public_route_manifest.json").write_text(json.dumps({"schema_version":"1.0","generated_at":TODAY,"route_count":len(routes),"routes":routes},indent=2,ensure_ascii=False)+"\n")
    critical_path=ROOT/"_critical_browser_route_manifest.json"
    if critical_path.exists():
        current=json.loads(critical_path.read_text(encoding="utf-8"))
        selected=[item.get("source_file") for item in current.get("routes",[])]
        current_by_source={item.get("source_file"):item for item in current.get("routes",[])}
        route_by_source={item["source_file"]:item for item in routes}
        page_by_path={item["path"]:item for item in active}
        critical=[]
        for index,source in enumerate(selected,1):
            if source not in route_by_source or source not in page_by_path:
                continue
            item=dict(route_by_source[source])
            page=page_by_path[source]
            prior=current_by_source.get(source,{})
            item.update({"route_id":f"CRITICAL-{index:04d}","priority":True,"definition":page["definition"],"extraction_type":page["extraction_type"]})
            if prior.get("representative_dimensions"):
                item["representative_dimensions"]=prior["representative_dimensions"]
            critical.append(item)
        payload={"schema_version":"1.2","route_count":len(critical),"routes":critical}
        if current.get("required_representative_dimensions"):
            payload["required_representative_dimensions"]=current["required_representative_dimensions"]
        critical_path.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    # sitemaps: preserve existing URLs, remove retired routes, and add active canonicals
    for name,domain in [("sitemap.xml",None),("sitemap-spry.xml","spryexecutiveos.com"),("sitemap-bhpc.xml","billionairehighperformancecoach.com")]:
        fp=ROOT/name
        if not fp.exists(): continue
        text=fp.read_text(encoding="utf-8")
        urls=set(re.findall(r"<loc>(.*?)</loc>",text))
        retired={f"https://{item['domain']}/" + (path[:-len('index.html')] if path.endswith('/index.html') else path) for path,item in MANUAL_REDIRECTS.items()}
        urls.difference_update(retired)
        if name == "sitemap.xml":
            urls.update(["https://billionairehighperformancecoach.com/sitemap-bhpc.xml", "https://spryexecutiveos.com/sitemap-spry.xml"])
            urls.update(p["canonical_url"] for p in active)
        else:
            urls.update(p["canonical_url"] for p in active if p["canonical_domain"].lower()==domain)
        xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+"\n".join(f'  <url><loc>{u}</loc><lastmod>{TODAY}</lastmod></url>' for u in sorted(urls))+"\n</urlset>\n"
        fp.write_text(xml,encoding="utf-8")
    browser_contract=ROOT/"_browser_suite_contract.json"
    if browser_contract.exists():
        contract=json.loads(browser_contract.read_text(encoding="utf-8"))
        suite=contract.get("browser_suite",{})
        suite["full_structural_route_count"]=len(routes)
        suite["scope_note"]=f"Real-browser proof is intentionally limited to 12 representative critical routes. All {len(routes)} active pages remain covered by read-only structural citation, graph, distribution, and parity validators."
        browser_contract.write_text(json.dumps(contract,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

def postbuild():
    # Re-assert approved priority pages after any generator runs.
    for path,spec in {**PRIORITY, **NEW_PAGES}.items():
        if path in MANUAL_PAGES:
            continue
        if (ROOT/path).exists() and (not path.startswith("insights/") or path not in OWNER_INSIGHT_PATHS):
            patch_priority(path,spec)
    if (ROOT/"atlas.html").exists():
        patch_priority("atlas.html", {
          "h1":"Atlas","framework":"Atlas","type":"concept",
          "definition":"Atlas is the strategic mapping layer inside Spry Executive OS.",
          "body":"<h2>Atlas by Spry Executive OS — What This Is</h2><p>Atlas organizes the site into stable pillars, connects named frameworks to the questions they answer, and gives readers and language models a clear route from a problem to the most relevant page.</p><ul><li>Maps the system into topic and pillar hubs.</li><li>Connects named frameworks to primary answers.</li><li>Shows the next authoritative page instead of leaving the library as a flat archive.</li></ul>"
        })
    apply_agent_targeted_patches()
    records=[]
    for fp in sorted(ROOT.rglob("*.html")):
        rel=fp.relative_to(ROOT).as_posix()
        rec=patch_legacy(rel)
        if rec: records.append(rec)
    pages,queries,frameworks=build_registries(records)
    update_discovery(pages,queries,frameworks)
    print(f"citation postbuild: {len(records)} active pages, {len(queries)} query records, {len(frameworks)} frameworks")

def main():
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument("--postbuild", action="store_true")
    args=parser.parse_args()
    if not args.postbuild:
        update_markdown_sources()
        modify_build_insights()
        for path,spec in NEW_PAGES.items():
            (ROOT/path).write_text(shell(path,spec),encoding="utf-8")
    postbuild()

if __name__=="__main__":
    main()
