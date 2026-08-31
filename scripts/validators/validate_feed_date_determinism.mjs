#!/usr/bin/env node
// feed.xml was the one published file that differed between two builds of the
// SAME commit. Measured on a pristine aa67577ea checkout with three consecutive
// build:all runs: builds 2 and 3 differed in exactly one file, and the only
// difference inside it was the clock:
//
//   -<lastBuildDate>Mon, 31 Aug 2026 06:48:18 GMT</lastBuildDate>
//   +<lastBuildDate>Mon, 31 Aug 2026 07:06:18 GMT</lastBuildDate>
//
// No guard could see it. validate:clean-rebuild-parity owns build idempotency
// but compares only .html plus sitemap*.xml, llms.txt, _redirects and
// data/citation/ - feed.xml is in none of those. So this validator asserts the
// invariant the fix establishes: every date the feed publishes is DERIVED FROM
// ITS OWN CONTENT, never read from the clock.
//
// The channel's lastBuildDate must equal the newest item pubDate. A clock read
// reintroduced anywhere in that path moves lastBuildDate off the newest item
// within a day, and fails here.
//
// Rule 0: hard-fails when the feed is missing, has no items, or has no parseable
// dates - a feed it cannot read is not a feed it has checked.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FEED = 'feed.xml';
const errors = [];
const abs = path.join(ROOT, FEED);

if (!fs.existsSync(abs)) {
  console.error(`[validate:feed-date-determinism] FAIL: ${FEED} does not exist; build:all is expected to emit it, and a validator that reads no feed proves nothing.`);
  process.exit(1);
}
const xml = fs.readFileSync(abs, 'utf8');

const pubDates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1].trim());
const buildDates = [...xml.matchAll(/<lastBuildDate>([^<]+)<\/lastBuildDate>/g)].map((m) => m[1].trim());
const itemCount = (xml.match(/<item>/g) || []).length;

if (itemCount === 0) errors.push(`${FEED} carries 0 <item> elements; expected the published insight feed.`);
if (pubDates.length === 0) errors.push(`${FEED} carries 0 <pubDate> values, so there is nothing to derive lastBuildDate from and nothing to check.`);
if (buildDates.length !== 1) errors.push(`${FEED} carries ${buildDates.length} <lastBuildDate> elements; expected exactly 1.`);

const parse = (value) => {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
};
const parsedPub = pubDates.map(parse).filter((t) => t !== null);
if (parsedPub.length !== pubDates.length) {
  errors.push(`${FEED}: ${pubDates.length - parsedPub.length} <pubDate> value(s) are not parseable dates.`);
}

if (!errors.length) {
  const newest = Math.max(...parsedPub);
  const built = parse(buildDates[0]);
  if (built === null) {
    errors.push(`${FEED}: <lastBuildDate> ${JSON.stringify(buildDates[0])} is not a parseable date.`);
  } else if (built !== newest) {
    errors.push(
      `${FEED}: <lastBuildDate> is ${new Date(built).toUTCString()} but the newest <pubDate> is ${new Date(newest).toUTCString()}. `
      + 'The channel date must be DERIVED from the newest item, not read from the clock - a clock read makes feed.xml differ between two '
      + 'builds of the same commit, and clean-rebuild-parity does not compare feed.xml, so nothing else would catch it. '
      + 'See scripts/build_insights.js.'
    );
  }
}

const summary = {
  test_id: 'validate-feed-date-determinism',
  generated_at: new Date().toISOString(),
  status: errors.length ? 'FAIL' : 'PASS',
  items: itemCount,
  pub_dates: pubDates.length,
  errors,
};
const runId = process.env.PROOF_RUN_ID || 'container-current';
const outDir = path.join(ROOT, 'artifacts', 'diagnostics', runId, 'validate-feed-date-determinism');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

if (errors.length) {
  console.error(`[validate:feed-date-determinism] FAIL: ${errors.length} problem(s)`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`[validate:feed-date-determinism] PASS: ${FEED} lastBuildDate is derived from its newest of ${pubDates.length} item date(s) across ${itemCount} item(s); no clock read in the published feed.`);
