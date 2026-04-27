#!/usr/bin/env node
'use strict';
const fs=require('fs');
const f='data/community/content_routing_log.json';
if(!fs.existsSync(f)){console.error('missing content routing log'); process.exit(1)}
const j=JSON.parse(fs.readFileSync(f,'utf8'));
const routes=j.routes||[];
const bad=routes.filter(r=>!r.destination_type||!r.audience||!r.intent||!r.canonical_target||r.cta_target!=='https://aplayermode.com/download');
if(bad.length){console.error(`content routing invalid: ${bad.length}`); process.exit(1)}
console.log(`[validate_content_routing] OK (${routes.length} routes)`);

process.exit(0);
