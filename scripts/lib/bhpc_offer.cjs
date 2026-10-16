'use strict';
/**
 * The ONE Offer every Billionaire High Performance Coach Product JSON-LD node
 * carries. Read from config/aplayermode_plan_prices.json bhpc_digital_product,
 * the pinned copy of the live Gumroad listing (price, currency, URL), so no
 * emitter types a price by hand.
 *
 * Why (16 Oct 2026, Search Console): a bhpc page failed the Product rich result
 * test with "Either offers, review or aggregateRating should be specified".
 * 68 Product nodes carried no offers, and two emitters (render/content_contract.js,
 * render/render_authority.js) hard-coded price '29' pointing at aplayermode.com,
 * which is neither the product's price nor its checkout. Reviews and ratings are
 * never invented to satisfy the test; offers come from the real product data.
 * Guarded by scripts/validators/validate_product_offers.mjs.
 */
const fs = require('node:fs');
const path = require('node:path');

const PRICE_FILE = path.join(__dirname, '..', '..', 'config', 'aplayermode_plan_prices.json');

function bhpcOffer() {
  const pinned = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8')).bhpc_digital_product || {};
  const cents = pinned.oneTimeUsdCents;
  if (!Number.isInteger(cents) || cents <= 0 || !/^https:\/\//.test(pinned.url || '')) {
    throw new Error(`${path.relative(process.cwd(), PRICE_FILE)} bhpc_digital_product needs oneTimeUsdCents and an https url`);
  }
  return {
    '@type': 'Offer',
    price: (cents / 100).toFixed(2),
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: pinned.url,
    // The listing's real terms, as the aplayermode.com FAQ states them: no
    // refunds as standard (digital product), instant digital delivery at no
    // charge. Clears the merchant-listing warnings without inventing anything.
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'US',
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'USD' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
      },
    },
  };
}

module.exports = { bhpcOffer, PRICE_FILE };
