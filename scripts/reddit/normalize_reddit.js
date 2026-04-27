
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, 'data/reddit/raw');
const OUT_DIR = path.join(ROOT, 'data/reddit/normalized');

function latestFile(dir) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No files in ${dir}`);
  return files[files.length - 1];
}

function cleanText(text) {
  return String(text || '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
}

function classifyIntent(text) {
  const value = text.toLowerCase();
  if (/\b(vs|versus|compare|better than)\b/.test(value)) return 'comparison';
  if (/\bhow\b/.test(value)) return 'workflow_request';
  if (/\bwhy\b/.test(value)) return 'pain_pattern';
  if (/\bwhat\b/.test(value)) return 'definition_request';
  return /\?/.test(value) ? 'question' : 'pain_pattern';
}

function sentimentSignal(text) {
  const value = text.toLowerCase();
  if (/overwhelm|burnout|stuck|spiral|fail|restart|missed/.test(value)) return 'high';
  if (/need|want|trying|help/.test(value)) return 'medium';
  return 'low';
}

function commercialSignal(text) {
  const value = text.toLowerCase();
  return /coach|system|tool|product|program|app|buy|worth it/.test(value) ? 80 : 55;
}

function extractExcerpts(record) {
  const excerpts = [];
  if (record.title) excerpts.push(record.title);
  if (record.body) excerpts.push(record.body.slice(0, 220));
  for (const comment of (record.comments || []).slice(0, 3)) {
    if (comment.body) excerpts.push(comment.body.slice(0, 180));
  }
  return excerpts;
}

function canonicalQuestion(record) {
  const base = cleanText(`${record.title || ''} ${record.body || ''}`);
  return base.slice(0, 220);
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = latestFile(IN_DIR);
  const input = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'));
  const items = (input.records || [])
    .filter((record) => record && !record.error && (record.title || record.body))
    .map((record, index) => {
      const combined = cleanText(`${record.title || ''} ${record.body || ''} ${(record.comments || []).map((item) => item.body || '').join(' ')}`);
      const normalizedQuestion = canonicalQuestion(record);
      return {
        id: `${file.replace(/\.json$/, '')}-${index + 1}`,
        source: 'reddit',
        subreddit: record.subreddit || '',
        query: record.query || '',
        permalink: record.public_permalink || record.permalink || '',
        created_at: record.created_at || '',
        title: record.title || '',
        body: cleanText(record.body || ''),
        comment_excerpt: cleanText((record.comments || []).map((item) => item.body || '').join(' ').slice(0, 220)),
        normalized_question: normalizedQuestion,
        alternate_phrasings: Array.from(new Set([record.title || '', cleanText(record.body || '').slice(0, 140)].filter(Boolean))),
        excerpts: extractExcerpts(record),
        intent: classifyIntent(`${record.title || ''} ${record.body || ''}`),
        emotional_signal: sentimentSignal(combined),
        commercial_signal: commercialSignal(combined),
        extractability_score: /daily|weekly|accountability|planning|decision|coach/.test(combined.toLowerCase()) ? 88 : 68,
        topic_guess: combined.toLowerCase(),
        score: Number(record.raw_score || 0),
        comments_count: Number(record.num_comments || 0)
      };
    });
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify({ generated_at: new Date().toISOString(), items }, null, 2));
  console.log(`normalize_reddit: wrote ${items.length} items`);
}

main();
