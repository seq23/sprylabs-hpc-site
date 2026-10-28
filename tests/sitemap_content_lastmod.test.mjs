import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Exercise the real deriver against dated git commits, not a mock of its decision.
const source = path.resolve('scripts');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitemap-content-date-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  for (const file of ['sitemap_content_lastmod.mjs', 'lib/sitemap_ledger.mjs']) {
    fs.copyFileSync(path.join(source, file), path.join(root, 'scripts', file));
  }
  const git = (args, date = '2026-10-01') => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', env: { ...process.env,
      GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
      GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z`,
    },
  });
  git(['init', '-q']);
  const write = (s) => fs.writeFileSync(path.join(root, 'index.html'), s);
  const original = '<html><body><p>Original useful answer.</p></body></html>';
  write(original);
  fs.writeFileSync(path.join(root, 'sitemap.xml'), '<urlset><url><loc>https://example.test/</loc></url></urlset>');
  git(['add', '.']); git(['commit', '-qm', 'Publish the answer']);
  const derive = (today, check = false) => execFileSync(process.execPath, [
    'scripts/sitemap_content_lastmod.mjs', ...(check ? ['--check'] : []),
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, SITEMAP_LASTMOD_TODAY: today } });
  const record = () => JSON.parse(fs.readFileSync(path.join(root, 'data/sitemap/lastmod_ledger.json'))).urls[0];
  derive('2026-10-02');
  return { root, git, write, original, derive, record };
}

test('a temporary build change restored to HEAD cannot retain a build date', (t) => {
  const f = fixture(t);
  f.write('<html><body><p>Temporary intermediate build output.</p></body></html>');
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-28', 'pending content gets its release date');
  f.write(f.original);
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-01', 'restoring HEAD restores the proven content date');
  assert.equal(f.record().evidence, 'git_last_visible_content_change');
  const before = fs.readFileSync(path.join(f.root, 'data/sitemap/lastmod_ledger.json'), 'utf8');
  f.derive('2026-10-29');
  assert.equal(fs.readFileSync(path.join(f.root, 'data/sitemap/lastmod_ledger.json'), 'utf8'), before);
});

test('an already poisoned unchanged ledger is corrected from history and check mode rejects it', (t) => {
  const f = fixture(t);
  const file = path.join(f.root, 'data/sitemap/lastmod_ledger.json');
  const ledger = JSON.parse(fs.readFileSync(file));
  ledger.urls[0].lastmod = '2026-10-28';
  ledger.urls[0].evidence = 'content_hash_changed';
  fs.writeFileSync(file, JSON.stringify(ledger));
  fs.writeFileSync(path.join(f.root, 'sitemap.xml'), '<urlset><url><loc>https://example.test/</loc><lastmod>2026-10-28</lastmod></url></urlset>');
  assert.throws(() => f.derive('2026-10-28', true));
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-01');
});

test('real committed edits and reverts keep their dates; reserialization does not move them', (t) => {
  const f = fixture(t);
  f.write('<html><body><p>Revised useful answer.</p></body></html>');
  f.git(['add', 'index.html']); f.git(['commit', '-qm', 'Revise answer'], '2026-10-10');
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-10');
  f.write(f.original);
  f.git(['add', 'index.html']); f.git(['commit', '-qm', 'Restore answer'], '2026-10-15');
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-15');
  f.write('<html>\n<body>  <p>Original useful answer.</p>\n</body></html>');
  f.git(['add', 'index.html']); f.git(['commit', '-qm', 'Reserialize'], '2026-10-20');
  f.derive('2026-10-28');
  assert.equal(f.record().lastmod, '2026-10-15');
});
