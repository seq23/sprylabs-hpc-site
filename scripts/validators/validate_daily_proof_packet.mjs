#!/usr/bin/env node
import fs from 'node:fs';

const p = process.env.DAILY_PROOF_PACKET_PATH || 'artifacts/validation/daily-proof-packet.json';
const errors = [];
if (!fs.existsSync(p)) {
  errors.push(`missing daily proof packet: ${p}`);
} else {
  const pkt = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (pkt.external_telemetry_present !== false) errors.push('external telemetry must not be claimed');
  if (pkt.status !== 'PASS') errors.push('proof packet status not PASS');
  const required = [
    'release_units_planned','release_units_applied','release_units_skipped','new_pages',
    'citation_surfaces_total','indexable_routes_total','sitemap_urls_total','llms_entries_total'
  ];
  for (const f of required) {
    if (typeof pkt[f] !== 'number' || pkt[f] < 0) errors.push(`missing or invalid numeric ${f}`);
  }
  if (typeof pkt.release_units_planned === 'number' &&
      typeof pkt.release_units_applied === 'number' &&
      typeof pkt.release_units_skipped === 'number' &&
      pkt.release_units_applied + pkt.release_units_skipped > pkt.release_units_planned) {
    errors.push('applied plus skipped exceeds planned units');
  }
}
// reports/** is intentionally excluded from baseline snapshots; the JSON proof
// packet is the canonical runtime artifact. Markdown is optional presentation.
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('[validate:daily-proof-packet] PASS');
