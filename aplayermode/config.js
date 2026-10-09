/*
 * A Player Mode landing page: every outbound link the page can show, in ONE place.
 *
 * Launch is a one-line change per route: paste the URL between the quotes.
 * An empty string means "not live yet": the page renders that route as a
 * disabled "Available soon" / "Coming soon" button with no href, so it can
 * never link to a broken URL. scripts/validators/validate_aplayermode_landing.mjs
 * evaluates this file and fails on any value that is not '' or an https:// URL.
 *
 * terms / privacy: the footer shows each link only when its URL is set.
 */
window.APM_LINKS = Object.freeze({
  beta: Object.freeze({
    // Live routes that need no store approval (card payments via Stripe).
    webApp: 'https://app.aplayermode.com', // Web app: open in the browser, then Add to Home Screen.
    androidApk: 'https://github.com/seq23/aplayer-mode/releases/download/android-beta-2026-10-07/aplayermode.apk', // Android direct download (APK).
    iosTestFlight: '', // iPhone TestFlight public link.
  }),
  stores: Object.freeze({
    appStore: '',      // Apple App Store listing (awaiting store approval).
    googlePlay: '',    // Google Play listing (awaiting store approval).
  }),
  legal: Object.freeze({
    terms: 'https://app.aplayermode.com/terms',     // Terms of Service (static page in seq23/aplayer-mode apps/mobile/public/terms).
    privacy: 'https://app.aplayermode.com/privacy', // Privacy Policy (static page in seq23/aplayer-mode apps/mobile/public/privacy).
  }),
  // "Join the Founding 100": straight to the Founding 100 card checkout, before the setup
  // questions (seq23/aplayer-mode apps/mobile/app/join.tsx, docs/33 §10).
  join: 'https://app.aplayermode.com/join',
  // Real testimonials, ONE file in seq23/aplayer-mode (apps/mobile/public/testimonials.json).
  // The section stays hidden while the file has none.
  testimonials: 'https://app.aplayermode.com/testimonials.json',
  // "Get launch updates" sign-ups (seq23/aplayer-mode POST /v1/launch-updates, migration 0095).
  // The form stays hidden until this endpoint answers the page.
  launchUpdates: 'https://api.aplayermode.com/v1/launch-updates',
  // The Billionaire High Performance Coach digital product (Gumroad checkout),
  // the same listing download.html links to.
  gumroad: 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach',
});
