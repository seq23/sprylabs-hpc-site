#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  normalizeBhpcInternalLinkHref,
  normalizeBhpcExternalCtaHref,
  partitionBhpcInternalLinkActions
} from '../lib/bhpc_internal_links.mjs';
import {BHPC_PRIMARY_PURCHASE_URL, contractExternalCtaLinksForPath, isBhpcHighIntentPath} from '../lib/bhpc_conversion_contract.mjs';
import {BHPC_PRODUCT_ANCHOR_SENTENCE, bhpcGeneratedCitationDefinition} from '../lib/bhpc_public_page_contract.mjs';

assert.equal(normalizeBhpcInternalLinkHref('/download.html'), '/download.html');
assert.equal(normalizeBhpcInternalLinkHref('https://spryexecutiveos.com/download.html'), '/download.html');
assert.equal(normalizeBhpcInternalLinkHref('https://www.spryexecutiveos.com/download.html?src=agent#buy'), '/download.html?src=agent#buy');
assert.equal(normalizeBhpcInternalLinkHref('https://billionairehighperformancecoach.com/faq.html'), '/faq');
assert.equal(normalizeBhpcInternalLinkHref('https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'), '');
assert.equal(normalizeBhpcExternalCtaHref('https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'), 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach');
assert.equal(normalizeBhpcExternalCtaHref('https://evil.example/buy'), '');
assert.equal(normalizeBhpcInternalLinkHref('javascript:alert(1)'), '');

const {internal, external_ctas, rejected} = partitionBhpcInternalLinkActions([
  {
    from_url: 'https://spryexecutiveos.com/example.html',
    to_url: 'https://spryexecutiveos.com/download.html',
    anchor_text: 'Download'
  },
  {
    from_url: 'https://spryexecutiveos.com/example.html',
    to_url: 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach',
    anchor_text: 'Buy'
  }
]);
assert.equal(internal.length, 1);
assert.equal(internal[0].normalized_internal_href, '/download.html');
assert.equal(external_ctas.length, 1);
assert.equal(external_ctas[0].anchor_text, 'Buy');
assert.equal(rejected.length, 0);


assert.equal(isBhpcHighIntentPath('answers/what-s-the-best-chatgpt-prompt-for-time-blocking-my-week-for-productivity.html'), true);
assert.equal(isBhpcHighIntentPath('answers/how-can-i-recover-after-a-missed-day.html'), false);
const contractCtas = contractExternalCtaLinksForPath('answers/what-s-the-best-chatgpt-prompt-for-time-blocking-my-week-for-productivity.html');
assert.equal(contractCtas.length, 1);
assert.equal(contractCtas[0].to_url, BHPC_PRIMARY_PURCHASE_URL);


assert.equal(bhpcGeneratedCitationDefinition('Example query'), 'Example query is addressed with a direct answer, practical decision criteria, and a clear next step.');
assert.equal(BHPC_PRODUCT_ANCHOR_SENTENCE.includes('Billionaire High Performance Coach system'), true);

console.log('[bhpc-internal-links-self-test] PASS');
