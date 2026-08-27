#!/usr/bin/env node
// Validation page-result cache CLI: inspect | prune | clear
//
// Cache shape (written by scripts/validation/cache/page_cache.py):
//   .validation-cache/v1/page-index.json   committed index, one entry per key
//   .validation-cache/v1/page-index.jsonl  append-only journal of recent stores
//   .validation-cache/v1/objects/<fp[:2]>/<fp>.json
//
// The index holds only the CURRENT fingerprint for each (validator, page) pair,
// so every content change strands the object it replaces. Nothing ever collected
// those, and the store reached 97,003 objects / 381 MB against 8,481 live
// results - roughly 91% garbage, and 97k inodes each burning a 4 KB block.
//
// `prune` is the mark-and-sweep that was missing: the index is the root set and
// anything unreachable from it is deleted. page_cache.store() also drops the
// object it displaces, so steady state stays at about one object per live
// result; prune remains the sweep for deleted pages, retired validators, and
// interrupted writes.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cacheRoot = path.join(root, '.validation-cache');
const cache = path.join(cacheRoot, 'v1');
const objectsDir = path.join(cache, 'objects');
const indexPath = path.join(cache, 'page-index.json');
const journalPath = path.join(cache, 'page-index.jsonl');
const EPOCH = 'page-audit-v1';

const cmd = process.argv[2] || 'inspect';
const dryRun = process.argv.includes('--dry-run');

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return { schema_version: '1.0', epoch: EPOCH, entries: {} };
  }
}

// page_cache.store() appends to page-index.jsonl rather than rewriting the whole
// index, because concurrent shards rewriting one file lost each other's entries.
// Fold the journal over the committed index, last line per key winning, to get
// the true live set. Malformed trailing lines are skipped: a run killed
// mid-append must degrade to a cache miss, never to a truncated root set that
// would make prune delete live objects.
function loadLive() {
  const data = readIndex();
  const entries = { ...(data.entries || {}) };
  let journalLines = 0;
  let journalBad = 0;
  let buf = Buffer.alloc(0);
  try {
    buf = fs.readFileSync(journalPath);
  } catch {
    buf = Buffer.alloc(0);
  }
  const journalBytesRead = buf.length;
  for (const line of buf.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    journalLines += 1;
    try {
      const rec = JSON.parse(line);
      if (rec && rec.k && rec.f) entries[rec.k] = { fingerprint: rec.f, status: rec.s || 'PASS' };
      else journalBad += 1;
    } catch {
      journalBad += 1;
    }
  }
  return { epoch: data.epoch || EPOCH, entries, journalLines, journalBad, journalBytesRead };
}

