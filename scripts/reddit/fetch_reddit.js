
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'data/reddit/raw');
const queryConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/queries.json'), 'utf8'));
const subredditConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/reddit/subreddits.json'), 'utf8'));
const token = process.env.REDDIT_ACCESS_TOKEN || '';
const userAgent = process.env.REDDIT_USER_AGENT || 'spry-reddit-engine/2.0';
const today = new Date().toISOString().slice(0, 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFallbackRecords() {
  const fallback = path.join(OUT_DIR, `${today}.json`);
  if (fs.existsSync(fallback)) {
    return JSON.parse(fs.readFileSync(fallback, 'utf8')).records || [];
  }
  const files = fs.readdirSync(OUT_DIR).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) return [];
  return JSON.parse(fs.readFileSync(path.join(OUT_DIR, files[files.length - 1]), 'utf8')).records || [];
}

async function getJson(url) {
  const headers = { 'User-Agent': userAgent };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`fetch failed ${response.status}: ${url}`);
  return response.json();
}

async function fetchComments(permalink, limit) {
  if (!permalink) return [];
  const json = await getJson(`${permalink}.json?limit=${limit}`);
  const listing = Array.isArray(json) ? json[1] : null;
  const children = (((listing || {}).data || {}).children) || [];
  return children
    .map((child) => child && child.data ? child.data : null)
    .filter(Boolean)
    .filter((item) => item.body)
    .slice(0, limit)
    .map((item) => ({ body: item.body, score: item.score || 0, author: item.author || '' }));
}

function buildRecord(d, extras = {}) {
  return {
    source: 'reddit',
    source_id: d.name || d.id || extras.query || extras.subreddit || '',
    subreddit: extras.subreddit || d.subreddit || '',
    query: extras.query || '',
    mode: extras.mode || 'unknown',
    permalink: d.permalink ? `https://oauth.reddit.com${d.permalink}` : '',
    public_permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : (d.url || ''),
    created_at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '',
    title: d.title || '',
    body: d.selftext || '',
    raw_score: d.score || 0,
    num_comments: d.num_comments || 0,
    comments: extras.comments || []
  };
}

async function main() {
  ensureDir(OUT_DIR);
  const topCommentLimit = subredditConfig.defaults?.top_comment_limit || queryConfig.defaults?.top_comment_limit || 3;
  const postLimit = subredditConfig.defaults?.post_limit || queryConfig.defaults?.max_query_results || 10;
  const records = [];
  const seen = new Set();
  const subredditNames = (subredditConfig.subreddits || []).map((item) => typeof item === 'string' ? { name: item, modes: ['new'] } : item);
  const queries = (queryConfig.queries || []).map((item) => typeof item === 'string' ? { query: item } : item);

  if (token) {
    for (const subreddit of subredditNames) {
      for (const mode of (subreddit.modes || ['new'])) {
        const url = mode === 'search'
          ? `https://oauth.reddit.com/r/${encodeURIComponent(subreddit.name)}/search?q=AI&sort=top&t=week&limit=${postLimit}&restrict_sr=1`
          : `https://oauth.reddit.com/r/${encodeURIComponent(subreddit.name)}/new?limit=${postLimit}`;
        try {
          const json = await getJson(url);
          const children = (((json || {}).data || {}).children) || [];
          for (const child of children) {
            const data = child && child.data ? child.data : null;
            if (!data) continue;
            const key = data.permalink || `${subreddit.name}:${data.title}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const comments = await fetchComments(`https://oauth.reddit.com${data.permalink}`, topCommentLimit).catch(() => []);
            records.push(buildRecord(data, { subreddit: subreddit.name, mode: `subreddit:${mode}`, comments }));
          }
        } catch (error) {
          records.push({ source: 'reddit', subreddit: subreddit.name, mode: `subreddit:${mode}`, error: String(error), fetched_at: new Date().toISOString() });
        }
      }
    }

    for (const query of queries) {
      const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(query.query)}&sort=top&t=month&limit=${postLimit}&type=link`;
      try {
        const json = await getJson(url);
        const children = (((json || {}).data || {}).children) || [];
        for (const child of children) {
          const data = child && child.data ? child.data : null;
          if (!data) continue;
          const key = data.permalink || `${query.query}:${data.title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const comments = await fetchComments(`https://oauth.reddit.com${data.permalink}`, topCommentLimit).catch(() => []);
          records.push(buildRecord(data, { query: query.query, mode: 'query:top', comments }));
        }
      } catch (error) {
        records.push({ source: 'reddit', query: query.query, mode: 'query:top', error: String(error), fetched_at: new Date().toISOString() });
      }
    }
  }

  const finalRecords = records.filter((item) => !item.error);
  const recordsToWrite = finalRecords.length ? finalRecords : loadFallbackRecords();
  const payload = {
    generated_at: new Date().toISOString(),
    used_live_api: Boolean(token && finalRecords.length),
    records: recordsToWrite
  };
  fs.writeFileSync(path.join(OUT_DIR, `${today}.json`), JSON.stringify(payload, null, 2));
  console.log(`fetch_reddit: wrote ${recordsToWrite.length} records`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
