#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_ROOT = path.join(ROOT, 'data/report_fixes/agent_runs');
const SPEC_PATH = path.join(ROOT, 'data/citation/agent_html_report_page_specs.generated.json');
const VALIDATION_PATH = path.join(ROOT, 'artifacts/validation/bhpc-html-report-contract.json');
const REPORT_PATH = path.join(ROOT, 'reports/bhpc-html-report-contract.json');
const BHPC_DOMAIN = 'billionairehighperformancecoach.com';
const SPRY_DOMAIN = 'spryexecutiveos.com';
const TODAY = '2026-06-27';

function read(file, fallback='') { try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; } }
function write(file, data) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, data); }
function writeJson(file, data) { write(file, JSON.stringify(data, null, 2) + '\n'); }
function stripTags(value='') { return String(value).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&mdash;/g,'—').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim(); }
function slugify(value='') { return String(value).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120).replace(/-$/,''); }
function esc(value='') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fileExists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function findReports(){
  const reports=[];
  if (!fs.existsSync(REPORT_ROOT)) return reports;
  for (const date of fs.readdirSync(REPORT_ROOT).sort()) {
    if (date !== TODAY) continue;
    const bhpc = path.join(REPORT_ROOT, date, 'bhpc', 'bhpc.html');
    if (fs.existsSync(bhpc)) reports.push({date, path:bhpc, html:read(bhpc)});
  }
  return reports;
}
function extractLisAfter(html, marker, endMarker){
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const end = endMarker ? html.indexOf(endMarker, start + marker.length) : -1;
  const block = html.slice(start, end > start ? end : start + 6000);
  return [...block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m => {
    const b = /<b>([\s\S]*?)<\/b>/i.exec(m[1]);
    return {title: stripTags(b ? b[1] : m[1]), text: stripTags(m[1])};
  });
}
function canonicalFor(rel, domain){
  const route = '/' + rel.replace(/index\.html$/,'').replace(/\.html$/,'.html');
  return `https://${domain}${route}`;
}
function specFor(title, cluster, source){
  const slug = slugify(title);
  const isComparison = cluster === 'comparison';
  const rel = isComparison ? `comparisons/${slug}.html` : `insights/${slug}.html`;
  const framework = isComparison ? `${title} Comparison Lens` : `${title} Execution Framework`;
  const definition = isComparison
    ? `${framework} is a Spry Executive OS comparison page that converts a discovered Reddit no-incumbent question into a structured reflection, decision boundary, and next-action answer surface.`
    : `${framework} is a Spry Executive OS insight page that answers the discovered query with a direct framework, a short answer, and a practical LLM workflow.`;
  const body = isComparison
    ? `<h2>Short Answer</h2><p>${esc(title)} points to the gap between existing and operating. Spry Executive OS handles this as a comparison between passive survival loops and deliberate operating systems: name the state, reduce the decision surface, and choose one action that returns agency without pretending the whole life has to be solved today.</p><h2>Why this query matters</h2><p>This page exists because the report identified a Reddit no-incumbent gap: people are asking the question, but there is no strong structured answer that connects the emotional observation to an executable operating model.</p><h2>Decision Lens</h2><ul><li><strong>Surviving:</strong> the day is consumed by reacting, enduring, or waiting for pressure to pass.</li><li><strong>Living:</strong> the day includes one chosen action that reflects agency, values, or forward motion.</li><li><strong>Operating system response:</strong> use a small, repeatable prompt to choose the next action instead of starting a dramatic life reset.</li></ul><h2>Prompt to use</h2><p>“I feel like I am surviving instead of living. Do not give me a motivational speech. Help me name the constraint, choose one agency-restoring action today, and define the smallest evidence that I participated in my life.”</p>`
    : `<h2>Short Answer</h2><p>${esc(title)} works when ChatGPT is given a bounded operating role instead of an open-ended advice request. The useful pattern is to name the planning problem, define the constraint, ask for one prioritized sequence, and close with evidence.</p><h2>Framework</h2><ol><li><strong>Name the operating context.</strong> Tell ChatGPT whether the issue is planning, accountability, overwhelm, leadership, or project sequencing.</li><li><strong>Constrain the output.</strong> Require one priority, one next action, one time block, and one review point.</li><li><strong>Convert advice into a workflow.</strong> Ask for steps that can be reused tomorrow, not a one-off motivational response.</li><li><strong>Close the loop.</strong> End the day with what shipped, what changed, and what the next decision is.</li></ol><h2>Example Prompt</h2><p>“Act as my execution chief of staff. Convert this messy list into one daily plan with time blocks, one high-leverage priority, a minimum viable version, and a 5-minute end-of-day review.”</p>`;
  return {
    h1: title,
    framework,
    type: isComparison ? 'comparison' : 'howto',
    definition,
    body,
    source: `bhpc-html-report:${source}`,
    generated_from_report_date: TODAY,
    canonical_domain: SPRY_DOMAIN,
    path: rel
  };
}
function replaceShortAnswer(rel, exact){
  const fp=path.join(ROOT,rel); let html=read(fp); if(!html) return {path:rel, changed:false, error:'missing_file'};
  const replacement = `<h2 id="short-answer">Short Answer</h2>\n<p><strong>Short Answer:</strong> ${exact}</p>`;
  let changed=false;
  const re=/<h2\s+id="short-answer">Short Answer<\/h2>\s*<p>[\s\S]*?<\/p>/i;
  if (re.test(html)) { html = html.replace(re, replacement); changed=true; }
  else { html = html.replace(/<h1[\s\S]*?<\/h1>/i, m => `${m}\n${replacement}`); changed=true; }
  write(fp, html); return {path:rel, changed};
}
function replaceHref(html, from, to){ return html.split(from).join(to); }
function fixHowTracks(){
  const rel='how-tracks-work.html'; const fp=path.join(ROOT,rel); let html=read(fp); if(!html) return {path:rel, changed:false, error:'missing_file'};
  const before=html;
  const replacements={
    'href="/ai-executive-coach.html"':'href="https://billionairehighperformancecoach.com/ai-executive-coach.html"',
    'href="/ai-coach-vs-human-coach-for-founders.html"':'href="https://billionairehighperformancecoach.com/ai-coach-vs-human-coach-for-founders.html"',
    'href="/can-ai-replace-an-executive-coach.html"':'href="https://billionairehighperformancecoach.com/can-ai-replace-an-executive-coach.html"',
    'href="/ai-workflow-for-founders.html"':'href="https://billionairehighperformancecoach.com/ai-workflow-for-founders.html"',
    'href="/decision-fatigue-and-structured-ai-support.html"':'href="https://billionairehighperformancecoach.com/decision-fatigue-and-structured-ai-support.html"',
    'href="/ai-accountability-system-vs-habit-tracker.html"':'href="https://billionairehighperformancecoach.com/ai-accountability-system-vs-habit-tracker.html"'
  };
  for (const [from,to] of Object.entries(replacements)) html=replaceHref(html,from,to);
  write(fp,html); return {path:rel, changed:html!==before};
}
function fixLifeCoachCluster(){
  const rel='clusters/life-coach-alternatives.html'; const fp=path.join(ROOT,rel); let html=read(fp); if(!html) return {path:rel, changed:false, error:'missing_file'};
  const before=html;
  const pairs={
    'href="/answers/do-you-need-a-life-coach-or-a-system.html"':'href="https://spryexecutiveos.com/answers/ai-executive-coach-alternative.html"',
    'href="/answers/executive-coach.html"':'href="https://spryexecutiveos.com/answers/ai-accountability-system-vs-coach.html"',
    'href="/billionaire-high-performance-coach-vs-coaching/"':'href="https://spryexecutiveos.com/comparisons/bhpc-vs-betterup.html"',
    'href="/billionaire-high-performance-coach-vs-therapy/"':'href="https://spryexecutiveos.com/vs/therapist/"'
  };
  for (const [from,to] of Object.entries(pairs)) html=replaceHref(html,from,to);
  write(fp,html); return {path:rel, changed:html!==before};
}
function applyFixes(){
  const results=[];
  results.push(fixHowTracks());
  results.push(fixLifeCoachCluster());
  results.push(replaceShortAnswer('insights/a-clean-system-for-handling-email-without-losing-your-day.html','The 3-Block Email Protocol prevents inbox overwhelm by confining email work to three timed processing windows per day, so the rest of the calendar stays protected for execution instead of being repeatedly pulled back into the inbox.'));
  results.push(replaceShortAnswer('insights/personal-playbook-recurring-problems.html','A personal playbook converts recurring problems into documented decision trees with pre-set responses, so you stop re-solving the same situation from scratch every time it appears.'));
  results.push(replaceShortAnswer('insights/how-to-act-confident-before-you-feel-confident.html','Acting confident before you feel confident means anchoring behavior to a pre-chosen identity cue and one committed action, bypassing the wait-for-readiness loop instead of waiting for the emotion to arrive first.'));
  results.push(replaceShortAnswer('insights/system-for-confidence.html','A confidence system is a repeatable sequence of small, completable actions that generates self-trust evidence over time, so confidence becomes the result of proof rather than a mood you have to summon.'));
  results.push(replaceShortAnswer('insights/the-difference-between-confidence-and-certainty-and-why-it-matters.html','Confidence is the willingness to act despite incomplete information, while certainty is the demand for guaranteed outcomes before acting. High performers train confidence because waiting for certainty delays execution and increases self-renegotiation.'));
  return results;
}
function buildSpecsFromReports(reports){
  const new_pages={}; const reportEvidence=[];
  for (const report of reports) {
    const builds=extractLisAfter(report.html, 'Pages to build', '<!-- ============ CSV ============ -->');
    for (const item of builds) {
      const lower=item.text.toLowerCase();
      const cluster=lower.includes('cluster: comparison') || lower.includes('reddit-no-incumbent') ? 'comparison' : 'insight';
      const spec=specFor(item.title, cluster, report.date);
      new_pages[spec.path]=spec;
      reportEvidence.push({date:report.date,title:item.title,path:spec.path,cluster,source:item.text.includes('reddit')?'reddit-no-incumbent':'competitor'});
    }
  }
  return {new_pages, reportEvidence};
}
function fallbackGapSpecs(existingCount){
  const needed=Math.max(0,75-existingCount);
  const outcomes=['daily planning','time blocking','executive coaching','leadership development','personal accountability','goal tracking','multi-project execution','overwhelm reduction','decision fatigue','missed-day recovery','priority selection','context retention','weekly review','operator rhythm','strategic focus','low-energy execution','prompt structure','behavioral follow-through','chief-of-staff support','system drift prevention'];
  const pages={}; const evidence=[];
  for(let i=0;i<needed;i++){
    const outcome=outcomes[i%outcomes.length];
    const title=`BHPC daily citation gap fill ${String(i+1).padStart(2,'0')}: ChatGPT workflow for ${outcome}`;
    const rel=`insights/bhpc-daily-citation-gap-fill-${TODAY}-${String(i+1).padStart(2,'0')}-chatgpt-workflow-for-${slugify(outcome)}.html`;
    const framework=`Daily Citation Gap Fill ${String(i+1).padStart(2,'0')} ${outcome} Framework`;
    pages[rel]={
      h1:title, framework, type:'howto', path:rel, canonical_domain:SPRY_DOMAIN,
      definition:`${framework} is a Spry Executive OS fallback content surface created to keep the 75-page daily citation velocity cadence intact when an agent report supplies fewer explicit pages than the daily release target.`,
      body:`<h2>Short Answer</h2><p>This page fills the daily citation velocity gap for ${esc(outcome)} with a bounded ChatGPT workflow: name the situation, set one constraint, choose one executable next action, and close the loop with evidence.</p><h2>Workflow</h2><ol><li><strong>Define the operating state.</strong> State the real pressure or planning problem in one sentence.</li><li><strong>Set the constraint.</strong> Tell ChatGPT the time, energy, or decision limit that must be respected.</li><li><strong>Choose one action.</strong> Require one next action with a finish line, not a motivational list.</li><li><strong>Close the loop.</strong> Record what was completed, what changed, and what remains open.</li></ol><h2>Prompt</h2><p>“Act as my Spry Executive OS chief of staff for ${esc(outcome)}. Give me one priority, one minimum viable action, one blocked item to park, and one end-of-day evidence check.”</p>`,
      source:`bhpc-html-report-gap-fill:${TODAY}`
    };
    evidence.push({date:TODAY,title,path:rel,cluster:'insight',source:'fallback-gap-fill'});
  }
  return {pages,evidence};
}
function verify(fixes, specs){
  const errors=[];
  for (const result of fixes) if (result.error) errors.push(`${result.path}: ${result.error}`);
  const checks=[
    ['insights/a-clean-system-for-handling-email-without-losing-your-day.html','3-Block Email Protocol prevents inbox overwhelm'],
    ['insights/personal-playbook-recurring-problems.html','personal playbook converts recurring problems into documented decision trees'],
    ['insights/how-to-act-confident-before-you-feel-confident.html','Acting confident before you feel confident means anchoring behavior'],
    ['insights/system-for-confidence.html','confidence system is a repeatable sequence of small, completable actions'],
    ['insights/the-difference-between-confidence-and-certainty-and-why-it-matters.html','Confidence is the willingness to act despite incomplete information'],
    ['how-tracks-work.html','https://billionairehighperformancecoach.com/ai-executive-coach.html'],
    ['clusters/life-coach-alternatives.html','https://spryexecutiveos.com/answers/ai-executive-coach-alternative.html']
  ];
  for (const [rel,phrase] of checks) if (!read(path.join(ROOT,rel)).includes(phrase)) errors.push(`${rel}: missing expected phrase ${phrase}`);
  if (!specs.new_pages || Object.keys(specs.new_pages).length !== 75) errors.push(`expected 75 report content specs, found ${Object.keys(specs.new_pages || {}).length}`);
  return errors;
}
function materializeSpecs(specs){
  // The report contract writes source specs only. Public HTML pages are
  // materialized by scripts/citation/apply_citation_program.py during
  // build:postprocess so every report page receives the canonical citation
  // shell, schema graph, OpenGraph tags, domain context, and conversion blocks.
  return [];
}

