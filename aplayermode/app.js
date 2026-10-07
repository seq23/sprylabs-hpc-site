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
    [['terms', 'Terms of Use'], ['privacy', 'Privacy Policy']].forEach(function (pair) {
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
})();
