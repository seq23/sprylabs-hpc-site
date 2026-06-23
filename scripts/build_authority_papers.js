#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const { promote } = require('./authority/cluster_to_authority');
const { generate } = require('./authority/generate_whitepaper');

const ROOT = process.cwd();
const WHITEPAPERS_DIR = path.join(ROOT, 'whitepapers');

function paperPath(item){
  return path.join(WHITEPAPERS_DIR, `${item.slug}.html`);
}

function hasRenderedPaper(item){
  if (!item || !item.slug) return false;
  const file = paperPath(item);
  if (!fs.existsSync(file)) return false;
  const html = fs.readFileSync(file, 'utf8');
  return html.includes('direct-answer') && html.includes('cta-block') && html.includes(item.cta_target || '');
}

function isEligible(item){
  if (!item || item.suppressed === true) return false;
  if (Number(item.authority_score || 0) >= 70) return true;
  if (Number(item.signal_count || 0) >= 25) return true;
  if (item.authority_ready === true) return true;
  return false;
}

function shouldRender(item){
  if (!item || !item.slug || !item.cluster_id) return false;

  // Released authority papers are part of the public contract. If the queue says
  // released but the rendered HTML was lost, omitted from a ZIP, or lacks the
  // required blocks, rebuild it instead of letting validation fail later.
  if (item.status === 'released') return !hasRenderedPaper(item);

  if (item.status === 'queued') return isEligible(item);

  return false;
}

function main(){
  const { queue, created } = promote();
  let rendered = 0;
  let skipped = 0;
  let repaired = 0;

  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    if (!shouldRender(item)) {
      skipped += 1;
      return item;
    }

    const wasReleased = item.status === 'released';
    const result = generate(item);
    rendered += 1;
    if (wasReleased) repaired += 1;
    return result.item;
  });

  queue.generated_at = new Date().toISOString();
  queue.policy = {
    ...(queue.policy || {}),
    trigger_based_authority: true,
    release_model: 'signal_threshold',
    min_authority_score: 70,
    min_signal_count: 25,
    calendar_release_is_fallback_only: true
  };

  fs.writeFileSync('data/authority_paper_queue.json', JSON.stringify(queue, null, 2) + '\n');
  console.log(`authority: promoted ${created.length}; rendered ${rendered}; repaired ${repaired}; skipped ${skipped}`);
}

if (require.main === module) main();
