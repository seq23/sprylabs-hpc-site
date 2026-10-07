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
    // Private beta routes that need no store approval.
    webApp: '',        // Web app: open in the browser, then Add to Home Screen.
    androidApk: '',    // Android direct download (APK).
    iosTestFlight: '', // iPhone TestFlight public link.
  }),
  stores: Object.freeze({
    appStore: '',      // Apple App Store listing (awaiting store approval).
    googlePlay: '',    // Google Play listing (awaiting store approval).
  }),
  legal: Object.freeze({
    terms: '',         // Terms of Use page.
    privacy: '',       // Privacy Policy page.
  }),
  // The Billionaire High Performance Coach digital product (Gumroad checkout),
  // the same listing download.html links to.
  gumroad: 'https://sprylabs.gumroad.com/l/billionaire-high-performance-coach',
});
