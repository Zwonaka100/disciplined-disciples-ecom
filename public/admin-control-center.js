(function () {
    const ADMIN_EMAILS = ['zmabege@gmail.com', 'nomaqhizazolile@gmail.com'];
    const firebaseConfig = {
        apiKey: 'AIzaSyBVpuDI_YJI7mxtT6-igSL7ZX3s-cqMRnc',
        authDomain: 'disciplined-disciples-1.firebaseapp.com',
        projectId: 'disciplined-disciples-1',
        storageBucket: 'disciplined-disciples-1.firebasestorage.app',
        messagingSenderId: '565996965931',
        appId: '1:565996965931:web:b9d18489caa790e7afda6e'
    };

    let db;
    let auth;

    function initFirebase() {
        if (!window.firebase) {
            return false;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        auth = firebase.auth();
        return true;
    }

    function isAdminEmail(email) {
        return ADMIN_EMAILS.includes((email || '').toLowerCase());
    }

    function guardAdmin() {
        const fallback = sessionStorage.getItem('userLoggedIn') && sessionStorage.getItem('userEmail');
        if (fallback && isAdminEmail(sessionStorage.getItem('userEmail'))) {
            return true;
        }

        if (!auth) {
            return false;
        }

        auth.onAuthStateChanged((user) => {
            if (!user || !isAdminEmail(user.email)) {
                window.location.replace('login-signup.html');
            }
        });
        return true;
    }

    function showAlert(id, type, message) {
        const el = document.getElementById(id);
        if (!el) return;
        const map = {
            success: 'border-green-300 bg-green-50 text-green-700',
            error: 'border-red-300 bg-red-50 text-red-700',
            info: 'border-sky-300 bg-sky-50 text-sky-700'
        };
        el.className = (el.className || '').replace(/border-[^ ]+|bg-[^ ]+|text-[^ ]+/g, '').trim();
        el.classList.remove('hidden');
        el.classList.add(...(map[type] || map.info).split(' '));
        el.textContent = message;
    }

    function setButtonLoading(btn, loadingText, isLoading) {
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = loadingText;
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
        } else {
            btn.textContent = btn.dataset.originalText || btn.textContent;
            btn.disabled = false;
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
    }

    async function logAdminActivity(action, targetType, targetId, details) {
        if (!db) return;
        try {
            await db.collection('adminActivity').add({
                action: (action || '').trim(),
                targetType: (targetType || '').trim(),
                targetId: (targetId || '').trim(),
                details: details || {},
                actor: sessionStorage.getItem('userEmail') || 'admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            // Activity log must never block core operations.
        }
    }

    async function initBookPage() {
        const saveBtn = document.getElementById('book-save-btn');
        const titleEl = document.getElementById('book-title');
        const synopsisEl = document.getElementById('book-synopsis');
        const statusEl = document.getElementById('book-status');
        const testimonialsEl = document.getElementById('book-testimonials');
        const printLinkEl = document.getElementById('book-print-link');
        const ebookLinkEl = document.getElementById('book-ebook-link');
        const physicalStockEl = document.getElementById('book-physical-stock');
        const physicalRestockEl = document.getElementById('book-physical-restock');
        const journalPriceEl = document.getElementById('journal-price');
        const journalActiveEl = document.getElementById('journal-active');
        const journalSaveBtn = document.getElementById('journal-save-btn');
        const DEFAULT_RESTOCK = window.PHYSICAL_BOOK_DEFAULT_RESTOCK || '2026-10-07';

        if (physicalRestockEl && !physicalRestockEl.value) physicalRestockEl.value = DEFAULT_RESTOCK;

        async function loadJournalSettings() {
            if (!journalPriceEl) return;
            const snap = await db.collection('siteContent').doc('journal').get();
            const data = snap.exists ? (snap.data() || {}) : {};
            journalPriceEl.value = Number(data.price) > 0 ? Number(data.price) : '';
            journalActiveEl.value = data.active === false ? 'false' : 'true';
        }

        if (journalSaveBtn) {
            journalSaveBtn.addEventListener('click', async () => {
                const price = Number(journalPriceEl.value);
                if (journalPriceEl.value !== '' && (!Number.isFinite(price) || price < 0 || price > 100000)) {
                    showAlert('journal-alert', 'error', 'Please enter a valid price.');
                    return;
                }
                const payload = {
                    price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
                    active: journalActiveEl.value === 'true',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: sessionStorage.getItem('userEmail') || 'admin'
                };
                setButtonLoading(journalSaveBtn, 'Saving...', true);
                try {
                    await db.collection('siteContent').doc('journal').set(payload, { merge: true });
                    await logAdminActivity('update', 'siteContent', 'journal', { price: payload.price, active: payload.active });
                    const livePrice = payload.price || window.JOURNAL_DEFAULT_PRICE || 99;
                    showAlert('journal-alert', 'success', payload.active
                        ? `Saved. The journal is on sale for R${livePrice}.`
                        : 'Saved. The journal is Academy-only for now.');
                } catch (error) {
                    showAlert('journal-alert', 'error', 'Failed to save journal settings.');
                } finally {
                    setButtonLoading(journalSaveBtn, 'Saving...', false);
                }
            });
        }

        async function loadBook() {
            const snap = await db.collection('siteContent').doc('book').get();
            if (!snap.exists) return;
            const data = snap.data() || {};
            if (physicalStockEl) physicalStockEl.value = data.physicalStock || 'auto';
            if (physicalRestockEl) physicalRestockEl.value = data.physicalRestockDate || DEFAULT_RESTOCK;
            titleEl.value = data.title || titleEl.value;
            synopsisEl.value = data.synopsis || synopsisEl.value;
            const rawStatus = (data.status || 'available').toString().toLowerCase().trim();
            if (rawStatus === 'live') {
                statusEl.value = 'available';
            } else if (rawStatus === 'preorder') {
                statusEl.value = 'pre-order';
            } else {
                statusEl.value = rawStatus || 'available';
            }
            testimonialsEl.value = Array.isArray(data.testimonials) ? data.testimonials.join('\n') : '';
            printLinkEl.value = data.printLink || '';
            ebookLinkEl.value = data.ebookLink || '';
            refreshBookStats(data);
        }

        function refreshBookStats(data) {
            const statusDisplay = document.getElementById('book-status-display');
            const testimonialsCount = document.getElementById('book-testimonials-count');
            const linksStatus = document.getElementById('book-links-status');
            const testimonials = Array.isArray(data.testimonials) ? data.testimonials : [];
            const displayStatus = (data.status || 'available').toString().toLowerCase().trim();
            const normalized = displayStatus === 'live' ? 'available' : (displayStatus === 'preorder' ? 'pre-order' : displayStatus);
            if (statusDisplay) statusDisplay.textContent = (normalized || 'available').replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (testimonialsCount) testimonialsCount.textContent = String(testimonials.length);
            if (linksStatus) linksStatus.textContent = (data.printLink || data.ebookLink) ? 'Configured' : 'Pending';
        }

        saveBtn.addEventListener('click', async () => {
            const payload = {
                title: titleEl.value.trim(),
                synopsis: synopsisEl.value.trim(),
                status: statusEl.value,
                testimonials: testimonialsEl.value.split('\n').map(t => t.trim()).filter(Boolean),
                printLink: printLinkEl.value.trim(),
                ebookLink: ebookLinkEl.value.trim(),
                physicalStock: physicalStockEl ? physicalStockEl.value : 'auto',
                physicalRestockDate: physicalRestockEl ? physicalRestockEl.value : DEFAULT_RESTOCK,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: sessionStorage.getItem('userEmail') || 'admin'
            };

            if (!payload.title || !payload.synopsis) {
                showAlert('book-alert', 'error', 'Title and synopsis are required.');
                return;
            }
            if (payload.title.length > 160 || payload.synopsis.length > 2000) {
                showAlert('book-alert', 'error', 'Title or synopsis is too long.');
                return;
            }
            if (payload.testimonials.some((t) => t.length > 280)) {
                showAlert('book-alert', 'error', 'Each testimonial must be 280 characters or less.');
                return;
            }

            setButtonLoading(saveBtn, 'Saving...', true);
            try {
                await db.collection('siteContent').doc('book').set(payload, { merge: true });
                await logAdminActivity('update', 'siteContent', 'book', {
                    status: payload.status,
                    testimonials: payload.testimonials.length
                });
                refreshBookStats(payload);
                showAlert('book-alert', 'success', 'Book content saved successfully.');
            } catch (error) {
                showAlert('book-alert', 'error', 'Failed to save book content.');
            } finally {
                setButtonLoading(saveBtn, 'Saving...', false);
            }
        });

        try {
            await loadBook();
        } catch (error) {
            showAlert('book-alert', 'error', 'Could not load existing book data.');
        }
        try {
            await loadJournalSettings();
        } catch (error) {
            showAlert('journal-alert', 'error', 'Could not load journal settings.');
        }
    }

    async function initSettingsPage() {
        const saveBtn = document.getElementById('settings-save-btn');
        const fields = {
            heroHeadline: document.getElementById('settings-hero-headline'),
            heroSubheadline: document.getElementById('settings-hero-subheadline'),
            showMentorship: document.getElementById('settings-show-mentorship'),
            showCollaboration: document.getElementById('settings-show-collaboration'),
            showBook: document.getElementById('settings-show-book'),
            showTestimonials: document.getElementById('settings-show-testimonials')
        };

        async function loadSettings() {
            const snap = await db.collection('siteContent').doc('homepageControls').get();
            if (!snap.exists) return;
            const data = snap.data() || {};
            if (typeof data.heroHeadline === 'string') fields.heroHeadline.value = data.heroHeadline;
            if (typeof data.heroSubheadline === 'string') fields.heroSubheadline.value = data.heroSubheadline;
            fields.showMentorship.checked = data.showMentorship !== false;
            fields.showCollaboration.checked = data.showCollaboration !== false;
            fields.showBook.checked = data.showBook !== false;
            fields.showTestimonials.checked = data.showTestimonials !== false;
        }

        saveBtn.addEventListener('click', async () => {
            const payload = {
                heroHeadline: fields.heroHeadline.value.trim(),
                heroSubheadline: fields.heroSubheadline.value.trim(),
                showMentorship: fields.showMentorship.checked,
                showCollaboration: fields.showCollaboration.checked,
                showBook: fields.showBook.checked,
                showTestimonials: fields.showTestimonials.checked,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: sessionStorage.getItem('userEmail') || 'admin'
            };

            if (!payload.heroHeadline || !payload.heroSubheadline) {
                showAlert('settings-alert', 'error', 'Hero headline and subheadline are required.');
                return;
            }
            if (payload.heroHeadline.length > 160 || payload.heroSubheadline.length > 320) {
                showAlert('settings-alert', 'error', 'Hero copy is too long.');
                return;
            }

            setButtonLoading(saveBtn, 'Saving...', true);
            try {
                await db.collection('siteContent').doc('homepageControls').set(payload, { merge: true });
                await logAdminActivity('update', 'siteContent', 'homepageControls', {
                    showBook: payload.showBook,
                    showMentorship: payload.showMentorship,
                    showCollaboration: payload.showCollaboration,
                    showTestimonials: payload.showTestimonials
                });
                showAlert('settings-alert', 'success', 'Homepage controls saved successfully.');
            } catch (error) {
                showAlert('settings-alert', 'error', 'Failed to save settings.');
            } finally {
                setButtonLoading(saveBtn, 'Saving...', false);
            }
        });

        try {
            await loadSettings();
        } catch (error) {
            showAlert('settings-alert', 'error', 'Could not load existing settings.');
        }
    }

    async function initMentorshipPage() {
        const bodyEl = document.getElementById('mentorship-applications-body');
        const refreshBtn = document.getElementById('mentorship-refresh');
        const cohortBtn = document.getElementById('mentorship-create-cohort');

        function renderStats(applications, programs) {
            const getCount = (status) => applications.filter(a => (a.status || 'new') === status).length;
            document.getElementById('mentorship-stat-new').textContent = String(getCount('new'));
            document.getElementById('mentorship-stat-accepted').textContent = String(getCount('accepted'));
            document.getElementById('mentorship-stat-waitlisted').textContent = String(getCount('waitlisted'));
            document.getElementById('mentorship-stat-cohorts').textContent = String(programs.filter(p => p.status === 'active').length);
        }

        function rowForApplication(app) {
            const next = app.nextAction || '';
            return `
                <tr class="border-t border-slate-100">
                    <td class="px-4 py-3 font-medium text-slate-800">${app.name || 'Unknown'}</td>
                    <td class="px-4 py-3 text-slate-600">${app.email || ''}</td>
                    <td class="px-4 py-3 text-slate-600">${(app.track || 'other').replace('-', ' ')}</td>
                    <td class="px-4 py-3">
                        <select data-app-id="${app.id}" data-role="status" class="border border-slate-200 rounded px-2 py-1 text-xs">
                            <option value="new" ${app.status === 'new' ? 'selected' : ''}>New</option>
                            <option value="accepted" ${app.status === 'accepted' ? 'selected' : ''}>Accepted</option>
                            <option value="waitlisted" ${app.status === 'waitlisted' ? 'selected' : ''}>Waitlisted</option>
                            <option value="declined" ${app.status === 'declined' ? 'selected' : ''}>Declined</option>
                        </select>
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex gap-2">
                            <input data-app-id="${app.id}" data-role="next" value="${next.replace(/"/g, '&quot;')}" class="border border-slate-200 rounded px-2 py-1 text-xs w-full" placeholder="Next action">
                            <button data-app-id="${app.id}" data-role="save" class="px-2 py-1 text-xs rounded bg-slate-800 text-white">Save</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        async function loadMentorship() {
            bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Loading applications...</td></tr>';
            try {
                const [appsSnap, cohortsSnap] = await Promise.all([
                    db.collection('mentorshipApplications').orderBy('createdAt', 'desc').get(),
                    db.collection('mentorshipPrograms').get()
                ]);
                const applications = [];
                appsSnap.forEach((doc) => applications.push({ id: doc.id, ...doc.data() }));
                const programs = [];
                cohortsSnap.forEach((doc) => programs.push({ id: doc.id, ...doc.data() }));
                renderStats(applications, programs);

                if (!applications.length) {
                    bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No mentorship applications yet.</td></tr>';
                    return;
                }

                bodyEl.innerHTML = applications.map(rowForApplication).join('');
            } catch (error) {
                bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">Failed to load mentorship data.</td></tr>';
            }
        }

        bodyEl.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-role="save"]');
            if (!btn) return;
            const appId = btn.dataset.appId;
            const statusEl = bodyEl.querySelector(`[data-role="status"][data-app-id="${appId}"]`);
            const nextEl = bodyEl.querySelector(`[data-role="next"][data-app-id="${appId}"]`);
            const nextValue = nextEl ? nextEl.value.trim() : '';
            if (nextValue.length > 200) {
                showAlert('mentorship-alert', 'error', 'Next action must be 200 characters or less.');
                return;
            }
            btn.disabled = true;
            try {
                await db.collection('mentorshipApplications').doc(appId).set({
                    status: statusEl ? statusEl.value : 'new',
                    nextAction: nextValue,
                    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    reviewedBy: sessionStorage.getItem('userEmail') || 'admin'
                }, { merge: true });
                await logAdminActivity('update', 'mentorshipApplications', appId, {
                    status: statusEl ? statusEl.value : 'new'
                });
                showAlert('mentorship-alert', 'success', 'Application updated.');
                loadMentorship();
            } catch (error) {
                showAlert('mentorship-alert', 'error', 'Could not update application.');
            } finally {
                btn.disabled = false;
            }
        });

        cohortBtn.addEventListener('click', async () => {
            const cohortName = window.prompt('Enter cohort name (e.g. Winter 2026 Cohort):');
            if (!cohortName) return;
            if (cohortName.trim().length > 120) {
                showAlert('mentorship-alert', 'error', 'Cohort name must be 120 characters or less.');
                return;
            }
            try {
                const ref = await db.collection('mentorshipPrograms').add({
                    name: cohortName.trim(),
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: sessionStorage.getItem('userEmail') || 'admin'
                });
                await logAdminActivity('create', 'mentorshipPrograms', ref.id, {
                    name: cohortName.trim()
                });
                showAlert('mentorship-alert', 'success', 'Cohort created.');
                loadMentorship();
            } catch (error) {
                showAlert('mentorship-alert', 'error', 'Could not create cohort.');
            }
        });

        refreshBtn.addEventListener('click', loadMentorship);
        loadMentorship();
    }

    async function initCollaborationsPage() {
        const bodyEl = document.getElementById('collab-body');
        const formWrap = document.getElementById('collab-form-wrap');
        const toggleBtn = document.getElementById('collab-toggle-form');
        const cancelBtn = document.getElementById('collab-cancel');
        const refreshBtn = document.getElementById('collab-refresh');
        const form = document.getElementById('collab-form');

        function renderStats(leads) {
            const counts = {
                new: 0,
                discovery: 0,
                proposal: 0,
                negotiation: 0,
                won: 0,
                lost: 0
            };
            leads.forEach((lead) => {
                const stage = lead.stage || 'new';
                if (Object.prototype.hasOwnProperty.call(counts, stage)) {
                    counts[stage] += 1;
                }
            });
            Object.keys(counts).forEach((key) => {
                const el = document.getElementById(`collab-stat-${key}`);
                if (el) el.textContent = String(counts[key]);
            });
        }

        function rowForLead(lead) {
            return `
                <tr class="border-t border-slate-100">
                    <td class="px-4 py-3 font-medium text-slate-800">${lead.organization || ''}</td>
                    <td class="px-4 py-3 text-slate-600">${(lead.type || 'corporate').replace('-', ' ')}</td>
                    <td class="px-4 py-3">
                        <select data-lead-id="${lead.id}" data-role="stage" class="border border-slate-200 rounded px-2 py-1 text-xs">
                            <option value="new" ${lead.stage === 'new' ? 'selected' : ''}>New</option>
                            <option value="discovery" ${lead.stage === 'discovery' ? 'selected' : ''}>Discovery</option>
                            <option value="proposal" ${lead.stage === 'proposal' ? 'selected' : ''}>Proposal</option>
                            <option value="negotiation" ${lead.stage === 'negotiation' ? 'selected' : ''}>Negotiation</option>
                            <option value="won" ${lead.stage === 'won' ? 'selected' : ''}>Won</option>
                            <option value="lost" ${lead.stage === 'lost' ? 'selected' : ''}>Lost</option>
                        </select>
                    </td>
                    <td class="px-4 py-3 text-slate-600">R ${(Number(lead.value) || 0).toFixed(2)}</td>
                    <td class="px-4 py-3">
                        <div class="flex gap-2">
                            <input data-lead-id="${lead.id}" data-role="next" value="${(lead.nextAction || '').replace(/"/g, '&quot;')}" class="border border-slate-200 rounded px-2 py-1 text-xs w-full" placeholder="Next action">
                            <button data-lead-id="${lead.id}" data-role="save" class="px-2 py-1 text-xs rounded bg-slate-800 text-white">Save</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        async function loadLeads() {
            bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Loading collaboration leads...</td></tr>';
            try {
                const snap = await db.collection('collaborationLeads').orderBy('createdAt', 'desc').get();
                const leads = [];
                snap.forEach((doc) => leads.push({ id: doc.id, ...doc.data() }));
                renderStats(leads);
                if (!leads.length) {
                    bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No collaboration leads yet.</td></tr>';
                    return;
                }
                bodyEl.innerHTML = leads.map(rowForLead).join('');
            } catch (error) {
                bodyEl.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">Failed to load leads.</td></tr>';
            }
        }

        toggleBtn.addEventListener('click', () => {
            formWrap.classList.toggle('hidden');
        });

        cancelBtn.addEventListener('click', () => {
            form.reset();
            formWrap.classList.add('hidden');
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                organization: document.getElementById('collab-org').value.trim(),
                type: document.getElementById('collab-type').value,
                contact: document.getElementById('collab-contact').value.trim(),
                email: document.getElementById('collab-email').value.trim(),
                value: Number(document.getElementById('collab-value').value || 0),
                nextAction: document.getElementById('collab-next').value.trim(),
                stage: 'new',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: sessionStorage.getItem('userEmail') || 'admin'
            };

            if (!payload.organization) {
                showAlert('collab-alert', 'error', 'Organization is required.');
                return;
            }
            if (payload.organization.length > 160 || payload.nextAction.length > 200) {
                showAlert('collab-alert', 'error', 'Organization or next action is too long.');
                return;
            }
            if (payload.email && !isValidEmail(payload.email)) {
                showAlert('collab-alert', 'error', 'Enter a valid email address.');
                return;
            }

            try {
                const ref = await db.collection('collaborationLeads').add(payload);
                await logAdminActivity('create', 'collaborationLeads', ref.id, {
                    organization: payload.organization,
                    value: payload.value
                });
                showAlert('collab-alert', 'success', 'Collaboration lead added.');
                form.reset();
                formWrap.classList.add('hidden');
                loadLeads();
            } catch (error) {
                showAlert('collab-alert', 'error', 'Could not save lead.');
            }
        });

        bodyEl.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-role="save"]');
            if (!btn) return;
            const leadId = btn.dataset.leadId;
            const stageEl = bodyEl.querySelector(`[data-role="stage"][data-lead-id="${leadId}"]`);
            const nextEl = bodyEl.querySelector(`[data-role="next"][data-lead-id="${leadId}"]`);
            const nextValue = nextEl ? nextEl.value.trim() : '';
            if (nextValue.length > 200) {
                showAlert('collab-alert', 'error', 'Next action must be 200 characters or less.');
                return;
            }
            try {
                await db.collection('collaborationLeads').doc(leadId).set({
                    stage: stageEl ? stageEl.value : 'new',
                    nextAction: nextValue,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: sessionStorage.getItem('userEmail') || 'admin'
                }, { merge: true });
                await logAdminActivity('update', 'collaborationLeads', leadId, {
                    stage: stageEl ? stageEl.value : 'new'
                });
                showAlert('collab-alert', 'success', 'Lead updated.');
                loadLeads();
            } catch (error) {
                showAlert('collab-alert', 'error', 'Could not update lead.');
            }
        });

        refreshBtn.addEventListener('click', loadLeads);
        loadLeads();
    }

    async function initCommunityPage() {
        const bodyEl = document.getElementById('community-body');
        const formWrap = document.getElementById('community-form-wrap');
        const toggleBtn = document.getElementById('community-toggle-form');
        const cancelBtn = document.getElementById('community-cancel');
        const refreshBtn = document.getElementById('community-refresh');
        const form = document.getElementById('community-form');

        function renderStats(stories) {
            const pending = stories.filter((story) => !story.approved).length;
            const approved = stories.filter((story) => story.approved).length;
            const featured = stories.filter((story) => story.featured).length;
            const pendingEl = document.getElementById('community-stat-pending');
            const approvedEl = document.getElementById('community-stat-approved');
            const featuredEl = document.getElementById('community-stat-featured');
            if (pendingEl) pendingEl.textContent = String(pending);
            if (approvedEl) approvedEl.textContent = String(approved);
            if (featuredEl) featuredEl.textContent = String(featured);
        }

        function rowForStory(story) {
            return `
                <tr class="border-t border-slate-100">
                    <td class="px-4 py-3 font-medium text-slate-800">${story.name || 'Anonymous'}</td>
                    <td class="px-4 py-3 text-slate-600">${story.role || '-'}</td>
                    <td class="px-4 py-3 text-slate-600 max-w-lg">${story.quote || ''}</td>
                    <td class="px-4 py-3">
                        <input data-story-id="${story.id}" data-role="approved" type="checkbox" ${story.approved ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3">
                        <input data-story-id="${story.id}" data-role="featured" type="checkbox" ${story.featured ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex gap-2">
                            <button data-story-id="${story.id}" data-role="save" class="px-2 py-1 text-xs rounded bg-slate-800 text-white">Save</button>
                            <button data-story-id="${story.id}" data-role="delete" class="px-2 py-1 text-xs rounded bg-red-600 text-white">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }

        async function loadStories() {
            bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">Loading community stories...</td></tr>';
            try {
                const snap = await db.collection('communityStories').orderBy('createdAt', 'desc').get();
                const stories = [];
                snap.forEach((doc) => stories.push({ id: doc.id, ...doc.data() }));
                renderStats(stories);
                if (!stories.length) {
                    bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No stories yet.</td></tr>';
                    return;
                }
                bodyEl.innerHTML = stories.map(rowForStory).join('');
            } catch (error) {
                bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Failed to load stories.</td></tr>';
            }
        }

        toggleBtn.addEventListener('click', () => {
            formWrap.classList.toggle('hidden');
        });

        cancelBtn.addEventListener('click', () => {
            form.reset();
            formWrap.classList.add('hidden');
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                name: (document.getElementById('community-name')?.value || '').trim(),
                role: (document.getElementById('community-role')?.value || '').trim(),
                quote: (document.getElementById('community-quote')?.value || '').trim(),
                approved: false,
                featured: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: sessionStorage.getItem('userEmail') || 'admin'
            };

            if (!payload.name || !payload.quote) {
                showAlert('community-alert', 'error', 'Name and story are required.');
                return;
            }
            if (payload.name.length > 120 || payload.role.length > 120 || payload.quote.length > 600) {
                showAlert('community-alert', 'error', 'Story fields exceed allowed length.');
                return;
            }

            try {
                const ref = await db.collection('communityStories').add(payload);
                await logAdminActivity('create', 'communityStories', ref.id, {
                    name: payload.name
                });
                showAlert('community-alert', 'success', 'Story added to moderation queue.');
                form.reset();
                formWrap.classList.add('hidden');
                loadStories();
            } catch (error) {
                showAlert('community-alert', 'error', 'Could not save story.');
            }
        });

        bodyEl.addEventListener('click', async (event) => {
            const saveBtn = event.target.closest('[data-role="save"]');
            const deleteBtn = event.target.closest('[data-role="delete"]');
            if (!saveBtn && !deleteBtn) return;

            if (deleteBtn) {
                const storyId = deleteBtn.dataset.storyId;
                try {
                    await db.collection('communityStories').doc(storyId).delete();
                    await logAdminActivity('delete', 'communityStories', storyId, {});
                    showAlert('community-alert', 'success', 'Story deleted.');
                    loadStories();
                } catch (error) {
                    showAlert('community-alert', 'error', 'Could not delete story.');
                }
                return;
            }

            const storyId = saveBtn.dataset.storyId;
            const approvedEl = bodyEl.querySelector(`[data-role="approved"][data-story-id="${storyId}"]`);
            const featuredEl = bodyEl.querySelector(`[data-role="featured"][data-story-id="${storyId}"]`);
            try {
                await db.collection('communityStories').doc(storyId).set({
                    approved: !!approvedEl?.checked,
                    featured: !!featuredEl?.checked,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: sessionStorage.getItem('userEmail') || 'admin'
                }, { merge: true });
                await logAdminActivity('update', 'communityStories', storyId, {
                    approved: !!approvedEl?.checked,
                    featured: !!featuredEl?.checked
                });
                showAlert('community-alert', 'success', 'Story updated.');
                loadStories();
            } catch (error) {
                showAlert('community-alert', 'error', 'Could not update story.');
            }
        });

        refreshBtn.addEventListener('click', loadStories);
        loadStories();
    }

    async function initAnalyticsPage() {
        function pct(part, total) {
            if (!total) return '0%';
            return `${Math.round((part / total) * 100)}%`;
        }

        async function loadAnalytics() {
            try {
                const [ordersSnap, mentorshipSnap, collabSnap, storiesSnap, activitySnap] = await Promise.all([
                    db.collection('artifacts').doc('default-app-id').collection('orders').get(),
                    db.collection('mentorshipApplications').get(),
                    db.collection('collaborationLeads').get(),
                    db.collection('communityStories').get(),
                    db.collection('adminActivity').orderBy('createdAt', 'desc').limit(5).get()
                ]);

                const orders = [];
                const mentorship = [];
                const collabs = [];
                const stories = [];
                const activity = [];
                ordersSnap.forEach((doc) => orders.push(doc.data() || {}));
                mentorshipSnap.forEach((doc) => mentorship.push({ id: doc.id, ...doc.data() }));
                collabSnap.forEach((doc) => collabs.push({ id: doc.id, ...doc.data() }));
                storiesSnap.forEach((doc) => stories.push({ id: doc.id, ...doc.data() }));
                activitySnap.forEach((doc) => activity.push({ id: doc.id, ...doc.data() }));

                const now = new Date();
                const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const revenue30d = orders.reduce((sum, order) => {
                    const amount = Number(order.total || order.totalAmount || 0) || 0;
                    const ts = order.createdAt?.toDate ? order.createdAt.toDate() : null;
                    if (!ts || ts >= cutoff) return sum + amount;
                    return sum;
                }, 0);

                const accepted = mentorship.filter((m) => m.status === 'accepted').length;
                const waitlisted = mentorship.filter((m) => m.status === 'waitlisted').length;
                const won = collabs.filter((c) => c.stage === 'won').length;

                const revenueEl = document.getElementById('analytics-revenue');
                const mentorshipEl = document.getElementById('analytics-mentorship-leads');
                const collabEl = document.getElementById('analytics-collab-leads');
                const communityEl = document.getElementById('analytics-community-stories');
                if (revenueEl) revenueEl.textContent = `R${revenue30d.toFixed(2)}`;
                if (mentorshipEl) mentorshipEl.textContent = String(mentorship.length);
                if (collabEl) collabEl.textContent = String(collabs.length);
                if (communityEl) communityEl.textContent = String(stories.length);

                const accEl = document.getElementById('analytics-mentorship-acceptance');
                const waitEl = document.getElementById('analytics-mentorship-waitlist');
                const winEl = document.getElementById('analytics-collab-win-rate');
                if (accEl) accEl.textContent = pct(accepted, mentorship.length);
                if (waitEl) waitEl.textContent = pct(waitlisted, mentorship.length);
                if (winEl) winEl.textContent = pct(won, collabs.length);

                const activityEl = document.getElementById('analytics-activity');
                if (activityEl) {
                    if (activity.length) {
                        activityEl.innerHTML = activity.map((item) => {
                            const action = item.action || 'update';
                            const targetType = item.targetType || 'record';
                            const actor = item.actor || 'admin';
                            const ts = item.createdAt?.toDate ? item.createdAt.toDate() : null;
                            const datePart = ts ? ts.toLocaleString() : 'just now';
                            return `<li>${actor} ${action} ${targetType} (${datePart})</li>`;
                        }).join('');
                    } else {
                        const lines = [];
                        lines.push(`Mentorship accepted: ${accepted} of ${mentorship.length}`);
                        lines.push(`Collaborations won: ${won} of ${collabs.length}`);
                        lines.push(`Approved community stories: ${stories.filter((s) => s.approved).length}`);
                        activityEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
                    }
                }
            } catch (error) {
                showAlert('analytics-alert', 'error', 'Failed to load analytics data.');
            }
        }

        const refreshBtn = document.getElementById('analytics-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadAnalytics);
        }
        loadAnalytics();
    }

    async function initActivityPage() {
        const bodyEl = document.getElementById('activity-body');
        const refreshBtn = document.getElementById('activity-refresh');
        const exportBtn = document.getElementById('activity-export');
        const searchEl = document.getElementById('activity-search');
        const actionFilterEl = document.getElementById('activity-filter-action');
        const targetFilterEl = document.getElementById('activity-filter-target');
        const actorFilterEl = document.getElementById('activity-filter-actor');

        let allRows = [];

        function escHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function escCsv(value) {
            const safe = String(value || '').replace(/"/g, '""');
            return `"${safe}"`;
        }

        function applyFilters(rows) {
            const q = (searchEl?.value || '').trim().toLowerCase();
            const action = actionFilterEl?.value || 'all';
            const target = targetFilterEl?.value || 'all';
            const actor = actorFilterEl?.value || 'all';

            return rows.filter((row) => {
                if (action !== 'all' && row.action !== action) return false;
                if (target !== 'all' && row.targetType !== target) return false;
                if (actor !== 'all' && row.actor !== actor) return false;
                if (!q) return true;

                const detailsText = row.details ? JSON.stringify(row.details) : '';
                const blob = `${row.actor} ${row.action} ${row.targetType} ${row.targetId} ${detailsText}`.toLowerCase();
                return blob.includes(q);
            });
        }

        function renderFilters(rows) {
            const actions = [...new Set(rows.map((row) => row.action).filter(Boolean))].sort();
            const targets = [...new Set(rows.map((row) => row.targetType).filter(Boolean))].sort();
            const actors = [...new Set(rows.map((row) => row.actor).filter(Boolean))].sort();

            const fillSelect = (el, values) => {
                if (!el) return;
                const current = el.value || 'all';
                const options = ['<option value="all">All</option>']
                    .concat(values.map((v) => `<option value="${escHtml(v)}">${escHtml(v)}</option>`));
                el.innerHTML = options.join('');
                el.value = values.includes(current) || current === 'all' ? current : 'all';
            };

            fillSelect(actionFilterEl, actions);
            fillSelect(targetFilterEl, targets);
            fillSelect(actorFilterEl, actors);
        }

        function renderRows() {
            const rows = applyFilters(allRows);
            const countEl = document.getElementById('activity-count');
            if (countEl) countEl.textContent = String(rows.length);

            if (!rows.length) {
                bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No activity found for current filters.</td></tr>';
                return;
            }

            bodyEl.innerHTML = rows.slice(0, 200).map((row) => {
                const timeText = row.createdAt ? row.createdAt.toLocaleString() : 'Unknown';
                const detailsText = row.details && Object.keys(row.details).length
                    ? escHtml(JSON.stringify(row.details))
                    : '-';
                return `
                    <tr class="border-t border-slate-100">
                        <td class="px-4 py-3 text-slate-600">${escHtml(timeText)}</td>
                        <td class="px-4 py-3 font-medium text-slate-800">${escHtml(row.actor)}</td>
                        <td class="px-4 py-3 text-slate-600">${escHtml(row.action)}</td>
                        <td class="px-4 py-3 text-slate-600">${escHtml(row.targetType)}</td>
                        <td class="px-4 py-3 text-slate-600">${escHtml(row.targetId)}</td>
                        <td class="px-4 py-3 text-slate-600">${detailsText}</td>
                    </tr>
                `;
            }).join('');
        }

        function exportCsv() {
            const rows = applyFilters(allRows);
            const lines = [
                ['Timestamp', 'Actor', 'Action', 'Target Type', 'Target ID', 'Details'].map(escCsv).join(',')
            ];

            rows.forEach((row) => {
                lines.push([
                    row.createdAt ? row.createdAt.toISOString() : '',
                    row.actor || '',
                    row.action || '',
                    row.targetType || '',
                    row.targetId || '',
                    row.details ? JSON.stringify(row.details) : ''
                ].map(escCsv).join(','));
            });

            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `admin-activity-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        async function loadActivity() {
            bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">Loading activity...</td></tr>';
            try {
                const snap = await db.collection('adminActivity').orderBy('createdAt', 'desc').limit(1000).get();
                allRows = [];
                snap.forEach((doc) => {
                    const data = doc.data() || {};
                    allRows.push({
                        id: doc.id,
                        actor: data.actor || 'admin',
                        action: data.action || 'update',
                        targetType: data.targetType || 'record',
                        targetId: data.targetId || '',
                        details: data.details || {},
                        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null
                    });
                });
                renderFilters(allRows);
                renderRows();
            } catch (error) {
                bodyEl.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">Failed to load activity logs.</td></tr>';
            }
        }

        [searchEl, actionFilterEl, targetFilterEl, actorFilterEl].forEach((el) => {
            if (!el) return;
            el.addEventListener('input', renderRows);
            el.addEventListener('change', renderRows);
        });

        if (refreshBtn) refreshBtn.addEventListener('click', loadActivity);
        if (exportBtn) exportBtn.addEventListener('click', exportCsv);
        loadActivity();
    }

    function boot() {
        const path = window.location.pathname.toLowerCase();
        if (!initFirebase()) {
            return;
        }
        guardAdmin();

        if (path.includes('admin-book.html')) {
            initBookPage();
            return;
        }
        if (path.includes('admin-settings.html')) {
            initSettingsPage();
            return;
        }
        if (path.includes('admin-mentorship.html')) {
            initMentorshipPage();
            return;
        }
        if (path.includes('admin-collaborations.html')) {
            initCollaborationsPage();
            return;
        }
        if (path.includes('admin-community.html')) {
            initCommunityPage();
            return;
        }
        if (path.includes('admin-analytics.html')) {
            initAnalyticsPage();
            return;
        }
        if (path.includes('admin-activity.html')) {
            initActivityPage();
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