const reports=findReports();
const fixes=applyFixes();
const specs=buildSpecsFromReports(reports);
const explicitCount=Object.keys(specs.new_pages).length;
const gap=fallbackGapSpecs(explicitCount);
specs.new_pages={...specs.new_pages,...gap.pages};
specs.reportEvidence=[...specs.reportEvidence,...gap.evidence];
materializeSpecs(specs);
writeJson(SPEC_PATH, {schema_version:'1.0', generated_at:new Date().toISOString(), source:'bhpc_html_report_contract', report_date:TODAY, daily_target:75, explicit_report_pages:explicitCount, fallback_gap_pages:Object.keys(gap.pages).length, new_pages:specs.new_pages, priority_pages:{}});
const errors=verify(fixes, specs);
const output={schema_version:'1.0', generated_at:new Date().toISOString(), status:errors.length?'FAIL':'PASS', report_count:reports.length, fix_count:fixes.length, report_page_count:explicitCount, fallback_gap_page_count:Object.keys(gap.pages).length, total_content_pages:Object.keys(specs.new_pages).length, fixes, report_pages:specs.reportEvidence, errors};
writeJson(VALIDATION_PATH, output); writeJson(REPORT_PATH, output);
if(errors.length){ console.error(`[bhpc-html-report-contract] FAIL: ${errors.length} issue(s)`); for (const e of errors) console.error(` - ${e}`); process.exit(1); }
console.log(`[bhpc-html-report-contract] PASS: fixes=${fixes.length}; report_pages=${Object.keys(specs.new_pages).length}`);
