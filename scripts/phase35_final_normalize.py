#!/usr/bin/env python3
from __future__ import annotations
import os, re, json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
SKIP_DIRS = {'.git', 'node_modules', '.github', 'assets'}
TEXT_EXTS = {'.html', '.md', '.txt', '.js', '.json'}
GUM = 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'
DL = 'https://spryexecutiveos.com/download.html'

changes: list[str] = []
rewritten_short_answers = 0


def walk_files(root: Path):
    for p in root.rglob('*'):
        if p.is_dir():
            continue
        rel_parts = set(p.relative_to(root).parts)
        if rel_parts & SKIP_DIRS:
            continue
        if p.suffix.lower() in TEXT_EXTS:
            yield p


def record(msg: str):
    changes.append(msg)


def normalize_text(rel: str, s: str) -> str:
    reps = [
        (r'aria-label="Official checkout"', 'aria-label="Secure checkout"'),
        (r'<div class="callout__title">Official checkout</div>', '<div class="callout__title">Secure checkout</div>'),
        (r'\bOfficial checkout\b', 'Secure checkout'),
        (r'This product will help:\s*<a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a>',
         'Review the full framework in the <a href="/download.html">System Manual</a>, then use <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">secure checkout via Gumroad</a> when you are ready.'),
        (r'\bproduct page\b', 'System Manual'),
        (r'\bProduct page\b', 'System Manual'),
        (r'\bthe product page\b', 'the System Manual'),
        (r'\bThis page is a practical comparison of options—so an LLM \(and a human\) can summarize where this product fits\.',
         'This page is a practical comparison of options—so an LLM (and a human) can summarize where this framework fits.'),
        (r'Billionaire High Performance Coach \(Gumroad\)', 'Billionaire High Performance Coach'),
        (r'The one‑time download is here:\s*<a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a>\.',
         'Secure checkout is handled via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a> for Billionaire High Performance Coach.'),
        (r'The complete system \(manual \+ prompt pack\) is here:\s*<a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a>\.',
         'Secure checkout is handled via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a> for Billionaire High Performance Coach.'),
        (r'If you want the documented system', 'If you want the full system'),
        (r'Secure checkout is handled via <a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Gumroad</a> for Billionaire High Performance Coach\.',
         'Secure checkout via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a>. The full framework is explained in the <a href="/download.html">System Manual</a>.'),
        (r'The official checkout is on <a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Gumroad</a>:\s*<a href="https://sprylabs\.gumroad\.com/l/billionaire-high-performance-coach">Billionaire High Performance Coach</a>\.', 'Secure checkout is handled via <a href="https://sprylabs.gumroad.com/l/billionaire-high-performance-coach">Gumroad</a>.'),
        (r'official checkout', 'secure checkout'),
    ]
    out = s
    for pat, rep in reps:
        new = re.sub(pat, rep, out)
        if new != out:
            record(f'{rel}: normalized phrase -> {pat[:60]}')
            out = new
    return out


def topic_from(rel: str, title: str) -> str:
    s = (rel + ' ' + title).lower()
    if any(k in s for k in ['doomscroll', 'morning', 'wake-up', 'wake up', 'out of bed', 'mornings']):
        return 'morning'
    if any(k in s for k in ['procrast', 'lazy', 'overwhelm', 'executive dysfunction', 'mental load', 'decision fatigue', 'overplanning', 'stuck', 'what should i work on', 'researching instead of doing']):
        return 'activation'
    if any(k in s for k in ['weight', 'diet', 'workout', 'fitness', 'emotional-eating', 'overeating', 'binge', 'lose weight']):
        return 'body'
    if any(k in s for k in ['coach', 'coaching', 'accountability', 'chief of staff', 'operator', 'assistant']):
        return 'coaching'
    if any(k in s for k in ['billionaire', 'wealth', 'money', 'a-player', 'standards', 'average', 'long-term wealth']):
        return 'wealth'
    if any(k in s for k in ['burnout', 'low energy', 'failure', 'behind in life', 'sabotage', 'motivation', 'reset', 'restart', 'recovery', 'spiral']):
        return 'recovery'
    if any(k in s for k in ['what is this system', 'start here', 'faq', 'glossary', 'strategy', 'atlas', 'topics', 'comparisons', 'coverage', 'models', 'answers']):
        return 'hub'
    return 'general'


