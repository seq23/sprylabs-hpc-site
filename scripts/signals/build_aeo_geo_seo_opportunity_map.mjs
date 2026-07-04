#!/usr/bin/env node
import {readJson, writeJson} from '../citation_intelligence/pipeline_lib.mjs';
const candidates = readJson('data/signals/release_candidates/latest_release_candidates.json').candidates || [];
const map = candidates.map(c=>({candidate_id:c.candidate_id, route_owner:c.route_owner, action:c.action, aeo:c.expected_aeo_geo_seo_role.aeo, geo:c.expected_aeo_geo_seo_role.geo, seo:c.expected_aeo_geo_seo_role.seo, traffic_intent:c.traffic_intent, risk_level:c.risk_level}));
writeJson('artifacts/validation/aeo-geo-seo-opportunity-map.json', {schema_version:'1.4', repo:'seq23/sprylabs-hpc-site', status:map.length?'PASS':'FAIL', opportunities:map});
writeJson('reports/aeo-geo-seo-opportunity-map.json', {schema_version:'1.4', opportunities:map});
console.log(`[signals:opportunity-map] ${map.length?'PASS':'FAIL'} opportunities=${map.length}`);
if (!map.length) process.exit(1);
