#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {applyBhpcInternalLinkMutations,compileBhpcInternalLinkMutations,hasBhpcInternalLinkMutation} from '../lib/bhpc_link_mutations.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'bhpc-links-'));
try{
  for(const rel of ['source/index.html','other/index.html']){const abs=path.join(root,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,'<!doctype html><body><main>Page</main></body>\n')}
  const entries=[{id:'a',record_id:'r1',required_internal_links:[
    {from_url:'https://spryexecutiveos.com/source/',to_url:'https://spryexecutiveos.com/target/',anchor_text:'First exact anchor'},
    {from_url:'https://spryexecutiveos.com/source/',to_url:'https://spryexecutiveos.com/target/',anchor_text:'Second exact anchor'},
    {from_url:'https://spryexecutiveos.com/other/',to_url:'https://billionairehighperformancecoach.com/target/',anchor_text:'Cross domain anchor'}
  ]}];
  const compiled=compileBhpcInternalLinkMutations(entries);assert.equal(compiled.mutations.length,3);assert.equal(compiled.rejected.length,0);assert.equal(compiled.mutations[0].href,'/target/');assert.equal(compiled.mutations[2].href,'https://billionairehighperformancecoach.com/target/');
  const first=applyBhpcInternalLinkMutations({root,entries,runDate:'2026-08-22'});assert.equal(first.status,'PASS');assert.equal(first.applied_count,3);
  const source=fs.readFileSync(path.join(root,'source/index.html'),'utf8');assert(compiled.mutations.slice(0,2).every(m=>hasBhpcInternalLinkMutation(source,m)));
  const second=applyBhpcInternalLinkMutations({root,entries,runDate:'2026-08-22'});assert.equal(second.status,'PASS');assert.equal(second.applied_count,0);assert.equal(second.touched_paths.length,0);
  console.log('[bhpc-link-mutations-self-test] PASS: multi-anchor, source placement, cross-domain href, and idempotency');
}finally{fs.rmSync(root,{recursive:true,force:true})}
