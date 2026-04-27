
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const IN_DIR = path.join(ROOT, 'data/reddit/normalized');
const OUT_DIR = path.join(ROOT, 'data/reddit/clusters');
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/cluster_rules.json'), 'utf8'));

function latestFile(dir) {
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No files in ${dir}`);
  return files[files.length - 1];
}

const matcherConfig = [
  { key: 'accountability_and_consistency', regex: /accountability|follow through|habit tracker|consistent|restart/i },
  { key: 'overplanning_and_reset', regex: /overplan|missed a day|restart|too many ideas|do nothing/i },
  { key: 'founder_and_workflows', regex: /founder|weekly review|chief of staff|workflow/i },
  { key: 'ai_exec_coach', regex: /executive coach|human coach|ai coach/i },
  { key: 'decision_support', regex: /decision fatigue|priorit|tradeoff|decision/i }
];

function matchCluster(item) {
  const haystack = `${item.normalized_question} ${item.topic_guess} ${(item.alternate_phrasings || []).join(' ')}`;
  for (const matcher of matcherConfig) {
    if (matcher.regex.test(haystack)) return matcher.key;
  }
  return 'decision_support';
}

function summarizeCluster(key, items) {
  const config = RULES.clusters[key] || {};
  const sampleTitles = items.slice(0, 4).map((item) => item.title);
  const uniqueSubreddits = Array.from(new Set(items.map((item) => item.subreddit).filter(Boolean)));
  const alternatePhrasings = Array.from(new Set(items.flatMap((item) => item.alternate_phrasings || []).filter(Boolean))).slice(0, 6);
  const intentCounts = items.reduce((acc, item) => {
    acc[item.intent] = (acc[item.intent] || 0) + 1;
    return acc;
  }, {});
  return {
    cluster_id: key,
    label: config.label || key,
    size: items.length,
    recommended_page_type: config.default_page_type || 'question',
    sample_titles: sampleTitles,
    alternate_phrasings: alternatePhrasings,
    intent_counts: intentCounts,
    evidence_count: items.reduce((acc, item) => acc + ((item.excerpts || []).length), 0),
    unique_subreddits: uniqueSubreddits,
    items: items.slice(0, 8)
  };
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = latestFile(IN_DIR);
  const input = JSON.parse(fs.readFileSync(path.join(IN_DIR, file), 'utf8'));
  const grouped = new Map();
  for (const item of (input.items || [])) {
    const key = matchCluster(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  const clusters = Array.from(grouped.entries()).map(([key, items]) => summarizeCluster(key, items));
  fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify({ generated_at: new Date().toISOString(), clusters }, null, 2));
  console.log(`cluster_questions: wrote ${clusters.length} clusters`);
}

main();
