#!/usr/bin/env node
/**
 * Live re-verification of every product URL the site is allowed to link to.
 *
 * WHY THIS IS A SEPARATE SCRIPT
 *
 * Three published books carry a hard-coded link to /amazon/<slug>, and those
 * pages carry a link to a paid product. A dead product link inside a book that
 * has already shipped cannot be fixed. So the URL has to be proven to resolve.
 *
 * It is proven HERE, over the network, and the proof is committed to
 * artifacts/validation/product-url-evidence.json. The page guard
 * (validate_amazon_book_landing.mjs) then reads that committed evidence rather
 * than making its own network call, because it runs as a HARD_FAIL prepush and
 * CI gate and must not turn an egress hiccup into a red build.
 *
 * WHY A 200 IS NOT ENOUGH, AND THIS SCRIPT CHECKS THE SELLER
 *
 * Measured while wiring this up: https://gumroad.com/l/monk-mode returns 200.
 * It resolves to heyjohnfischer.gumroad.com - a different seller's product. A
 * status check alone would have happily green-lit shipping a competitor's
 * checkout page inside our own book. So a URL only counts as verified when the
 * response is 200 AND the final URL sits on the seller account we control.
 *
 * Run: npm run verify:product-urls
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LABEL = '[verify:product-urls]';
const OUT = 'artifacts/validation/product-url-evidence.json';

// The seller account this business controls. A product URL that resolves
// anywhere else is somebody else's checkout, however healthy its status code.
const SELLER_HOST = 'sprylabs.gumroad.com';

// Every product URL the site is permitted to link to.
const PRODUCT_URLS = ['https://sprylabs.gumroad.com/l/billionaire-high-performance-coach'];

if (PRODUCT_URLS.length === 0) {
  console.error(`${LABEL} FAIL: no product URLs declared. A verifier with nothing to verify must not report success.`);
  process.exit(1);
}

const records = [];
let failures = 0;

for (const url of PRODUCT_URLS) {
  let rec;
  try {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'sprylabs-hpc-site product-url-verifier' } });
    const finalHost = new URL(res.url).host;
    rec = {
      url,
      http_status: res.status,
      final_url: res.url,
      final_host: finalHost,
      seller_host_ok: finalHost === SELLER_HOST,
      verified_at: new Date().toISOString(),
    };
    if (res.status !== 200) {
      failures += 1;
      console.error(`${LABEL} ${url} returned HTTP ${res.status}. A book that has already shipped links here; this must resolve.`);
    } else if (!rec.seller_host_ok) {
      failures += 1;
      console.error(`${LABEL} ${url} resolved to ${finalHost}, not ${SELLER_HOST}. A 200 on another seller's account is worse than a 404: it sends a paying reader to a competitor's checkout.`);
    }
  } catch (err) {
    failures += 1;
    rec = { url, http_status: null, final_url: null, final_host: null, seller_host_ok: false, error: String(err && err.message ? err.message : err), verified_at: new Date().toISOString() };
    console.error(`${LABEL} ${url} could not be fetched: ${rec.error}`);
  }
  records.push(rec);
}

if (failures) {
  console.error(`${LABEL} FAIL: ${failures} of ${records.length} product URL(s) did not verify. Evidence not written; the previous evidence file is left untouched so a failed run cannot launder itself into a pass.`);
  process.exit(1);
}

const evidence = {
  schema_version: '1.0',
  verifier: 'product-urls',
  seller_host: SELLER_HOST,
  urls_verified: records.length,
  records,
};
fs.mkdirSync(path.join(ROOT, path.dirname(OUT)), { recursive: true });
fs.writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`${LABEL} PASS: verified ${records.length} product URL(s) live — ${records.map((r) => `${r.url} -> ${r.http_status} @ ${r.final_host}`).join('; ')}. Evidence written to ${OUT}.`);
