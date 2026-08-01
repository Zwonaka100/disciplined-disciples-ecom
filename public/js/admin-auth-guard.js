(function () {
  'use strict';

  var CORE_ADMIN_EMAILS = ['zmabege@gmail.com', 'nomaqhizazolile@gmail.com'];
  var initialized = false;

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeEmailList(rawText) {
    var text = String(rawText || '').toLowerCase();
    var parts = text.split(/[\s,;]+/).map(function (v) { return v.trim(); }).filter(Boolean);
    var seen = {};
    return parts.filter(function (email) {
      if (seen[email]) return false;
      seen[email] = true;
      return true;
    });
  }

  function mergeUniqueEmails(listA, listB) {
    var seen = {};
    return listA.concat(listB).filter(function (email) {
      var normalized = normalizeEmail(email);
      if (!normalized || seen[normalized]) return false;
      seen[normalized] = true;
      return true;
    });
  }

  function loadAdminEmails() {
    if (!window.firebase || !firebase.firestore || !(firebase.apps && firebase.apps.length)) {
      return Promise.resolve(CORE_ADMIN_EMAILS.slice());
    }

    return firebase.firestore().collection('siteSettings').doc('main').get()
      .then(function (snap) {
        if (!snap.exists) return CORE_ADMIN_EMAILS.slice();
        var data = snap.data() || {};
        var team = data.team || {};
        var fromList = Array.isArray(team.adminsList)
          ? team.adminsList.map(normalizeEmail).filter(Boolean)
          : [];
        var fromText = normalizeEmailList(team.admins || '');
        return mergeUniqueEmails(CORE_ADMIN_EMAILS, fromList.concat(fromText));
      })
      .catch(function () {
        return CORE_ADMIN_EMAILS.slice();
      });
  }

  function isAllowedAdmin(email, adminEmails) {
    return adminEmails.indexOf(normalizeEmail(email)) !== -1;
  }

  function redirectToLogin() {
    var page = (window.location.pathname || '').split('/').pop() || 'index.html';
    window.location.replace('login-signup.html?redirect=' + encodeURIComponent(page));
  }

  function redirectToStore() {
    window.location.replace('index.html');
  }

  function markSession(user) {
    try {
      sessionStorage.setItem('userLoggedIn', 'true');
      sessionStorage.setItem('userId', user.uid || '');
      sessionStorage.setItem('userEmail', normalizeEmail(user.email));
    } catch (e) {
      // Ignore storage failures.
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem('userLoggedIn');
      sessionStorage.removeItem('userId');
      sessionStorage.removeItem('userEmail');
    } catch (e) {
      // Ignore storage failures.
    }
  }

  function startGuard() {
    if (initialized) return;
    initialized = true;

    if (!window.firebase || !firebase.auth || !(firebase.apps && firebase.apps.length)) {
      initialized = false;
      return;
    }

    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) {
        clearSession();
        redirectToLogin();
        return;
      }

      loadAdminEmails().then(function (adminEmails) {
        if (!isAllowedAdmin(user.email, adminEmails)) {
          clearSession();
          redirectToStore();
          return;
        }

        markSession(user);
      }).catch(function () {
        clearSession();
        redirectToLogin();
      });
    }, function () {
      clearSession();
      redirectToLogin();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // firebase-config.js is loaded before DOMContentLoaded on these pages.
    startGuard();
  });

  if (document.readyState !== 'loading') {
    startGuard();
  }
})();
