#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const { promote } = require('./authority/cluster_to_authority');
const { generate } = require('./authority/generate_whitepaper');

function isEligible(item){
  if (!item || item.status !== 'queued') return false;
  if (item.suppressed === true) return false;
  if (Number(item.authority_score || 0) >= 70) return true;
  if (Number(item.signal_count || 0) >= 25) return true;
  if (item.authority_ready === true) return true;
  return false;
}

function main(){
  const { queue, created } = promote();
  let rendered = 0;
  let skipped = 0;

  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    if (!isEligible(item)) {
      skipped += 1;
      return item;
    }

    const result = generate(item);
    rendered += 1;
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
  console.log(`authority: promoted ${created.length}; rendered ${rendered}; skipped ${skipped}`);
}

if (require.main === module) main();