// Every file in the object store.
function* walkObjects() {
  let shards;
  try {
    shards = fs.readdirSync(objectsDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const shard of shards) {
    if (!shard.isDirectory()) continue;
    const shardDir = path.join(objectsDir, shard.name);
    let files;
    try {
      files = fs.readdirSync(shardDir);
    } catch {
      continue;
    }
    for (const name of files) yield { name, abs: path.join(shardDir, name) };
  }
}

function writeReceipt(file, payload) {
  fs.mkdirSync('artifacts/validation', { recursive: true });
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
}

if (cmd === 'clear') {
  fs.rmSync(cacheRoot, { recursive: true, force: true });
  console.log('[validation:cache:clear] PASS');
  process.exit(0);
}

if (cmd === 'prune') {
  const data = loadLive();
  const entries = data.entries;

  // A rotated epoch invalidates the whole store: no object under the old epoch
  // can ever be reused, so treat the root set as empty rather than half-trusting
  // an index that no longer describes the objects on disk.
  const epochStale = data.epoch !== EPOCH;
  const live = epochStale
    ? new Set()
    : new Set(Object.values(entries).map(e => e && e.fingerprint).filter(Boolean));

  let scanned = 0;
  let removed = 0;
  let removedBytes = 0;
  let tmpRemoved = 0;
  let kept = 0;

  for (const obj of walkObjects()) {
    scanned += 1;
    const isTmp = !obj.name.endsWith('.json');
    const fingerprint = obj.name.slice(0, -'.json'.length);
    // Interrupted writes leave <fp>.tmp behind; those are never readable results.
    if (isTmp || !live.has(fingerprint)) {
      let size = 0;
      try {
        size = fs.statSync(obj.abs).size;
      } catch {
        /* raced with another sweep */
      }
      try {
        if (!dryRun) fs.rmSync(obj.abs, { force: true });
        removed += 1;
        removedBytes += size;
        if (isTmp) tmpRemoved += 1;
      } catch {
        /* leave it; the next sweep retries */
      }
      continue;
    }
    kept += 1;
  }

  // Abandoned index-*.tmp files from interrupted index rewrites.
  try {
    for (const name of fs.readdirSync(cache)) {
      if (name.startsWith('index-') && name.endsWith('.tmp')) {
        if (!dryRun) fs.rmSync(path.join(cache, name), { force: true });
        tmpRemoved += 1;
      }
    }
  } catch {
    /* cache absent */
  }

  // Drop shard directories the sweep emptied, so the store does not keep 256
  // permanent stubs.
  let shardsRemoved = 0;
  try {
    for (const shard of fs.readdirSync(objectsDir)) {
      const shardDir = path.join(objectsDir, shard);
      try {
        if (fs.statSync(shardDir).isDirectory() && fs.readdirSync(shardDir).length === 0) {
          if (!dryRun) fs.rmdirSync(shardDir);
          shardsRemoved += 1;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* objects dir absent */
  }

  // Commit the compacted view and retire the journal so the next run starts from
  // a clean root set instead of replaying an ever-growing log. Written only after
  // the sweep, so an interrupted prune leaves both index and journal intact and
  // simply re-runs.
  if (!dryRun) {
    const committed = { schema_version: '1.0', epoch: EPOCH, entries: epochStale ? {} : entries };
    fs.mkdirSync(cache, { recursive: true });
    const tmp = path.join(cache, `page-index.commit-${process.pid}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify(committed, null, 2) + '\n');
    fs.renameSync(tmp, indexPath);
    // Drop only the bytes folded into the index. If a validator appended while
    // this ran, those lines survive for the next compaction instead of being
    // discarded along with the objects they describe.
    try {
      const size = fs.statSync(journalPath).size;
      if (size > data.journalBytesRead) {
        const fd = fs.openSync(journalPath, 'r');
        const tail = Buffer.alloc(size - data.journalBytesRead);
        fs.readSync(fd, tail, 0, tail.length, data.journalBytesRead);
        fs.closeSync(fd);
        fs.writeFileSync(journalPath, tail);
      } else {
        fs.rmSync(journalPath, { force: true });
      }
    } catch {
      /* no journal to retire */
    }
  }

  const out = {
    status: 'PASS',
    mode: dryRun ? 'dry-run' : 'apply',
    epoch: data.epoch || null,
    epoch_stale: epochStale,
    journal_lines_compacted: data.journalLines,
    journal_lines_malformed: data.journalBad,
    live_entries: Object.keys(entries).length,
    live_fingerprints: live.size,
    objects_scanned: scanned,
    objects_kept: kept,
    objects_removed: removed,
    temp_files_removed: tmpRemoved,
    empty_shards_removed: shardsRemoved,
    bytes_reclaimed: removedBytes,
  };
  writeReceipt('artifacts/validation/cache-prune.json', out);
  console.log(
    `[validation:cache:prune] PASS: scanned=${scanned}; kept=${kept}; removed=${removed}; ` +
      `reclaimed=${(removedBytes / 1048576).toFixed(1)}MB`
  );
  process.exit(0);
}

// inspect
const data = loadLive();
const entries = Object.values(data.entries);

// This used to report readdirSync(objects).length - the number of 2-char shard
// directories, which saturates at 256 and reads as "256 objects" however large
// the store grows. That blind spot is why 97,003 files accumulated unnoticed.
// Count the actual object files, and surface the orphan ratio.
const live = new Set(entries.map(e => e && e.fingerprint).filter(Boolean));
let objectCount = 0;
let objectBytes = 0;
let orphans = 0;
for (const obj of walkObjects()) {
  objectCount += 1;
  try {
    objectBytes += fs.statSync(obj.abs).size;
  } catch {
    /* raced; ignore */
  }
  if (!obj.name.endsWith('.json') || !live.has(obj.name.slice(0, -'.json'.length))) orphans += 1;
}

const out = {
  status: 'PASS',
  epoch: data.epoch || null,
  entries: entries.length,
  objects: objectCount,
  object_bytes: objectBytes,
  orphan_objects: orphans,
  journal_lines_pending: data.journalLines,
  cache_present: fs.existsSync(cache),
};
writeReceipt('artifacts/validation/cache-summary.json', out);
console.log(
  `[validation:cache:inspect] PASS: entries=${out.entries}; present=${out.cache_present}; ` +
    `objects=${objectCount}; orphans=${orphans}; size=${(objectBytes / 1048576).toFixed(1)}MB`
);
