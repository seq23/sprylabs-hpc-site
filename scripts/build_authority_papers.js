#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';
const { promote } = require('./authority/cluster_to_authority');
const { generate } = require('./authority/generate_whitepaper');
function main(){
  const { queue, created } = promote();
  let rendered = 0;
  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    const result = generate(item);
    rendered += 1;
    return result.item;
  });
  const fs = require('fs');
  fs.writeFileSync('data/authority_paper_queue.json', JSON.stringify(queue, null, 2) + '\n');
  console.log(`authority: promoted ${created.length}; rendered ${rendered} authority papers`);
}
if (require.main === module) main();
