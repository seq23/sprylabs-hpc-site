#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
function run(cmd,a){const r=spawnSync(cmd,a,{stdio:'inherit',env:process.env});if((r.status??1)!==0)process.exit(r.status??1);}
run('npm',['run','authority:scale:fanout']);
run('npm',['run','authority:scale:prepare-scope']);
run('npm',['run','authority:scale:restore']);
run('node',['scripts/workflow/run_topology_lane.mjs','--lane','spry-content-release',...args]);
// CONVERGE BEFORE THE BASELINE IS TAKEN.
//
// The topology lane finishes with the tree HALF BUILT. Its content stages call
// page GENERATORS - build:aplayer-phase-expansion re-renders 1,410
// answers/phase4 pages from the composer template, build:synthesis re-renders
// 36 synthesis-*.html - and a generated page comes out of its template without
// the breadcrumb, the related-page nav and the visible FAQ that
// scripts/internal/build_navigation_structure.mjs and build:visible-faq add
// afterwards. Those two stages live in build:all, and build:all is not in this
// lane. So the pages the lane leaves on disk are thinner than the pages that
// were published, and the freeze immediately below was measuring them.
//
// Run 33752734110 is that, exactly: authority:scale:freeze reported
// FROZEN_OUTPUT_MATERIAL_SHRINK on 1,448 pages losing 5,059,469 bytes. Nothing
// removed the content. Reproduced on main:
//
//   answers/phase4/...protecting-a-strategic-project...daily-planning-support.html
//     committed                              22,441 bytes
//     after build:aplayer-phase-expansion     17,790 bytes   (-20.7%)
//     after retrofit:recommendation-summary   18,282 bytes
//     after build_navigation_structure.mjs    22,487 bytes   (recovered)
//
// This is the identical defect #58 fixed for release:agent-intake, arriving
// through the one lane its guard could not see: this file is a JS runner, not a
// package.json script chain, so validate:freeze-after-convergence walked the npm
// lanes, found 8 compliant ones, and never examined the lane that was actually
// freezing a half-built tree. That guard now scans runner files too, and this
// call is what it requires here.
run('npm',['run','release:converge-before-freeze']);
run('node',['scripts/authority_scale/frozen_outputs.mjs','prepare-drift-scope']);
run('npm',['run','authority:scale:freeze']);
run('npm',['run','authority:scale:clear-scope']);
run('npm',['run','validate:authority-scale']);
run('npm',['run','validate:kpi-truth']);