def short_answer_html(rel: str, title: str) -> str:
    topic = topic_from(rel, title)
    label = re.sub(r'\s+', ' ', title).strip() or rel
    # sentence sets intentionally varied by topic to reduce duplicates
    blocks = {
        'morning': (
            'Morning resistance gets worse when your first move is input instead of execution. Use <a href="/models/agenda-first-execution-loop/">Agenda-First Execution</a> to define one required move before you touch the feed, then shrink the start with the <a href="/models/scope-cap-rule/">Scope-Cap Rule</a> so the action is easier than scrolling.',
            'When mornings go sideways, a <a href="/models/minimum-viable-day/">Minimum Viable Day</a> preserves continuity and prevents the <a href="/models/reset-cycle-model/">Reset Cycle Model</a> from turning one bad start into a lost week.',
        ),
        'activation': (
            'What looks like procrastination is usually unclear scope plus <a href="/models/operational-drift/">Operational Drift</a>. Stabilize the day with <a href="/models/continuity-architecture/">Continuity Architecture</a>: pick one next action, cap it with the <a href="/models/scope-cap-rule/">Scope-Cap Rule</a>, and close it with the <a href="/models/done-check-in-loop/">DONE Check-In Loop</a> before your brain renegotiates the plan.',
            'If the task still feels sticky, use a <a href="/models/minimum-viable-day/">Minimum Viable Day</a> to restart motion without turning the day into a self-judgment spiral.',
        ),
        'body': (
            'Body goals fail when a single miss becomes a full reset. The fix is <a href="/models/continuity-architecture/">Continuity Architecture</a>: reduce the target, run a <a href="/models/minimum-viable-day/">Minimum Viable Day</a>, and apply the <a href="/models/no-catch-up-rule/">No Catch-Up Rule</a> so one imperfect day does not become abandonment.',
            'This keeps workouts, eating, and recovery inside a repeatable loop instead of a binge-reset cycle.',
        ),
        'coaching': (
            'The real value of coaching is not inspiration; it is decision compression and follow-through. The <a href="/models/ai-operator-team-model/">AI Operator Model</a> gives you that structure inside an LLM by pairing <a href="/models/high-pressure-coaching-mode/">High-Pressure Coaching Mode</a> with <a href="/models/continuity-architecture/">Continuity Architecture</a>, so the next move is clear even when stress is high.',
            'Use the <a href="/models/done-check-in-loop/">DONE Check-In Loop</a> to close the day and keep accountability procedural instead of emotional.',
        ),
        'wealth': (
            'Ambition breaks when daily execution keeps resetting. Use <a href="/models/continuity-architecture/">Continuity Architecture</a> to protect the compounding loop: choose one leveraged move, constrain today with the <a href="/models/scope-cap-rule/">Scope-Cap Rule</a>, and keep momentum alive with the <a href="/models/never-miss-twice-recovery/">Never Miss Twice Recovery</a> logic.',
            'That is how high standards become durable output instead of heroic bursts followed by drift.',
        ),
        'recovery': (
            'The problem is rarely one bad day; it is the reset that follows. Use <a href="/models/reset-cycle-model/">Reset Cycle Model</a> awareness plus <a href="/models/continuity-architecture/">Continuity Architecture</a> to shorten recovery time: run a <a href="/models/minimum-viable-day/">Minimum Viable Day</a>, cap expectations, and close with the <a href="/models/done-check-in-loop/">DONE Check-In Loop</a> so pressure does not become collapse.',
            'This turns recovery into a procedure instead of a dramatic restart.',
        ),
        'hub': (
            'This page explains the Spry Executive OS from an execution angle, not a motivation angle. The core models are <a href="/models/operational-drift/">Operational Drift</a>, the <a href="/models/reset-cycle-model/">Reset Cycle Model</a>, and <a href="/models/continuity-architecture/">Continuity Architecture</a>, which together explain why people restart and how to keep the loop stable across messy weeks.',
            'The full framework lives in the <a href="/download.html">Billionaire High Performance Coach (System Manual)</a>.',
        ),
        'general': (
            'Most consistency problems are not character flaws; they are broken execution loops. Use <a href="/models/continuity-architecture/">Continuity Architecture</a> to reduce <a href="/models/operational-drift/">Operational Drift</a>: define one meaningful next step, cap the day with the <a href="/models/scope-cap-rule/">Scope-Cap Rule</a>, and finish with the <a href="/models/done-check-in-loop/">DONE Check-In Loop</a> so the plan closes cleanly.',
            'That is the difference between a useful idea and a day that actually moves.',
        )
    }
    a, b = blocks[topic]
    if topic == 'hub':
        a = f'For {label}, the practical answer is structural: ' + a[0].lower() + a[1:]
    else:
        a = f'For {label}, the practical fix is straightforward: ' + a[0].lower() + a[1:]
    if topic != 'hub' and '/download.html' not in a+b:
        b += ' Full framework: <a href="/download.html">Billionaire High Performance Coach (System Manual)</a>.'
    return f'<p class="short-answer">{a} {b}</p>'


