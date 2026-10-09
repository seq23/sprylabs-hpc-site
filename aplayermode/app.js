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

  var footer = document.querySelector('[data-legal-links]');
  if (footer) {
    [['terms', 'Terms of Service'], ['privacy', 'Privacy Policy']].forEach(function (pair) {
      var url = links.legal && links.legal[pair[0]];
      if (!isLive(url)) return;
      var a = document.createElement('a');
      a.href = url;
      a.textContent = pair[1];
      footer.appendChild(a);
    });
  }

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

  // "Get launch updates": shown only once the endpoint answers this page (a probe that stores
  // nothing: an empty body is refused 400 by a live endpoint, and blocked by CORS before it exists).
  var lSection = document.querySelector('[data-launch-updates]');
  var form = document.querySelector('[data-launch-form]');
  if (lSection && form && isLive(links.launchUpdates) && typeof fetch === 'function') {
    var post = function (body) {
      return fetch(links.launchUpdates, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    };
    post({}).then(function (r) { if (r.status === 400) lSection.hidden = false; }).catch(function () { /* stays hidden */ });
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
