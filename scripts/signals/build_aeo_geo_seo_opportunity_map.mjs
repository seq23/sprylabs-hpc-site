#!/usr/bin/env node
import {readJson, writeJson} from '../citation_intelligence/pipeline_lib.mjs';
const candidates = readJson('data/signals/release_candidates/latest_release_candidates.json').candidates || [];
const map = candidates.map(c=>({candidate_id:c.candidate_id, route_owner:c.route_owner, action:c.action, aeo:c.expected_aeo_geo_seo_role.aeo, geo:c.expected_aeo_geo_seo_role.geo, seo:c.expected_aeo_geo_seo_role.seo, traffic_intent:c.traffic_intent, risk_level:c.risk_level}));
const sourceFile='data/signals/release_candidates/latest_release_candidates.json';
const evidenceClass=candidates.some(c=>String(c.candidate_id||'').includes('_fixture_'))?'PIPELINE_SMOKE_OR_FIXTURE':'CURRENT_RELEASE_CANDIDATE_MAP';
const envelope={schema_version:'1.5', repo:'seq23/sprylabs-hpc-site', status:map.length?'PASS':'FAIL', evidence_class:evidenceClass, scope:'current release-candidate role mapping only', production_audit:false, source_file:sourceFile, opportunity_count:map.length, truth_boundary:'This artifact maps the current release-candidate set into AEO/GEO/SEO roles. It is not evidence of a comprehensive production authority audit, rankings, indexation, traffic, backlinks, AI Overview visibility, or LLM citations.', opportunities:map};
writeJson('artifacts/validation/aeo-geo-seo-opportunity-map.json', envelope);
writeJson('reports/aeo-geo-seo-opportunity-map.json', envelope);
console.log(`[signals:opportunity-map] ${map.length?'PASS':'FAIL'} opportunities=${map.length}`);
if (!map.length) process.exit(1);