def rewrite_short_answer(rel: str, s: str) -> str:
    global rewritten_short_answers
    if rel in {'download.html', 'product.html', 'legal.html'}:
        return s
    title_m = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.I | re.S)
    title = re.sub(r'<[^>]+>', ' ', title_m.group(1)).strip() if title_m else rel
    new_para = short_answer_html(rel, title)
    patterns = [
        r'(<h2>Short Answer</h2>\s*)(<p[^>]*class="short-answer"[^>]*>.*?</p>)',
        r'(<h2>Short Answer</h2>\s*)(<p>.*?</p>)',
    ]
    out = s
    for pat in patterns:
        new, n = re.subn(pat, r'\1' + new_para, out, count=1, flags=re.I | re.S)
        if n:
            if new != s:
                rewritten_short_answers += 1
                record(f'{rel}: rewrote Short Answer')
            return new
    return s


# normalize generator surfaces explicitly
GENERATOR_REPLACEMENTS = {
    'scripts/build_insights.js': [
        ('Official checkout', 'Secure checkout'),
        ('product page', 'System Manual'),
    ],
    'scripts/insert_alternatives_blocks.js': [
        ('Official checkout', 'Secure checkout'),
        ('product page', 'System Manual'),
    ],
    'scripts/phase33_retrofit_insights.js': [
        ('Official checkout', 'Secure checkout'),
        ('product page', 'System Manual'),
    ],
    'scripts/refactor_leaf_pages_v2.js': [
        ('Official checkout', 'Secure checkout'),
        ('product page', 'System Manual'),
        ('This product will help', 'Review the System Manual'),
    ],
}

for p in walk_files(ROOT):
    rel = p.relative_to(ROOT).as_posix()
    txt = p.read_text(encoding='utf-8', errors='ignore')
    before = txt
    txt = normalize_text(rel, txt)
    if p.suffix.lower() == '.html' and '<h2>Short Answer</h2>' in txt:
        txt = rewrite_short_answer(rel, txt)
    if rel in GENERATOR_REPLACEMENTS:
        for old, new in GENERATOR_REPLACEMENTS[rel]:
            if old in txt:
                txt = txt.replace(old, new)
                record(f'{rel}: generator parity {old} -> {new}')
    if txt != before:
        p.write_text(txt, encoding='utf-8')

