/**
 * 30-Day Discipline Journal - online app.
 *
 * Data (Firestore, all private to the signed-in user):
 *   journals/{uid}                  settings, Day 0 answers, minimums, reminders
 *   journals/{uid}/entries/{id}     c{cycle}-d{day} | c{cycle}-w{week} | c{cycle}-review | c{cycle}-plan
 *   journalProgress/{uid}           summary only (no written content); the mentor can read it
 *                                   only while shareWithMentor is true
 * Access: journalAccess/{uid}.granted (paid Academy package or journal purchase).
 * Without access, Day 0 and Days 1-3 are a free sample.
 */
(function () {
    'use strict';

    var C = window.JOURNAL_CONTENT;
    var FREE_DAYS = C.freeDays;
    var state = {
        user: null,
        access: false,
        journal: null,
        entries: {},
        cycle: 1,
        price: null,
        editing: null
    };

    // ---------- helpers ----------
    function $(id) { return document.getElementById(id); }
    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function db() { return window.db || firebase.firestore(); }
    function serverTime() { return firebase.firestore.FieldValue.serverTimestamp(); }
    function todayKey() {
        var d = new Date(Date.now() + 2 * 60 * 60 * 1000); // South African time
        return d.toISOString().slice(0, 10);
    }
    function daysBetween(fromKey, toKey) {
        var a = Date.parse(fromKey + 'T00:00:00Z');
        var b = Date.parse(toKey + 'T00:00:00Z');
        if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
        return Math.floor((b - a) / 86400000);
    }
    function currentDay() {
        if (!state.journal || !state.journal.startDate) return 0;
        var diff = daysBetween(state.journal.startDate, todayKey());
        if (diff < 0) return 0;
        return Math.min(30, diff + 1);
    }
    function formatDateKey(key) {
        var d = new Date(key + 'T12:00:00Z');
        if (Number.isNaN(d.getTime())) return key;
        return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    function stage() { return C.stageFor(state.journal && state.journal.stage); }
    function stageKey() { return (state.journal && state.journal.stage) || C.defaultStage; }
    function journalRef() { return db().collection('journals').doc(state.user.uid); }
    function entriesRef() { return journalRef().collection('entries'); }
    function entryId(kind, n) {
        var c = 'c' + state.cycle + '-';
        if (kind === 'day') return c + 'd' + n;
        if (kind === 'week') return c + 'w' + n;
        return c + kind;
    }
    function getEntry(kind, n) { return state.entries[entryId(kind, n)] || null; }
    function isLockedDay(day) { return !state.access && day > FREE_DAYS; }
    function randomToken() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    function notify(msg, type) {
        if (typeof window.showMessage === 'function') window.showMessage(msg, type || 'success');
    }

    function completedDays() {
        var done = [];
        for (var d = 1; d <= 30; d++) {
            if (getEntry('day', d)) done.push(d);
        }
        return done;
    }
    function returnsCount(done) {
        var set = {};
        done.forEach(function (d) { set[d] = true; });
        return done.filter(function (d, i) { return i > 0 && !set[d - 1]; }).length;
    }

    // ---------- price & access ----------
    function loadPrice() {
        var resolve = window.resolveJournalPrice || function (data) {
            if (data.active === false) return null;
            var p = Number(data.price);
            return Number.isFinite(p) && p > 0 ? p : 99;
        };
        return db().collection('siteContent').doc('journal').get().then(function (snap) {
            state.price = resolve(snap.exists ? (snap.data() || {}) : {});
        }).catch(function () { state.price = resolve({}); });
    }

    function renderPriceBox() {
        var priceText = $('journal-price-text');
        var buyBtn = $('journal-buy-btn');
        if (!priceText || !buyBtn) return;
        if (state.price) {
            priceText.innerHTML = 'R' + esc(state.price.toLocaleString('en-ZA')) + '<small>once-off &middot; lifetime access</small>';
            buyBtn.style.display = '';
        } else {
            priceText.innerHTML = 'Included<small>with every paid Academy package</small>';
            buyBtn.style.display = 'none';
        }
        document.querySelectorAll('[data-journal-buy]').forEach(function (el) {
            el.style.display = state.price ? '' : 'none';
        });
    }

    // ---------- views ----------
    function show(id, visible) {
        var el = $(id);
        if (el) el.style.display = visible ? '' : 'none';
    }

    function showSignedOut() {
        show('journal-landing', true);
        show('journal-app', false);
        var start = $('journal-start-btn');
        if (start) {
            start.textContent = 'Start free: Days 0–3';
            start.setAttribute('href', 'login-signup.html?redirect=journal.html');
        }
    }

    function showAppShell() {
        show('journal-landing', false);
        show('journal-app', true);
    }

    // ---------- setup (Day 0) ----------
    function practiceInputs(prefix, values, stageKeyValue) {
        return C.practices.map(function (p) {
            return '<label class="jx-field"><span>' + esc(C.practiceLabel(p, stageKeyValue)) + '</span>' +
                '<input type="text" maxlength="160" data-' + prefix + '="' + p.key + '" value="' + esc((values || {})[p.key] || '') + '" placeholder="e.g. ' + (p.key === 'reading' ? '5 pages' : '10 minutes') + '"></label>';
        }).join('');
    }

    function renderSetup() {
        showAppShell();
        show('journal-setup', true);
        show('journal-dashboard', false);
        var j = state.journal || {};
        var sk = j.stage || C.defaultStage;
        var stageOptions = Object.keys(C.stages).map(function (key) {
            return '<option value="' + key + '"' + (key === sk ? ' selected' : '') + '>' + esc(C.stages[key].label) + '</option>';
        }).join('');
        var day0 = j.day0 || {};
        $('journal-setup').innerHTML =
            '<div class="jx-card">' +
                '<p class="jx-kicker">Before you begin</p>' +
                '<h2 class="jx-title">Set up your 30 days</h2>' +
                '<p class="jx-muted">' + esc(C.intro) + '</p>' +
                '<div class="jx-grid-2">' +
                    '<label class="jx-field"><span>Your name</span><input id="js-name" type="text" maxlength="120" value="' + esc(j.candidateName || state.user.displayName || '') + '"></label>' +
                    '<label class="jx-field"><span>Where are you right now?</span><select id="js-stage">' + stageOptions + '</select></label>' +
                    '<label class="jx-field"><span>Start date</span><input id="js-start" type="date" value="' + esc(j.startDate || todayKey()) + '"></label>' +
                    '<label class="jx-field"><span>My 30-day commitment</span><input id="js-commitment" type="text" maxlength="240" value="' + esc(j.commitment || '') + '" placeholder="What will you show up for every day?"></label>' +
                '</div>' +
                '<h3 class="jx-subtitle">The minimum version</h3>' +
                '<p class="jx-muted">' + esc(C.minimumIntro) + '</p>' +
                '<div class="jx-grid-2" id="js-minimums">' + practiceInputs('min', j.minimums, sk) + '</div>' +
                '<h3 class="jx-subtitle">Day 0 &middot; Before you begin</h3>' +
                C.day0Questions.map(function (q, i) {
                    return '<label class="jx-field"><span>' + (i + 1) + '. ' + esc(q) + '</span><textarea rows="3" maxlength="3000" data-day0="q' + (i + 1) + '">' + esc(day0['q' + (i + 1)] || '') + '</textarea></label>';
                }).join('') +
                '<div class="jx-toggles">' +
                    '<label class="jx-toggle"><input id="js-reminders" type="checkbox"' + ((!j.reminders || j.reminders.enabled !== false) ? ' checked' : '') + '><span>Email me a short reminder at 18:30 on days I haven&rsquo;t written yet. You can switch this off at any time.</span></label>' +
                    '<label class="jx-toggle"><input id="js-share" type="checkbox"' + (j.shareWithMentor ? ' checked' : '') + '><span>Let my Academy mentor see my progress (days completed and practices ticked). They never see what I write.</span></label>' +
                '</div>' +
                '<div class="jx-actions"><button type="button" class="btn btn-primary" id="js-save">' + (j.startDate ? 'Save changes' : 'Begin my 30 days') + '</button>' +
                (j.startDate ? '<button type="button" class="btn btn-secondary" id="js-cancel">Back to my journal</button>' : '') + '</div>' +
            '</div>';

        $('js-stage').addEventListener('change', function () {
            var current = {};
            document.querySelectorAll('[data-min]').forEach(function (el) { current[el.getAttribute('data-min')] = el.value; });
            $('js-minimums').innerHTML = practiceInputs('min', current, $('js-stage').value);
        });
        $('js-save').addEventListener('click', saveSetup);
        if ($('js-cancel')) $('js-cancel').addEventListener('click', renderDashboard);
    }

    function saveSetup() {
        var btn = $('js-save');
        var startDate = $('js-start').value || todayKey();
        var minimums = {};
        document.querySelectorAll('[data-min]').forEach(function (el) { minimums[el.getAttribute('data-min')] = el.value.trim(); });
        var day0 = {};
        document.querySelectorAll('[data-day0]').forEach(function (el) { day0[el.getAttribute('data-day0')] = el.value.trim(); });
        var existing = state.journal || {};
        var reminders = existing.reminders || {};
        var data = {
            candidateName: $('js-name').value.trim(),
            stage: $('js-stage').value,
            startDate: startDate,
            commitment: $('js-commitment').value.trim(),
            minimums: minimums,
            day0: day0,
            cycle: existing.cycle || 1,
            reminders: { enabled: $('js-reminders').checked, token: reminders.token || randomToken() },
            shareWithMentor: $('js-share').checked,
            updatedAt: serverTime()
        };
        if (!existing.createdAt) data.createdAt = serverTime();
        btn.disabled = true;
        btn.textContent = 'Saving…';
        journalRef().set(data, { merge: true }).then(function () {
            state.journal = Object.assign({}, existing, data);
            state.cycle = state.journal.cycle || 1;
            return updateProgress();
        }).then(function () {
            notify('Your journal is ready. Day ' + Math.max(1, currentDay()) + ' is waiting.');
            renderDashboard();
        }).catch(function (err) {
            console.error('[journal] setup save failed', err);
            notify('Could not save your journal setup. Please try again.', 'error');
            btn.disabled = false;
            btn.textContent = 'Try again';
        });
    }

    // ---------- dashboard ----------
    function loadEntries() {
        return entriesRef().where('cycle', '==', state.cycle).get().then(function (snap) {
            state.entries = {};
            snap.forEach(function (doc) { state.entries[doc.id] = doc.data(); });
        });
    }

    function lockBanner() {
        if (state.access) return '';
        return '<div class="jx-banner">' +
            '<div><strong>You are using the free sample: Day 0 to Day ' + FREE_DAYS + '.</strong> ' +
            'Unlock all 30 days, the weekly reviews, your 30-day review, the 90-day plan and the printable version.</div>' +
            '<div class="jx-banner-actions">' +
                (state.price ? '<a class="btn btn-primary" href="checkout.html?product=journal">Unlock for R' + esc(state.price.toLocaleString('en-ZA')) + '</a>' : '') +
                '<a class="btn btn-secondary" href="academy.html">Included with the Academy</a>' +
            '</div></div>';
    }

    function gridHtml(day, done) {
        var doneSet = {};
        done.forEach(function (d) { doneSet[d] = true; });
        var cells = '';
        for (var d = 1; d <= 30; d++) {
            var cls = 'jx-cell';
            var title = 'Day ' + d + ' · ' + C.days[d - 1].theme;
            if (doneSet[d]) { cls += ' done'; title += ' (written)'; }
            else if (d < day) { cls += ' missed'; title += ' (open — return any time)'; }
            if (d === day) cls += ' today';
            if (d > day) cls += ' future';
            if (isLockedDay(d)) cls += ' locked';
            var clickable = d <= Math.max(day, 1) && !isLockedDay(d);
            cells += '<button type="button" class="' + cls + '" data-open-day="' + d + '"' + (clickable ? '' : ' disabled') + ' title="' + esc(title) + '">' +
                (isLockedDay(d) ? '<i class="fas fa-lock"></i>' : d) + '</button>';
        }
        return cells;
    }

    function weekAvailable(n, day) { return day >= (n - 1) * 7 + 1; }

    function renderDashboard() {
        showAppShell();
        show('journal-setup', false);
        show('journal-dashboard', true);
        var day = currentDay();
        var done = completedDays();
        var returns = returnsCount(done);
        var s = stage();
        var todayInfo = day >= 1 ? C.days[day - 1] : null;
        var todayDone = day >= 1 && !!getEntry('day', day);
        var reviewOpen = day >= 30 || done.length >= 30;
        var plan = getEntry('plan');

        var html = '';
        html += lockBanner();

        // Today
        html += '<div class="jx-card jx-today">';
        if (day === 0) {
            html += '<p class="jx-kicker">Starts ' + esc(formatDateKey(state.journal.startDate)) + '</p>' +
                '<h2 class="jx-title">Your 30 days begin soon</h2>' +
                '<p class="jx-muted">Use the time to settle your minimum versions and Day 0 answers.</p>';
        } else {
            html += '<p class="jx-kicker">Cycle ' + state.cycle + ' &middot; Day ' + day + ' of 30</p>' +
                '<h2 class="jx-title">Day ' + day + ' · ' + esc(todayInfo.theme) + '</h2>' +
                '<p class="jx-prompt">&ldquo;' + esc(todayInfo.prompt) + '&rdquo;</p>' +
                (isLockedDay(day)
                    ? '<p class="jx-muted"><i class="fas fa-lock"></i> Unlock the full journal to keep going from Day ' + (FREE_DAYS + 1) + '.</p>'
                    : '<button type="button" class="btn btn-primary" data-open-day="' + day + '">' + (todayDone ? 'Edit today&rsquo;s entry' : 'Write today&rsquo;s entry') + '</button>');
        }
        html += '</div>';

        // Stats + grid
        html += '<div class="jx-card">' +
            '<div class="jx-stats">' +
                '<div><span class="jx-stat">' + done.length + '</span><span class="jx-stat-label">days written</span></div>' +
                '<div><span class="jx-stat">' + returns + '</span><span class="jx-stat-label">times you returned</span></div>' +
                '<div><span class="jx-stat">' + Math.max(0, day - done.length) + '</span><span class="jx-stat-label">open days</span></div>' +
            '</div>' +
            '<div class="jx-grid">' + gridHtml(day, done) + '</div>' +
            '<p class="jx-legend"><span class="jx-dot done"></span>Written <span class="jx-dot missed"></span>Open: return any time <span class="jx-dot today"></span>Today</p>' +
            '<p class="jx-muted jx-center">When you miss, return. Do not turn one missed day into a collapsed identity.</p>' +
        '</div>';

        // Day 0 + weeks
        html += '<div class="jx-card"><h3 class="jx-subtitle" style="margin-top:0;">Your architecture</h3><div class="jx-list">';
        html += '<button type="button" class="jx-row" data-open-setup="1"><span><strong>Day 0 &middot; Before you begin</strong><br><small>Your vision, your why, your minimum versions</small></span><i class="fas fa-pen"></i></button>';
        C.weeks.forEach(function (w, i) {
            var n = i + 1;
            var available = weekAvailable(n, day);
            var locked = !state.access;
            var entry = getEntry('week', n);
            html += '<button type="button" class="jx-row' + (locked || !available ? ' muted' : '') + '" data-open-week="' + n + '"' + (locked || !available ? ' disabled' : '') + '>' +
                '<span><strong>Week ' + n + ' &middot; ' + esc(w.title) + '</strong><br><small>' + esc(w.subtitle) + (available ? '' : ' Opens on Day ' + ((n - 1) * 7 + 1) + '.') + '</small></span>' +
                (locked ? '<i class="fas fa-lock"></i>' : (entry ? '<i class="fas fa-check-circle jx-ok"></i>' : '<i class="fas fa-chevron-right"></i>')) +
            '</button>';
        });
        var reviewLocked = !state.access || !reviewOpen;
        html += '<button type="button" class="jx-row' + (reviewLocked ? ' muted' : '') + '" data-open-review="1"' + (reviewLocked ? ' disabled' : '') + '>' +
            '<span><strong>30-day review &middot; What has been formed?</strong><br><small>' + (reviewOpen ? 'Notice the direction of your formation.' : 'Opens on Day 30.') + '</small></span>' +
            (!state.access ? '<i class="fas fa-lock"></i>' : (getEntry('review') ? '<i class="fas fa-check-circle jx-ok"></i>' : '<i class="fas fa-chevron-right"></i>')) + '</button>';
        html += '<button type="button" class="jx-row' + (reviewLocked ? ' muted' : '') + '" data-open-plan="1"' + (reviewLocked ? ' disabled' : '') + '>' +
            '<span><strong>My next 90 days</strong><br><small>Carry forward what worked. Redesign what did not.</small></span>' +
            (!state.access ? '<i class="fas fa-lock"></i>' : (plan ? '<i class="fas fa-check-circle jx-ok"></i>' : '<i class="fas fa-chevron-right"></i>')) + '</button>';
        html += '</div>';
        if (state.access && plan) {
            html += '<div class="jx-actions"><button type="button" class="btn btn-secondary" id="jx-new-cycle"><i class="fas fa-rotate-right" style="margin-right:6px;"></i>Start a new 30 days</button></div>';
        }
        html += '</div>';

        // Settings
        var j = state.journal;
        var reminderOn = !!(j.reminders && j.reminders.enabled);
        html += '<div class="jx-card"><h3 class="jx-subtitle" style="margin-top:0;">Settings</h3>' +
            '<p class="jx-muted">Journal for: <strong>' + esc(s.label) + '</strong> &middot; Started ' + esc(formatDateKey(j.startDate)) + '</p>' +
            '<div class="jx-toggles">' +
                '<label class="jx-toggle"><input id="jx-set-reminders" type="checkbox"' + (reminderOn ? ' checked' : '') + '><span>Daily email reminder at 18:30 on days I haven&rsquo;t written</span></label>' +
                '<label class="jx-toggle"><input id="jx-set-share" type="checkbox"' + (j.shareWithMentor ? ' checked' : '') + '><span>Share my progress with my Academy mentor (never my writing)</span></label>' +
            '</div>' +
            '<div class="jx-actions">' +
                '<button type="button" class="btn btn-secondary" data-open-setup="1"><i class="fas fa-sliders" style="margin-right:6px;"></i>Edit setup</button>' +
                (state.access
                    ? '<button type="button" class="btn btn-secondary" id="jx-print-mine"><i class="fas fa-print" style="margin-right:6px;"></i>Print my journal</button>' +
                      '<button type="button" class="btn btn-secondary" id="jx-print-blank"><i class="fas fa-file-pdf" style="margin-right:6px;"></i>Print a blank copy</button>'
                    : '') +
            '</div>' +
            '<p class="jx-muted jx-small"><i class="fas fa-lock"></i> Your entries are private. Only you can read them, not the mentor and not the Disciplined Disciples team.</p>' +
        '</div>';

        $('journal-dashboard').innerHTML = html;
        bindDashboard();
    }

    function bindDashboard() {
        var root = $('journal-dashboard');
        root.querySelectorAll('[data-open-day]').forEach(function (el) {
            el.addEventListener('click', function () { openDay(Number(el.getAttribute('data-open-day'))); });
        });
        root.querySelectorAll('[data-open-week]').forEach(function (el) {
            el.addEventListener('click', function () { openWeek(Number(el.getAttribute('data-open-week'))); });
        });
        root.querySelectorAll('[data-open-setup]').forEach(function (el) { el.addEventListener('click', renderSetup); });
        root.querySelectorAll('[data-open-review]').forEach(function (el) { el.addEventListener('click', openReview); });
        root.querySelectorAll('[data-open-plan]').forEach(function (el) { el.addEventListener('click', openPlan); });
        if ($('jx-new-cycle')) $('jx-new-cycle').addEventListener('click', startNewCycle);
        if ($('jx-print-mine')) $('jx-print-mine').addEventListener('click', function () { printJournal('mine'); });
        if ($('jx-print-blank')) $('jx-print-blank').addEventListener('click', function () { printJournal('blank'); });
        if ($('jx-set-reminders')) $('jx-set-reminders').addEventListener('change', function (e) { saveSetting('reminders', e.target.checked); });
        if ($('jx-set-share')) $('jx-set-share').addEventListener('change', function (e) { saveSetting('share', e.target.checked); });
    }

    function saveSetting(kind, value) {
        var update = { updatedAt: serverTime() };
        if (kind === 'reminders') {
            var token = (state.journal.reminders && state.journal.reminders.token) || randomToken();
            update.reminders = { enabled: value, token: token };
        } else {
            update.shareWithMentor = value;
        }
        journalRef().set(update, { merge: true }).then(function () {
            Object.assign(state.journal, update);
            return kind === 'share' ? updateProgress() : null;
        }).then(function () {
            notify(kind === 'reminders'
                ? (value ? 'Daily reminders are on.' : 'Daily reminders are off.')
                : (value ? 'Your mentor can now see your progress (never your writing).' : 'Your progress is no longer shared.'), 'info');
        }).catch(function (err) {
            console.error('[journal] setting save failed', err);
            notify('Could not save that setting. Please try again.', 'error');
        });
    }

    function startNewCycle() {
        if (!window.confirm('Start a new 30 days from today? Your previous cycle stays saved and printable.')) return;
        var next = (state.journal.cycle || 1) + 1;
        var update = { cycle: next, startDate: todayKey(), updatedAt: serverTime() };
        journalRef().set(update, { merge: true }).then(function () {
            Object.assign(state.journal, update);
            state.cycle = next;
            state.entries = {};
            return updateProgress();
        }).then(function () {
            notify('A new 30 days begins today. Return, don’t retreat.');
            renderDashboard();
        }).catch(function (err) {
            console.error('[journal] new cycle failed', err);
            notify('Could not start a new cycle. Please try again.', 'error');
        });
    }

    // ---------- editor ----------
    function openEditor(title, subtitle, bodyHtml, onSave) {
        state.editing = onSave;
        $('je-title').textContent = title;
        $('je-subtitle').textContent = subtitle || '';
        $('je-body').innerHTML = bodyHtml;
        $('je-status').textContent = '';
        $('journal-editor').style.display = 'flex';
        document.body.style.overflow = 'hidden';
        var first = $('je-body').querySelector('input, textarea');
        if (first) setTimeout(function () { first.focus(); }, 50);
    }

    function closeEditor() {
        $('journal-editor').style.display = 'none';
        document.body.style.overflow = '';
        state.editing = null;
    }

    function textArea(key, title, hint, value, rows) {
        return '<label class="jx-field"><span>' + esc(title) + '</span>' + (hint ? '<small>' + esc(hint) + '</small>' : '') +
            '<textarea rows="' + (rows || 3) + '" maxlength="4000" data-f="' + key + '">' + esc(value || '') + '</textarea></label>';
    }

    function collectFields() {
        var out = {};
        $('je-body').querySelectorAll('[data-f]').forEach(function (el) {
            out[el.getAttribute('data-f')] = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? Number(el.value) : el.value.trim());
        });
        return out;
    }

    function openDay(day) {
        if (!day || isLockedDay(day) || day > Math.max(currentDay(), 1)) return;
        var info = C.days[day - 1];
        var entry = getEntry('day', day) || {};
        var practices = entry.practices || {};
        var minimums = state.journal.minimums || {};
        var rows = C.practices.map(function (p) {
            var v = practices[p.key] || {};
            var min = minimums[p.key] ? '<small>Minimum: ' + esc(minimums[p.key]) + '</small>' : '';
            return '<div class="jx-practice"><div><strong>' + esc(C.practiceLabel(p, stageKey())) + '</strong>' + min + '</div>' +
                '<input type="number" min="0" max="1440" inputmode="numeric" data-p="' + p.key + '" value="' + esc(v.amount != null ? v.amount : '') + '" aria-label="' + esc(p.unit) + '"><span class="jx-unit">' + esc(p.unit) + '</span>' +
                '<label class="jx-check"><input type="checkbox" data-pd="' + p.key + '"' + (v.done ? ' checked' : '') + '><span>Done</span></label></div>';
        }).join('');
        var s = stage();
        var fields = C.dailyFields.map(function (f) {
            return textArea(f.key, f.title || s.reflection, f.hint, entry[f.key], 3);
        }).join('');
        var devotion = entry.devotion != null ? entry.devotion : 50;
        var body = '<p class="jx-prompt">&ldquo;' + esc(info.prompt) + '&rdquo;</p>' +
            '<h4 class="jx-subtitle">Today&rsquo;s commitment</h4><div class="jx-practices">' + rows + '</div>' +
            fields +
            '<label class="jx-field"><span>' + esc(C.devotionQuestion) + '</span>' +
            '<div class="jx-range"><small>Proving</small><input type="range" min="0" max="100" step="5" data-f="devotion" value="' + esc(devotion) + '"><small>Tending</small></div></label>';
        openEditor('Day ' + day + ' · ' + info.theme, 'Cycle ' + state.cycle + (day === currentDay() ? ' · Today' : ' · Returning to this day'), body, function () {
            var data = collectFields();
            var pr = {};
            C.practices.forEach(function (p) {
                var amountEl = $('je-body').querySelector('[data-p="' + p.key + '"]');
                var doneEl = $('je-body').querySelector('[data-pd="' + p.key + '"]');
                var amount = amountEl && amountEl.value !== '' ? Math.max(0, Math.min(1440, parseInt(amountEl.value, 10) || 0)) : null;
                pr[p.key] = { amount: amount, done: !!(doneEl && doneEl.checked) };
            });
            data.practices = pr;
            data.kind = 'day';
            data.day = day;
            return saveEntry('day', day, data);
        });
    }

    function openWeek(n) {
        if (!state.access) return;
        var w = C.weeks[n - 1];
        var entry = getEntry('week', n) || {};
        var s = stage();
        var fields = C.weekFields.map(function (f) {
            return textArea(f.key, f.title || s.weekOutcome, null, entry[f.key], 2);
        }).join('');
        var checks = C.weekChecks(s).map(function (c) {
            return '<label class="jx-check jx-check-row"><input type="checkbox" data-f="check_' + c.key + '"' + (entry['check_' + c.key] ? ' checked' : '') + '><span>' + esc(c.label) + '</span></label>';
        }).join('');
        var body = '<p class="jx-muted">' + esc(w.body) + '</p>' + fields + '<h4 class="jx-subtitle">End-of-week review</h4>' + checks;
        openEditor('Week ' + n + ' · ' + w.title, w.subtitle, body, function () {
            var data = collectFields();
            data.kind = 'week';
            data.week = n;
            return saveEntry('week', n, data);
        });
    }

    function openReview() {
        if (!state.access) return;
        var entry = getEntry('review') || {};
        var qs = C.reviewQuestions(stage());
        var body = '<p class="jx-muted">The purpose of this review is not to award yourself a grade. It is to notice the direction of your formation.</p>' +
            qs.map(function (q, i) { return textArea('q' + (i + 1), (i + 1) + '. ' + q, null, entry['q' + (i + 1)], 3); }).join('');
        openEditor('30-day review', 'What has been formed?', body, function () {
            var data = collectFields();
            data.kind = 'review';
            return saveEntry('review', null, data);
        });
    }

    function openPlan() {
        if (!state.access) return;
        var entry = getEntry('plan') || {};
        var s = stage();
        var practiceFields = C.practices.filter(function (p) { return p.key !== 'study'; }).map(function (p) {
            return '<label class="jx-field"><span>' + esc(p.label) + '</span><input type="text" maxlength="200" data-f="practice_' + p.key + '" value="' + esc(entry['practice_' + p.key] || '') + '"></label>';
        }).join('');
        var body = '<p class="jx-muted">Carry forward what worked. Redesign what did not. Keep the minimum sustainable.</p>' +
            textArea('becoming', 'The person I am becoming', null, entry.becoming, 2) +
            '<h4 class="jx-subtitle">My four practice commitments</h4><div class="jx-grid-2">' + practiceFields + '</div>' +
            textArea('stageCommitment', s.planCommit, null, entry.stageCommitment, 2) +
            textArea('accountability', 'My accountability structure', null, entry.accountability, 2) +
            textArea('standard', 'The standard I refuse to abandon', null, entry.standard, 2) +
            '<div class="jx-commitment"><strong>My commitment</strong><p>' + esc(C.commitment) + '</p></div>' +
            '<label class="jx-field"><span>Sign with your name</span><input type="text" maxlength="120" data-f="signature" value="' + esc(entry.signature || state.journal.candidateName || '') + '"></label>';
        openEditor('My next 90 days', 'Cycle ' + state.cycle, body, function () {
            var data = collectFields();
            data.kind = 'plan';
            data.signedOn = todayKey();
            return saveEntry('plan', null, data);
        });
    }

    function saveEntry(kind, n, data) {
        var id = entryId(kind, n);
        data.cycle = state.cycle;
        data.savedAt = serverTime();
        data.dateKey = todayKey();
        return entriesRef().doc(id).set(data, { merge: true }).then(function () {
            state.entries[id] = data;
            var today = todayKey();
            state.journal.lastEntryDate = today;
            return journalRef().set({ lastEntryDate: today, updatedAt: serverTime() }, { merge: true });
        }).then(updateProgress);
    }

    // Summary the mentor may see (only while shareWithMentor is on). No written content.
    function updateProgress() {
        if (!state.user || !state.journal) return Promise.resolve();
        var done = completedDays();
        var totals = {};
        C.practices.forEach(function (p) { totals[p.key] = 0; });
        done.forEach(function (d) {
            var pr = (getEntry('day', d) || {}).practices || {};
            C.practices.forEach(function (p) { if (pr[p.key] && pr[p.key].done) totals[p.key] += 1; });
        });
        return db().collection('journalProgress').doc(state.user.uid).set({
            cycle: state.cycle,
            stage: stageKey(),
            startDate: state.journal.startDate || null,
            currentDay: currentDay(),
            daysCompleted: done.length,
            completedDays: done,
            returns: returnsCount(done),
            practiceTotals: totals,
            weeksReviewed: [1, 2, 3, 4].filter(function (n) { return !!getEntry('week', n); }).length,
            reviewDone: !!getEntry('review'),
            planDone: !!getEntry('plan'),
            lastEntryDate: state.journal.lastEntryDate || null,
            shareWithMentor: !!state.journal.shareWithMentor,
            displayName: state.journal.candidateName || state.user.displayName || '',
            email: (state.user.email || '').toLowerCase(),
            updatedAt: serverTime()
        }, { merge: true }).catch(function (err) {
            console.warn('[journal] progress update failed', err);
        });
    }

    // ---------- print ----------
    function lines(n) {
        var out = '';
        for (var i = 0; i < (n || 3); i++) out += '<div class="jp-line"></div>';
        return out;
    }
    function answer(value, n) {
        return value ? '<div class="jp-answer">' + esc(value).replace(/\n/g, '<br>') + '</div>' : lines(n);
    }
    function pageFooter() {
        return '<div class="jp-footer">Disciplined Disciples Academy &nbsp;|&nbsp; Relentlessly Disciplined</div>';
    }

    function printJournal(mode) {
        if (!state.access) return;
        var mine = mode === 'mine';
        var j = mine ? state.journal : {};
        var s = stage();
        var sk = stageKey();
        var html = '';

        html += '<section class="jp-page jp-cover"><h1>RELENTLESSLY<br>DISCIPLINED</h1><p class="jp-sub">30-Day Practice Journal</p><p>Disciplined Disciples Academy</p><p class="jp-strong">FROM INTENTION<br>TO EMBODIED PRACTICE</p>' +
            '<table class="jp-meta"><tr><td>Candidate:</td><td>' + esc(j.candidateName || '') + '</td></tr><tr><td>Start date:</td><td>' + esc(j.startDate ? formatDateKey(j.startDate) : '') + '</td></tr><tr><td>My 30-day commitment:</td><td>' + esc(j.commitment || '') + '</td></tr></table>' + pageFooter() + '</section>';

        html += '<section class="jp-page"><h2>How to use this journal</h2><p>' + esc(C.intro) + '</p><p>' + esc(C.introPractices) + '</p><h3>' + esc(s.journeyTitle) + '</h3><p>' + esc(s.journey) + '</p><h3>The four rules</h3><ul>' +
            C.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul><h3>The minimum version</h3><p>' + esc(C.minimumIntro) + '</p><ul>' +
            C.practices.map(function (p) { return '<li>' + esc(C.practiceLabel(p, sk)) + ': <strong>' + esc((j.minimums || {})[p.key] || '______________________') + '</strong></li>'; }).join('') + '</ul>' + pageFooter() + '</section>';

        html += '<section class="jp-page"><h2>Part I &mdash; Build your architecture</h2><h3>Day 0: Before you begin</h3>' +
            C.day0Questions.map(function (q, i) { return '<p class="jp-q">' + (i + 1) + '. ' + esc(q) + '</p>' + answer(((j.day0 || {})['q' + (i + 1)]), 3); }).join('') + pageFooter() + '</section>';

        C.weeks.forEach(function (w, wi) {
            var wn = wi + 1;
            var we = mine ? (getEntry('week', wn) || {}) : {};
            html += '<section class="jp-page"><h2>Week ' + wn + ' &mdash; ' + esc(w.title.toUpperCase()) + '</h2><h3>' + esc(w.subtitle) + '</h3><p>' + esc(w.body) + '</p>' +
                C.weekFields.map(function (f) { return '<p class="jp-q">' + esc(f.title || s.weekOutcome) + '</p>' + answer(we[f.key], 2); }).join('') +
                '<h3>End-of-week review</h3><ul class="jp-checks">' + C.weekChecks(s).map(function (c) { return '<li>' + (we['check_' + c.key] ? '&#9745;' : '&#9744;') + ' ' + esc(c.label) + '</li>'; }).join('') + '</ul>' + pageFooter() + '</section>';
            var from = wi * 7 + 1;
            var to = wn === 4 ? 30 : wn * 7;
            for (var d = from; d <= to; d++) {
                var info = C.days[d - 1];
                var e = mine ? (getEntry('day', d) || {}) : {};
                var pr = e.practices || {};
                html += '<section class="jp-page"><h2>Day ' + d + ' &mdash; ' + esc(info.theme.toUpperCase()) + '</h2><p>' + esc(info.prompt) + '</p><h3>Today&rsquo;s commitment</h3><table class="jp-table">' +
                    C.practices.map(function (p) {
                        var v = pr[p.key] || {};
                        return '<tr><td>' + esc(C.practiceLabel(p, sk)) + '</td><td>' + (v.amount != null && v.amount !== '' ? esc(v.amount) : '______') + ' ' + esc(p.unit) + '</td><td>' + (v.done ? '&#9745;' : '&#9744;') + '</td></tr>';
                    }).join('') + '</table>' +
                    C.dailyFields.map(function (f) { return '<h3>' + esc(f.title || s.reflection) + '</h3><p class="jp-hint">' + esc(f.hint) + '</p>' + answer(e[f.key], 2); }).join('') +
                    '<p class="jp-hint">' + esc(C.devotionQuestion) + (e.devotion != null ? ' <strong>(' + (e.devotion >= 50 ? 'tending' : 'proving') + ')</strong>' : '') + '</p>' +
                    '<p class="jp-hint">Signature / initials: ____________________ &nbsp; Date: ____________________</p>' + pageFooter() + '</section>';
            }
        });

        var rv = mine ? (getEntry('review') || {}) : {};
        html += '<section class="jp-page"><h2>30-day review &mdash; What has been formed?</h2><p>The purpose of this review is not to award yourself a grade. It is to notice the direction of your formation.</p>' +
            C.reviewQuestions(s).map(function (q, i) { return '<p class="jp-q">' + (i + 1) + '. ' + esc(q) + '</p>' + answer(rv['q' + (i + 1)], 3); }).join('') + pageFooter() + '</section>';

        var pl = mine ? (getEntry('plan') || {}) : {};
        html += '<section class="jp-page"><h2>My next 90 days</h2><p>Carry forward what worked. Redesign what did not. Keep the minimum sustainable.</p>' +
            '<p class="jp-q">The person I am becoming</p>' + answer(pl.becoming, 2) +
            '<p class="jp-q">My four practice commitments</p><ul>' + C.practices.filter(function (p) { return p.key !== 'study'; }).map(function (p) { return '<li>' + esc(p.label) + ': ' + esc(pl['practice_' + p.key] || '______________________') + '</li>'; }).join('') + '</ul>' +
            '<p class="jp-q">' + esc(s.planCommit) + '</p>' + answer(pl.stageCommitment, 2) +
            '<p class="jp-q">My accountability structure</p>' + answer(pl.accountability, 2) +
            '<p class="jp-q">The standard I refuse to abandon</p>' + answer(pl.standard, 2) +
            '<h3>My commitment</h3><p class="jp-strong">' + esc(C.commitment) + '</p>' +
            '<p class="jp-hint">Candidate signature: ' + esc(pl.signature || '______________________________') + ' &nbsp; Date: ' + esc(pl.signedOn ? formatDateKey(pl.signedOn) : '____________________') + '</p>' + pageFooter() + '</section>';

        html += '<section class="jp-page jp-cover"><p class="jp-strong">DISCIPLINED DISCIPLES ACADEMY</p><p>' + esc(C.closing) + '</p>' + pageFooter() + '</section>';

        $('journal-print').innerHTML = html;
        document.body.classList.add('printing-journal');
        var cleanup = function () {
            document.body.classList.remove('printing-journal');
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        setTimeout(function () { window.print(); }, 50);
    }

    // ---------- boot ----------
    function boot() {
        var editorSave = $('je-save');
        var editorClose = $('je-close');
        var editorCancel = $('je-cancel');
        if (editorClose) editorClose.addEventListener('click', closeEditor);
        if (editorCancel) editorCancel.addEventListener('click', closeEditor);
        if (editorSave) {
            editorSave.addEventListener('click', function () {
                if (!state.editing) return;
                editorSave.disabled = true;
                $('je-status').textContent = 'Saving…';
                Promise.resolve(state.editing()).then(function () {
                    closeEditor();
                    notify('Saved. Return, don’t retreat.');
                    renderDashboard();
                }).catch(function (err) {
                    console.error('[journal] save failed', err);
                    $('je-status').textContent = (err && err.code === 'permission-denied')
                        ? 'This part of the journal needs full access.'
                        : 'Could not save. Check your connection and try again.';
                }).then(function () { editorSave.disabled = false; });
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && $('journal-editor') && $('journal-editor').style.display === 'flex') closeEditor();
        });

        (window.firebaseInitialized || Promise.resolve()).then(function () {
            loadPrice().then(renderPriceBox);
            if (!window.auth) { showSignedOut(); return; }
            window.auth.onAuthStateChanged(function (user) {
                if (!user) { state.user = null; showSignedOut(); return; }
                state.user = user;
                window.currentUserId = user.uid;
                showAppShell();
                show('journal-setup', false);
                show('journal-dashboard', true);
                $('journal-dashboard').innerHTML = '<div class="jx-card jx-center"><i class="fas fa-circle-notch fa-spin"></i> Opening your journal&hellip;</div>';
                var accessPromise = typeof window.getJournalAccess === 'function'
                    ? window.getJournalAccess({ force: true })
                    : Promise.resolve(false);
                Promise.all([accessPromise, journalRef().get()]).then(function (results) {
                    state.access = !!results[0];
                    var snap = results[1];
                    state.journal = snap.exists ? (snap.data() || {}) : null;
                    state.cycle = (state.journal && state.journal.cycle) || 1;
                    if (!state.journal || !state.journal.startDate) {
                        renderSetup();
                        return null;
                    }
                    return loadEntries().then(renderDashboard);
                }).catch(function (err) {
                    console.error('[journal] load failed', err);
                    $('journal-dashboard').innerHTML = '<div class="jx-card jx-center">We could not open your journal right now. Please refresh to try again.</div>';
                });
            });
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
