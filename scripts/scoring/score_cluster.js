#!/usr/bin/env node
const input = JSON.parse(process.argv[2] || '{}');
const volume = Number(input.volume_score ?? 0.5); const intent = Number(input.intent_score ?? 0.7); const monet = Number(input.monetization_score ?? 0.7); const competition = Number(input.competition_score ?? 0.65); const gap = Number(input.coverage_gap_score ?? 0.5);
const score = Number(((volume*0.25)+(intent*0.25)+(monet*0.20)+(competition*0.15)+(gap*0.15)).toFixed(3));
console.log(JSON.stringify({score, approved: score >= Number(process.env.STRICT_BACKLOG_MIN_SCORE || '0.55')}, null, 2));