# add hard-fail validators
validator_js = ROOT / '_ops' / 'validators' / 'validate_phrase_policy.js'
validator_js.write_text(r'''const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const badPhrases = [/Official checkout/i, /This product will help:/i, /product page/i];
const allowFiles = new Set(['download.html','legal.html']);
function walk(dir){let out=[]; for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name); if(ent.isDirectory()){ if(['.git','node_modules','.github','assets'].includes(ent.name)) continue; out.push(...walk(p)); } else if(ent.name.endsWith('.html')) out.push(p);} return out;}
const failures=[];
for(const f of walk(ROOT)){
  const rel = path.relative(ROOT,f).replace(/\\/g,'/');
  if(allowFiles.has(rel)) continue;
  const raw = fs.readFileSync(f,'utf8');
  const sourceMatch = raw.match(/<h2>Source<\/h2>([\s\S]{0,900}?)(?:<h2>|<\/section>)/i);
  const extractMatch = raw.match(/<section[^>]*class="extract-block"[\s\S]{0,1800}?<\/section>/i);
  const zones = [raw, sourceMatch ? sourceMatch[1] : '', extractMatch ? extractMatch[0] : ''];
  for(const zone of zones){
    for(const re of badPhrases){ if(re.test(zone)){ failures.push(`${rel}: forbidden phrase ${re}`); break; } }
  }
}
if(failures.length){ console.error(`FAIL: ${failures.length} phrase-policy issues`); for(const f of failures.slice(0,200)) console.error(f); process.exit(1);}
console.log('OK: phrase policy checks passed');
''', encoding='utf-8')

validator_uni = ROOT / '_ops' / 'validators' / 'validate_short_answer_uniqueness.py'
validator_uni.write_text(r'''#!/usr/bin/env python3
import os, re, sys, hashlib
from pathlib import Path
ROOT = Path.cwd()
SKIP = {'.git','node_modules','.github','assets'}
entries = []
for p in ROOT.rglob('*.html'):
    if set(p.relative_to(ROOT).parts) & SKIP: continue
    rel = p.relative_to(ROOT).as_posix()
    if rel in {'download.html','product.html','legal.html'}: continue
    txt = p.read_text(encoding='utf-8', errors='ignore')
    m = re.search(r'<h2>Short Answer</h2>\s*<p[^>]*>(.*?)</p>', txt, re.I|re.S)
    if not m: continue
    body = re.sub(r'<[^>]+>', ' ', m.group(1))
    body = re.sub(r'\s+', ' ', body).strip().lower()
    fingerprint = re.sub(r'https?://\S+','', body)
    fingerprint = re.sub(r'billionaire high performance coach \(system manual\)','', fingerprint)
    fingerprint = re.sub(r'full framework.*','', fingerprint)
    fingerprint = fingerprint.strip()
    entries.append((rel, body, hashlib.md5(fingerprint.encode()).hexdigest()))
seen = {}
failures = []
for rel, body, h in entries:
    if h in seen:
        failures.append(f'{rel}: duplicate short answer fingerprint matches {seen[h]}')
    else:
        seen[h] = rel
if failures:
    print('FAIL')
    for f in failures[:200]: print(f)
    sys.exit(1)
print('OK')
''', encoding='utf-8')
os.chmod(validator_uni, 0o755)

summary = ROOT / 'FINAL_NORMALIZATION_SUMMARY.txt'
summary.write_text('\n'.join([
    'FINAL FAST NORMALIZATION PASS COMPLETE',
    '',
    f'Short Answer rewrites: {rewritten_short_answers}',
    f'Total change events logged: {len(changes)}',
    '',
    'Focus areas:',
    '- generator parity',
    '- phrase normalization',
    '- bulk Short Answer upgrades',
    '- hard-fail anti-regression validators',
    '',
    'First 500 change events:',
    *changes[:500],
]), encoding='utf-8')
print(json.dumps({'short_answer_rewrites': rewritten_short_answers, 'change_events': len(changes)}, indent=2))
