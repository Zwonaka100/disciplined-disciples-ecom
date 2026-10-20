/**
 * Upcoming live session banner.
 * Fills <div id="event-banner"></div> with a link to /masterclass when a published
 * event with ticket sales open hasn't started yet. Shows nothing otherwise.
 */
(function () {
  'use strict';

  function render(host, id, data, start) {
    var when = new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(start).replace(',', '');
    host.innerHTML =
      '<a href="masterclass?e=' + encodeURIComponent(id) + '" style="display:block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;text-decoration:none;">' +
        '<div style="max-width:1100px;margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;justify-content:center;text-align:center;font-size:0.95rem;">' +
          '<span style="font-weight:800;"><i class="fas fa-video" style="margin-right:6px;"></i><span data-title></span></span>' +
          '<span style="opacity:0.85;" data-when></span>' +
          '<span style="background:#fff;color:#4338ca;font-weight:700;padding:4px 12px;border-radius:999px;font-size:0.85rem;">Get your ticket &rarr;</span>' +
        '</div>' +
      '</a>';
    host.querySelector('[data-title]').textContent = data.title || 'Live session';
    host.querySelector('[data-when]').textContent = 'Live on Teams · ' + when + ' SAST · R' + Number(data.price || 0).toLocaleString('en-ZA');
  }

  function init() {
    var host = document.getElementById('event-banner');
    if (!host || !window.firebase || !firebase.apps || !firebase.apps.length) return;
    firebase.firestore().collection('events').where('status', '==', 'published').get().then(function (snap) {
      var now = Date.now();
      var next = snap.docs.map(function (doc) {
        var data = doc.data();
        var start = data.startsAt && typeof data.startsAt.toDate === 'function' ? data.startsAt.toDate() : null;
        return { id: doc.id, data: data, start: start };
      }).filter(function (e) {
        return e.start && e.start.getTime() > now && e.data.salesOpen === true;
      }).sort(function (a, b) { return a.start - b.start; })[0];
      if (next) render(host, next.id, next.data, next.start);
    }).catch(function (err) {
      console.warn('[event-banner] lookup failed:', err && err.message ? err.message : err);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
