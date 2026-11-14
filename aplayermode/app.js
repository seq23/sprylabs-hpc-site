/*
 * Upgrades the static "Available soon" buttons to real links for every route
 * whose URL is set in config.js, renders the desktop QR code once a route is
 * live, and adds the Terms / Privacy footer links only when they have a URL.
 * With every URL empty (today) this script changes nothing on the page.
 */
(function () {
  'use strict';
  var links = window.APM_LINKS || {};
  function lookup(path) {
    return path.split('.').reduce(function (o, k) { return o && o[k]; }, links);
  }
  function isLive(url) { return typeof url === 'string' && /^https:\/\/[^\s]+$/.test(url); }

  document.querySelectorAll('[data-link]').forEach(function (el) {
    var url = lookup(el.getAttribute('data-link'));
    if (!isLive(url)) return;
    var a = document.createElement('a');
    a.className = el.className.replace(/\bis-soon\b/, '').trim();
    a.href = url;
    a.rel = 'noopener';
    var live = el.querySelector('[data-live-label]');
    var soon = el.querySelector('[data-soon-label]');
    if (soon) soon.remove();
    if (live) live.hidden = false;
    while (el.firstChild) a.appendChild(el.firstChild);
    el.replaceWith(a);
  });

  // Desktop QR code: points a phone at this page's #get-the-app section, where
  // the phone picks its own route. Shown only when at least one route is live.
  var qr = document.querySelector('[data-qr]');
  var anyLive = ['beta.webApp', 'beta.androidApk', 'beta.iosTestFlight', 'stores.appStore', 'stores.googlePlay']
    .some(function (p) { return isLive(lookup(p)); });
  if (qr && anyLive && typeof window.qrcode === 'function') {
    var target = location.origin + location.pathname + '#get-the-app';
    var code = window.qrcode(0, 'M');
    code.addData(target);
    code.make();
    qr.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code: open A Player Mode on your phone' });
    qr.classList.add('is-live');
    var note = document.querySelector('[data-qr-note]');
    if (note) note.textContent = 'Scan with your phone camera to open the download options.';
  }

  // Testimonials: real quotes from ONE file (APM_LINKS.testimonials). The section stays hidden
  // while the file is empty, unreachable or malformed; text only (never HTML from the file).
  var tSection = document.querySelector('[data-testimonials]');
  var tList = document.querySelector('[data-testimonial-list]');
  if (tSection && tList && isLive(links.testimonials) && typeof fetch === 'function') {
    fetch(links.testimonials, { mode: 'cors', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var items = (data && Array.isArray(data.testimonials) ? data.testimonials : []).filter(function (t) {
          return t && typeof t.quote === 'string' && t.quote.trim() && t.quote.length <= 400 &&
            typeof t.name === 'string' && t.name.trim() && typeof t.consent === 'string' && t.consent.trim();
        });
        if (!items.length) return;
        items.forEach(function (t) {
          var fig = document.createElement('figure'); fig.className = 'card testimonial';
          var q = document.createElement('blockquote'); q.textContent = '“' + t.quote.trim() + '”';
          var who = document.createElement('figcaption'); who.className = 'small muted';
          who.textContent = t.name.trim() + (typeof t.context === 'string' && t.context.trim() ? ' · ' + t.context.trim() : '');
          fig.appendChild(q); fig.appendChild(who); tList.appendChild(fig);
        });
        tSection.hidden = false;
      })
      .catch(function () { /* stays hidden */ });
  }

  // Founding 100 sell-out: the live count (APM_LINKS.founding). While places remain the card says
  // how many; once the server says open:false every join button and the offer card switch to the
  // standard Executive Roundtable offer. Unreadable count: the page stays as it is (/join checks
  // again before any checkout opens, so no founding price is ever sold past 100).
  if (isLive(links.founding) && typeof fetch === 'function') {
    fetch(links.founding, { mode: 'cors', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data.open !== 'boolean' || typeof data.remaining !== 'number') return;
        if (data.open && data.remaining > 0) {
          // Every count on the page (the hero line and the offer card): the true live number only.
          document.querySelectorAll('[data-founding-left]').forEach(function (left) {
            left.textContent = data.remaining + ' of ' + (data.total || 100) + ' spots left' + (left.parentElement && left.parentElement.classList.contains('hero-count') ? ' · ' : '');
            left.hidden = false;
          });
          return;
        }
        document.querySelectorAll('[data-join-founding]').forEach(function (el) { el.hidden = true; });
        document.querySelectorAll('[data-join-standard]').forEach(function (el) { el.hidden = false; });
        document.querySelectorAll('[data-founding-open]').forEach(function (el) { el.hidden = true; });
        document.querySelectorAll('[data-founding-full]').forEach(function (el) { el.hidden = false; });
        var badge = document.querySelector('#founding-100 .badge');
        if (badge) badge.textContent = 'Founding 100 · Full';
      })
      .catch(function () { /* unchanged */ });
  }

  // "Get launch updates": shown when the endpoint is configured. It used to probe the endpoint
  // with an empty POST and show the form on its 400, which put a console error on every home
  // visit; a sign-up that fails still says so in the form ("That didn't work…").
  var lSection = document.querySelector('[data-launch-updates]');
  var form = document.querySelector('[data-launch-form]');
  if (lSection && form && isLive(links.launchUpdates) && typeof fetch === 'function') {
    var post = function (body) {
      return fetch(links.launchUpdates, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    };
    lSection.hidden = false;
    var status = form.querySelector('[data-launch-status]');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = form.elements.email.value.trim();
      var consent = form.elements.consent;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = 'Enter a full email address.'; return; }
      if (!consent.checked) { status.textContent = 'Tick the box to agree to launch-update emails.'; return; }
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true; status.textContent = 'Saving…';
      post({ email: email, consent: true, consentVersion: consent.getAttribute('data-consent-version'), website: form.elements.website.value })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (res.ok) { form.reset(); status.textContent = 'You’re on the list. We’ll email you at launch.'; }
          else { status.textContent = (res.body && res.body.message) || 'That didn’t work. Try again in a minute.'; }
        })
        .catch(function () { status.textContent = 'That didn’t work. Try again in a minute.'; })
        .then(function () { button.disabled = false; });
    });
  }
})();

// Pin visit -> join (owner-approved 1 Nov 2026): a visit from a pin (utm_source=pinterest)
// carries its utm params onto every link into the app (app.aplayermode.com), so the app's
// join and checkout can credit the pin. Nothing is stored on this site.
(function () {
  try {
    var q = new URLSearchParams(window.location.search);
    if ((q.get('utm_source') || '').toLowerCase() !== 'pinterest') return;
    var keep = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
    document.querySelectorAll('a[href^="https://app.aplayermode.com"]').forEach(function (a) {
      var u = new URL(a.href);
      keep.forEach(function (k) { if (q.get(k)) u.searchParams.set(k, q.get(k)); });
      a.href = u.toString();
    });
  } catch (e) { /* attribution is best effort; the links still work */ }
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
