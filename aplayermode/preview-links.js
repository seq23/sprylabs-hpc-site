/*
 * Preview only. On aplayermode.com the Worker (workers/aplayermode-com) serves /about/,
 * /founders/ and the other pages from aplayermode/. A Cloudflare Pages preview
 * (*.pages.dev) has no Worker in front, so the same root links would open the BHPC site
 * there. On a pages.dev host only, this points each A Player Mode link at its file under
 * /aplayermode/; on aplayermode.com it does nothing. The map is the Worker's CONTENT_PAGES.
 */
(function () {
  if (!/\.pages\.dev$/i.test(location.hostname)) return;
  var map = {
    '/': '/aplayermode/',
    '/about/': '/aplayermode/about',
    '/ai-chief-of-staff/': '/aplayermode/pages/ai-chief-of-staff',
    '/ai-executive-assistant/': '/aplayermode/pages/ai-executive-assistant',
    '/founders/': '/aplayermode/pages/founders',
    '/parents/': '/aplayermode/pages/parents',
    '/life-os/': '/aplayermode/pages/life-os',
    '/questions/what-does-a-chief-of-staff-do/': '/aplayermode/pages/what-does-a-chief-of-staff-do',
    '/routines/adhd-morning-routine/': '/aplayermode/pages/routines-adhd-morning-routine',
    '/routines/weekly-planning-routine/': '/aplayermode/pages/routines-weekly-planning-routine',
    '/routines/time-blocking-for-busy-days/': '/aplayermode/pages/routines-time-blocking-for-busy-days',
    '/routines/minimum-day-after-a-bad-day/': '/aplayermode/pages/routines-minimum-day-after-a-bad-day',
    '/routines/family-weekly-reset/': '/aplayermode/pages/routines-family-weekly-reset',
    '/routines/founder-daily-routine/': '/aplayermode/pages/routines-founder-daily-routine'
  };
  document.querySelectorAll('a[href^="/"]').forEach(function (a) {
    var href = a.getAttribute('href'); var hash = '';
    var k = href.indexOf('#'); if (k >= 0) { hash = href.slice(k); href = href.slice(0, k); }
    if (Object.prototype.hasOwnProperty.call(map, href)) a.setAttribute('href', map[href] + hash);
  });
})();
