(function () {
    const firebaseConfig = {
        apiKey: 'AIzaSyBVpuDI_YJI7mxtT6-igSL7ZX3s-cqMRnc',
        authDomain: 'disciplined-disciples-1.firebaseapp.com',
        projectId: 'disciplined-disciples-1',
        storageBucket: 'disciplined-disciples-1.firebasestorage.app',
        messagingSenderId: '565996965931',
        appId: '1:565996965931:web:b9d18489caa790e7afda6e'
    };

    let db;

    function initFirebase() {
        if (!window.firebase) return false;
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        return true;
    }

    function showAlert(type, message) {
        const alertEl = document.getElementById('mentorship-apply-alert');
        if (!alertEl) return;
        const styleMap = {
            success: 'background:#ecfdf5;border:1px solid #86efac;color:#166534;',
            error: 'background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;',
            info: 'background:#eff6ff;border:1px solid #93c5fd;color:#1d4ed8;'
        };
        alertEl.classList.remove('hidden');
        alertEl.setAttribute('style', (alertEl.getAttribute('style') || '').replace(/background:[^;]+;|border:[^;]+;|color:[^;]+;/g, '') + (styleMap[type] || styleMap.info));
        alertEl.textContent = message;
    }

    function setSubmitting(isSubmitting) {
        const btn = document.getElementById('mentorship-submit-btn');
        if (!btn) return;
        if (isSubmitting) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = 'Submitting...';
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
        } else {
            btn.textContent = btn.dataset.originalText || 'Submit Application';
            btn.disabled = false;
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
    }

    async function submitApplication(event) {
        event.preventDefault();
        const payload = {
            name: (document.getElementById('mentorship-name')?.value || '').trim(),
            email: (document.getElementById('mentorship-email')?.value || '').trim(),
            phone: (document.getElementById('mentorship-phone')?.value || '').trim(),
            track: document.getElementById('mentorship-track')?.value || 'other',
            goal: (document.getElementById('mentorship-goal')?.value || '').trim(),
            status: 'new',
            source: 'mentorship-page',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!payload.name || !payload.email || !payload.goal) {
            showAlert('error', 'Please complete your name, email, and goal before submitting.');
            return;
        }
        if (!isValidEmail(payload.email)) {
            showAlert('error', 'Please enter a valid email address.');
            return;
        }
        if (payload.name.length > 120 || payload.phone.length > 40 || payload.goal.length > 3000) {
            showAlert('error', 'One or more fields are too long.');
            return;
        }

        setSubmitting(true);
        try {
            await db.collection('mentorshipApplications').add(payload);
            event.target.reset();
            showAlert('success', 'Application submitted successfully. We will get back to you soon.');
        } catch (error) {
            showAlert('error', 'Could not submit your application right now. Please try again shortly.');
        } finally {
            setSubmitting(false);
        }
    }

    function boot() {
        if (!initFirebase()) {
            return;
        }
        const form = document.getElementById('mentorship-apply-form');
        if (form) {
            form.addEventListener('submit', submitApplication);
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
