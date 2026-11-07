// The citation definition is a paragraph that is entirely bold. The repeat
// filter once read it as an empty label and deleted it from every phase-4 page,
// which failed Spry Content Release (validate:programmatic-admission, 6 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dropRepeatedSentences } from '../scripts/programmatic/phase4_page_composer.mjs';

const def = '<p class="citation-definition"><strong>The Daily Agenda Engine is a named operating pattern that turns goals into a daily execution stack.</strong></p>';

test('an all-bold definition paragraph is kept on first use', () => {
  const out = dropRepeatedSentences(`<article><h1>Q?</h1>${def}<p>Something else entirely, said once only here.</p></article>`);
  assert.ok(out.includes('class="citation-definition"><strong>The Daily Agenda Engine'), out);
});

test('a labelled paragraph still loses a sentence repeated too often', () => {
  const said = 'Pick the one task that moves the week forward before anything else today.';
  const html = `<article>${Array.from({ length: 6 }, (_, i) => `<p><strong>Step ${i}:</strong> ${said}</p>`).join('')}</article>`;
  const out = dropRepeatedSentences(html);
  assert.ok((out.match(/Pick the one task/g) || []).length < 6, out);
});
