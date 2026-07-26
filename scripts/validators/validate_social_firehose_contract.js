#!/usr/bin/env node
const fs=require('fs'); const p='config/social_ingestion_policy.json';
const data=JSON.parse(fs.readFileSync(p,'utf8'));
const req=['max_items_per_source_per_run','max_clusters_per_run','max_pages_generated_per_run','max_pages_published_per_day','require_cluster_score_minimum','dedupe_before_publish','publish_mode'];
for (const k of req) if (!(k in data)) throw new Error(`missing social firehose policy: ${k}`);
if (data.max_items_per_source_per_run > 25 || data.max_pages_generated_per_run > 5 || data.max_pages_published_per_day > 3) throw new Error('social firehose caps exceed contract');
if (data.publish_mode !== 'queued') throw new Error('publish_mode must be queued');
console.log('SOCIAL FIREHOSE CONTRACT PASS');
