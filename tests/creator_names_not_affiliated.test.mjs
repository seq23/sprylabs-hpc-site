// R-PRF-02 / Lanham Act s.43(a) / right of publicity (A Player Mode legal check, 13 Nov 2026).
// A page whose H1 names a real creator may use the name only to identify the topic: it must say
// plainly that we are not affiliated with that person, and must not present the person's name as
// one of our frameworks ("is a named ... framework", "one of the frameworks inside" BHPC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../', import.meta.url);
const PEOPLE = ['Ali Abdaal', 'Tiago Forte', 'Andrew Huberman', 'Cal Newport', 'Tony Robbins', 'James Clear', 'Tim Ferriss', 'Alex Hormozi', 'Mel Robbins'];
const files = execFileSync('git', ['ls-files', '*.html', ':!:data/**', ':!:aplayermode/**', ':!:fixtures/**'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);

test('pages titled after a real creator say "not affiliated" and never brand the name as our framework', () => {
  let checked = 0;
  for (const f of files) {
    const html = readFileSync(new URL(f, ROOT), 'utf8');
    const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').replace(/<[^>]+>/g, '');
    const person = PEOPLE.find((p) => h1.toLowerCase().includes(p.toLowerCase()));
    if (!person) continue;
    if (/http-equiv="refresh"/i.test(html)) continue; // a redirect stub is not a page anyone reads
    checked += 1;
    assert.ok(html.includes(`not affiliated with, endorsed by, or sponsored by ${person}`), `${f}: says it is not affiliated with ${person}`);
    assert.doesNotMatch(html, /This is one of the frameworks inside the/, `${f}: the named page is not "one of the frameworks inside" BHPC`);
    const surname = person.split(' ')[1];
    assert.doesNotMatch(html, new RegExp(`${surname}[^"<]{0,160} is a named (?:operating|Billionaire)`, 'i'), `${f}: ${person}'s name is not our "named framework"`);
  }
  assert.ok(checked >= 8, `saw the creator-titled pages (${checked})`);
});
