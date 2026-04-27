#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { renderAuthority } = require('../render/render_authority');
const { CTA_TARGET } = require('../lib/audience_frame');
const ROOT = process.cwd();
const QUEUE = path.join(ROOT, 'data/authority_paper_queue.json');
const OUT_DIR = path.join(ROOT, 'whitepapers');
function read(file, fallback){ try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, data){ fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n'); }
function sectionPlan(item){
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const audienceLabels = Object.keys(item.audiences || {}).join(', ') || item.primary_audience || 'executive';
  return [
    { heading: 'Executive answer', body: `The repeated signal around ${item.cluster_id} is not asking for more motivation. It is asking for an operating system that keeps execution stable when energy, attention, or confidence changes.` },
    { heading: 'Observed demand pattern', body: `This cluster has ${item.signal_count || evidence.length || 0} tracked signals and is routed as ${item.saturation || 'emerging'} authority demand. The audience pattern includes ${audienceLabels}.` },
    { heading: 'What the questions reveal', body: 'The questions tend to collapse into the same failure loop: people know what they want to do, but they do not have a stable execution container that survives missed days, overload, or decision fatigue.' },
    { heading: 'Why generic advice fails', body: 'Generic productivity advice assumes stable energy and clean calendars. The demand in this cluster points to people who need a system that can absorb volatility, preserve priorities, and restart without a dramatic reset.' },
    { heading: 'System implication', body: 'The authority answer is a structured daily operating layer: clear priorities, state-aware pacing, accountability, and recovery rules that prevent all-or-nothing collapse.' },
    { heading: 'Implementation layer', body: `The practical implementation layer is the Billionaire High Performance Coach / A Player Mode system. The canonical conversion target is ${CTA_TARGET}.` }
  ];
}
function generate(item){
  const fullItem = { ...item, sections: sectionPlan(item), status: 'released', released_at: new Date().toISOString() };
  fs.mkdirSync(OUT_DIR, {recursive:true});
  const file = path.join(OUT_DIR, `${fullItem.slug}.html`);
  fs.writeFileSync(file, renderAuthority(fullItem));
  return { file, item: fullItem };
}
function main(){
  const queue = read(QUEUE, { items: [] });
  let rendered = 0;
  queue.items = (queue.items || []).map(item => {
    if (!item.slug || !item.cluster_id) return item;
    const result = generate(item);
    rendered += 1;
    return result.item;
  });
  queue.generated_at = new Date().toISOString();
  write(QUEUE, queue);
  console.log(`generate_whitepaper: rendered ${rendered} authority papers`);
}
if (require.main === module) main();
module.exports = { generate, sectionPlan };
