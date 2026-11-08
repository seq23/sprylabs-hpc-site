(function(){
  var host=window.location.hostname||'';
  var isProduct=/(^|\.)billionairehighperformancecoach\.com$/i.test(host);
  var isSpry=/(^|\.)spryexecutiveos\.com$/i.test(host);
  var html=document.documentElement;
  if(html){html.classList.add(isProduct?'product-domain':(isSpry?'system-domain':'preview-domain'));}
  // Brand text is intentionally source-authored in HTML.
  // Do not rewrite the brand on localhost or spryexecutiveos.com; it caused
  // "Spry Executive OS by Spry Executive OS" in preview and weakened product clarity.
})();
// Where the buyer came from (8 Nov 2026, docs/operations/link-tracking.md). Every buy link
// already names this page and button (utm_medium=site, utm_campaign=<page>-<button>). When the
// visit itself arrived tagged (a KDP book, a pin, a post, a link she shared), those inbound tags
// replace source / medium / campaign for this tab's session and the page+button move to utm_content;
// an untagged visit from another site passes that site to Gumroad as ?referrer=. Nothing
// leaves the browser except on the Gumroad link itself.
(function () {
  try {
    var K = 'bhpc_inbound', ours = /(^|\.)(billionairehighperformancecoach|spryexecutiveos|aplayermode)\.com$/i;
    var safe = function (v) { return String(v || '').toLowerCase().replace(/[^a-z0-9\-_]/g, '-').slice(0, 200); };
    var q = new URLSearchParams(window.location.search), inbound = null;
    if (q.get('utm_source') && q.get('utm_medium') !== 'site') {
      inbound = { s: safe(q.get('utm_source')), m: safe(q.get('utm_medium') || 'share'), c: safe(q.get('utm_campaign') || 'none') };
    }
    var ref = '';
    try { var r = document.referrer && new URL(document.referrer); if (r && !ours.test(r.hostname)) ref = r.origin + '/'; } catch (e) {}
    try {
      if (inbound || ref) sessionStorage.setItem(K, JSON.stringify({ i: inbound, r: ref }));
      else { var saved = JSON.parse(sessionStorage.getItem(K) || 'null'); if (saved) { inbound = saved.i; ref = saved.r; } }
    } catch (e) {}
    if (!inbound && !ref) return;
    var run = function () {
      document.querySelectorAll('a[href*="gumroad.com/l/billionaire-high-performance-coach"]').forEach(function (a) {
        var u = new URL(a.href);
        if (inbound) {
          var here = u.searchParams.get('utm_medium') === 'site' ? u.searchParams.get('utm_campaign') : '';
          u.searchParams.set('utm_source', inbound.s); u.searchParams.set('utm_medium', inbound.m); u.searchParams.set('utm_campaign', inbound.c);
          if (here) u.searchParams.set('utm_content', safe(here));
        }
        if (ref && !u.searchParams.get('referrer')) u.searchParams.set('referrer', ref);
        a.href = u.toString();
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  } catch (e) { /* attribution is best effort; the links still work */ }
})();
