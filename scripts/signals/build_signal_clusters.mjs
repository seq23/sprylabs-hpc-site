#!/usr/bin/env node
import {loadNormalized, buildClusters, writeJson} from '../citation_intelligence/pipeline_lib.mjs';
const records = loadNormalized();
const clusters = buildClusters(records);
writeJson('data/signals/clusters/latest_signal_clusters.json', {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', generated_at:new Date().toISOString(), clusters});
writeJson('artifacts/validation/signal-clusters.json', {schema_version:'1.4', status:clusters.length?'PASS':'FAIL', cluster_count:clusters.length, clusters});
console.log(`[signals:cluster] ${clusters.length?'PASS':'FAIL'} clusters=${clusters.length}`);
if (!clusters.length) process.exit(1);
