// Global Firebase variables, explicitly declared on window for unambiguous global access
window.app = null;
window.auth = null;
window.db = null;
window.currentUserId = null; // To store the logged-in user's UID
window.currentUserProfile = {}; // To store user profile data including address
window.serverTimestamp = null; // To store Firestore's serverTimestamp function

const ADMIN_EMAILS = ['zmabege@gmail.com', 'nomaqhizazolile@gmail.com'];

function isAdminEmail(candidate) {
    if (!candidate) {
        return false;
    }

    const normalized = String(candidate).trim().toLowerCase();
    return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase() === normalized);
}

let resolveFirebaseInitialized = null;
let firebaseInitializationPromise = new Promise(resolve => {
    resolveFirebaseInitialized = resolve;
});
let firebaseInitializationResult = null;

// Maintain legacy promise reference used by other scripts/pages
window.firebaseInitialized = firebaseInitializationPromise;

function settleFirebaseInitialization(result) {
    firebaseInitializationResult = result;
    if (resolveFirebaseInitialized) {
        resolveFirebaseInitialized(result);
        resolveFirebaseInitialized = null;
    }
}

async function waitForFirebaseReady(timeoutMs = 10000) {
    if (firebaseInitializationResult !== null) {
        return firebaseInitializationResult;
    }

    if (window.auth && window.db) {
        firebaseInitializationResult = true;
        return true;
    }

    if (!firebaseInitializationPromise) {
        firebaseInitializationPromise = new Promise(resolve => {
            resolveFirebaseInitialized = resolve;
        });
        window.firebaseInitialized = firebaseInitializationPromise;
    }

    if (timeoutMs === Infinity || timeoutMs <= 0) {
        const result = await firebaseInitializationPromise;
        firebaseInitializationResult = typeof result === 'boolean' ? result : true;
        return firebaseInitializationResult;
    }

    let timerId = null;
    const timeoutPromise = new Promise(resolve => {
        timerId = setTimeout(() => resolve(false), timeoutMs);
    });

    const result = await Promise.race([firebaseInitializationPromise, timeoutPromise]);
    if (timerId) {
        clearTimeout(timerId);
    }

    if (typeof result === 'boolean') {
        firebaseInitializationResult = result;
        return result;
    }

    firebaseInitializationResult = true;
    return true;
}

const ORDER_STATUS_TEMPLATES = Object.freeze({
    pendingPayment: {
        key: 'pending_payment',
        status: 'Awaiting Payment',
        label: 'Awaiting payment',
        icon: '⌛',
        buttonLabel: '⌛ Awaiting payment',
        message: 'We have received your order and are awaiting payment confirmation.',
        statusMessage: 'Awaiting payment confirmation from your bank.'
    },
    orderPlaced: {
        key: 'order_placed',
        status: 'Order Placed',
        label: 'Order placed',
        icon: '🎉',
        buttonLabel: '🎉 Order placed',
        message: 'Your order is confirmed and is being prepared for dispatch.',
        statusMessage: 'Your order has been confirmed and will be on its way soon.'
    },
    outForDelivery: {
        key: 'out_for_delivery',
        status: 'Out for Delivery',
        label: 'Out for delivery',
        icon: '🚚',
        buttonLabel: '🚚 Out for delivery',
        message: 'Great news! Your order is on the way.',
        statusMessage: 'Your order has left our warehouse and is heading to you.'
    },
    eta: {
        key: 'eta',
        status: 'Arriving Soon',
        label: 'Share ETA',
        icon: '🗓️',
        buttonLabel: '🗓️ Share ETA',
        message: 'Your order is on track and should arrive {{eta}}.',
        statusMessage: 'Your delivery is on track for {{eta}}.',
        requiresInput: {
            field: 'eta',
            prompt: 'When should the customer expect their parcel?',
            placeholderFallback: 'soon'
        }
    },
    delivered: {
        key: 'delivered',
        status: 'Delivered',
        label: 'Delivered',
        icon: '🎁',
        buttonLabel: '🎁 Mark delivered',
        message: 'Your order has arrived. We hope you love it!',
        statusMessage: 'Order delivered successfully.'
    },
    cancelled: {
        key: 'cancelled',
        status: 'Cancelled',
        label: 'Cancelled',
        icon: '⚠️',
        buttonLabel: '⚠️ Cancel order',
        message: 'Your order has been cancelled. Please contact support if this was unexpected.',
        statusMessage: 'Order cancelled at your request.'
    }
});

window.ORDER_STATUS_TEMPLATES = ORDER_STATUS_TEMPLATES;

function escapeHtml(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function quoteCsv(value) {
    const text = value === undefined || value === null ? '' : String(value);
    const escaped = text.replace(/"/g, '""');
    if (/[",\n\r]/.test(escaped)) {
        return `"${escaped}"`;
    }
    return escaped;
}

function coerceToDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') {
            try {
                const converted = value.toDate();
                return Number.isNaN(converted.getTime()) ? null : converted;
            } catch (error) {
                console.warn('Failed to convert Firestore timestamp via toDate:', error);
            }
        }

        if (typeof value.seconds === 'number') {
            const millis = value.seconds * 1000 + (value.nanoseconds || value.nanosecond || 0) / 1e6;
            const timestampDate = new Date(millis);
            return Number.isNaN(timestampDate.getTime()) ? null : timestampDate;
        }
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
        return 'R0.00';
    }
    return `R${amount.toFixed(2)}`;
}

function formatDate(value, options) {
    const date = coerceToDate(value);
    if (!date) {
        return 'N/A';
    }

    try {
        return date.toLocaleDateString('en-ZA', options || {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        console.warn('Failed to format date:', error);
        return date.toISOString().split('T')[0];
    }
}

let cachedPrimaryLogoDataUrl = null;

async function getPrimaryLogoDataUrl(preferredSelectors) {
    if (cachedPrimaryLogoDataUrl) {
        return cachedPrimaryLogoDataUrl;
    }

    const selectorsSource = Array.isArray(preferredSelectors)
        ? preferredSelectors.slice()
        : (preferredSelectors ? [preferredSelectors] : []);
    const fallbackSelectors = ['[data-brand-logo]', '[data-admin-logo]'];
    const selectors = selectorsSource.concat(fallbackSelectors).filter(Boolean);

    for (const selector of selectors) {
        const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!element) {
            continue;
        }

        try {
            const dataUrl = await convertImageElementToDataUrl(element);
            if (dataUrl) {
                cachedPrimaryLogoDataUrl = dataUrl;
                return dataUrl;
            }
        } catch (error) {
            console.warn('Unable to convert logo element to data URL:', error);
        }
    }

    return null;
}

async function convertImageElementToDataUrl(element) {
    if (!(element instanceof HTMLImageElement)) {
        return null;
    }

    await ensureImageElementLoaded(element);

    const width = element.naturalWidth || element.width;
    const height = element.naturalHeight || element.height;

    if (!width || !height) {
        throw new Error('Logo image has invalid dimensions.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(element, 0, 0, width, height);
    return canvas.toDataURL('image/png');
}

function ensureImageElementLoaded(img) {
    if (!(img instanceof HTMLImageElement)) {
        return Promise.resolve();
    }

    if (img.complete && img.naturalWidth) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            img.removeEventListener('load', handleLoad);
            img.removeEventListener('error', handleError);
        };

        const handleLoad = () => {
            cleanup();
            resolve();
        };

        const handleError = () => {
            cleanup();
            reject(new Error('Failed to load logo image.'));
        };

        img.addEventListener('load', handleLoad, { once: true });
        img.addEventListener('error', handleError, { once: true });
    });
}

function hexToRgb(hex) {
    if (!hex) {
        return { r: 0, g: 0, b: 0 };
    }

    let sanitized = String(hex).replace('#', '').trim();
    if (sanitized.length === 3) {
        sanitized = sanitized.split('').map((char) => char + char).join('');
    }

    if (sanitized.length !== 6) {
        return { r: 0, g: 0, b: 0 };
    }

    const numeric = Number.parseInt(sanitized, 16);
    if (Number.isNaN(numeric)) {
        return { r: 0, g: 0, b: 0 };
    }

    return {
        r: (numeric >> 16) & 255,
        g: (numeric >> 8) & 255,
        b: numeric & 255
    };
}

function renderTemplateString(templateString, data = {}) {
    if (!templateString) {
        return '';
    }

    return templateString.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
        const value = data[key];
        if (value === undefined || value === null) {
            return '';
        }
        return String(value);
    });
}

function formatDeliveryAddress(address) {
    if (!address) {
        return '';
    }

    if (typeof address === 'string') {
        return address.trim();
    }

    const parts = [];

    const pushPart = (value) => {
        if (!value) {
            return;
        }
        const text = String(value).trim();
        if (text) {
            parts.push(text);
        }
    };

    pushPart(address.line1);
    pushPart(address.line2);
    pushPart(address.city);
    pushPart(address.province || address.state || address.region);
    pushPart(address.postalCode || address.postal_code || address.zip);
    pushPart(address.country);

    if (!parts.length && typeof address === 'object') {
        Object.keys(address).forEach((key) => {
            if (['name', 'phone', 'phoneNumber', 'contact', 'email'].includes(key)) {
                return;
            }
            pushPart(address[key]);
        });
    }

    return parts.join(', ');
}

function buildStatusUpdatePayload(template, context = {}, overrides = {}, actor = {}) {
    if (!template) {
        throw new Error('Status template is required to build an update payload.');
    }

    const now = new Date();
    const timestamp = window.serverTimestamp ? window.serverTimestamp() : now;
    const resolvedContext = Object.assign(
        {
            customerName: context.customerName || context.name || context.email || 'Customer',
            eta: overrides.eta || context.estimatedArrivalText || 'soon',
            orderId: context.orderId || context.docId || '',
            trackingNumber: context.trackingNumber || ''
        },
        context,
        overrides
    );

    const amount = Number(resolvedContext.totalAmount);
    if (Number.isFinite(amount)) {
        resolvedContext.totalAmountFormatted = `R${amount.toFixed(2)}`;
    }

    const templateString = template.customerMessage || template.message || template.statusMessage || '';
    const resolvedMessage = templateString
        ? renderTemplateString(templateString, resolvedContext)
        : (template.statusMessage || template.label || template.status || '');

    const historyEntry = {
        statusKey: template.key,
        status: template.status || template.label || '',
        label: template.label || template.status || '',
        icon: template.icon || '',
        message: resolvedMessage,
        createdAt: now.toISOString ? now.toISOString() : now,
        updatedAt: now.toISOString ? now.toISOString() : now,
        updatedBy: actor.email || actor.uid || 'system'
    };

    const payload = {
        status: template.status || template.label || '',
        statusKey: template.key,
        statusLabel: template.label || template.status || '',
        statusIcon: template.icon || '',
        statusMessage: resolvedMessage,
        lastCustomerMessage: resolvedMessage,
        updatedAt: timestamp,
        statusUpdatedAt: timestamp,
        lastCustomerMessageAt: timestamp,
        updatedBy: actor.email || actor.uid || 'system'
    };

    const historySource = Array.isArray(context.statusHistory) ? context.statusHistory.slice() : [];
    historySource.push(historyEntry);

    const noteEntry = Object.assign({ type: 'status' }, historyEntry);
    const notesSource = Array.isArray(context.notes) ? context.notes.slice() : [];
    notesSource.push(noteEntry);

    if (window.arrayUnion) {
        payload.statusHistory = window.arrayUnion(historyEntry);
        payload.notes = window.arrayUnion(noteEntry);
    } else {
        payload.statusHistory = historySource;
        payload.notes = notesSource;
    }

    if (template.key === 'order_placed') {
        payload.paymentStatus = 'Paid';
        payload.paymentCompletedAt = timestamp;
    }

    if (template.key === 'pending_payment') {
        payload.paymentStatus = 'Pending Payment';
    }

    if (template.key === 'delivered') {
        payload.deliveredAt = timestamp;
        payload.paymentStatus = context.paymentStatus || 'Paid';
    }

    if (template.requiresInput && overrides && overrides.eta) {
        payload.estimatedArrivalText = overrides.eta;
    }

    return {
        payload,
        message: resolvedMessage,
        historyEntry
    };
}

const AWAITING_PAYMENT_EXPIRY_DAYS = 7;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function includesAwaitingPaymentStatus(value) {
    if (!value) {
        return false;
    }
    const normalized = String(value).toLowerCase();
    return normalized.includes('awaiting payment') || normalized.includes('pending payment') || normalized === 'pending_payment';
}

function isAwaitingPaymentOrder(orderLike) {
    if (!orderLike) {
        return false;
    }

    return [
        orderLike.status,
        orderLike.statusLabel,
        orderLike.statusKey,
        orderLike.paymentStatus
    ].some(includesAwaitingPaymentStatus);
}

function isAwaitingPaymentExpired(orderLike) {
    if (!isAwaitingPaymentOrder(orderLike)) {
        return false;
    }

    const orderDate = coerceToDate(orderLike.orderDate);
    if (!orderDate) {
        return false;
    }

    const ageMs = Date.now() - orderDate.getTime();
    return ageMs > AWAITING_PAYMENT_EXPIRY_DAYS * MILLIS_PER_DAY;
}

// Global Firebase configuration and authentication token provided by the environment
// IMPORTANT: If deploying this code outside of a Canvas environment where __firebase_config is not injected,
// you MUST replace the empty object `{}` with your actual Firebase project configuration.
// Get this from your Firebase project settings -> Your apps -> Web app -> Config.
// It should be a JavaScript object, NOT a JSON string.
const firebaseConfig = {
  apiKey: "AIzaSyBVpuDI_YJI7mxtT6-igSL7ZX3s-cqMRnc",
  authDomain: "disciplined-disciples-1.firebaseapp.com",
  projectId: "disciplined-disciples-1",
  storageBucket: "disciplined-disciples-1.firebasestorage.app",
  messagingSenderId: "565996965931",
  appId: "1:565996965931:web:b9d18489caa790e7afda6e",
  measurementId: "G-2J1GWH59V4"
};

window.app = window.firebase.initializeApp(firebaseConfig);
window.auth = window.firebase.auth();
window.db = window.firebase.firestore();
window.serverTimestamp = window.firebase.firestore.FieldValue.serverTimestamp;
window.fieldValue = window.firebase.firestore.FieldValue;
window.arrayUnion = window.firebase.firestore.FieldValue.arrayUnion;

// Set Firebase Auth persistence to LOCAL (persists across browser sessions)
window.auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
        console.log('Firebase Auth persistence set to LOCAL');
    })
    .catch((error) => {
        console.error('Error setting Firebase Auth persistence:', error);
    });

// Expose Firebase auth functions to window for login-signup.html
window.onAuthStateChanged = window.firebase.auth().onAuthStateChanged.bind(window.firebase.auth());
window.signInWithEmailAndPassword = window.firebase.auth().signInWithEmailAndPassword.bind(window.firebase.auth());
window.createUserWithEmailAndPassword = window.firebase.auth().createUserWithEmailAndPassword.bind(window.firebase.auth());
window.signOut = window.firebase.auth().signOut.bind(window.firebase.auth());

// Auth state listener will be set up in initFirebase() after all functions are defined

// === NEW DIAGNOSTIC LOG ===
console.log("firebaseConfig loaded:", firebaseConfig);
console.log("firebaseConfig keys count:", Object.keys(firebaseConfig).length);
console.log("firebaseConfig.apiKey present:", !!firebaseConfig.apiKey);
// ==========================

// --- Global Authentication Functions ---
async function handleLogout() {
    const notify = typeof showMessage === 'function' ? showMessage : (msg) => window.alert(msg);

    try {
        if (window.auth && typeof window.auth.signOut === 'function') {
            await window.auth.signOut();
        } else if (window.firebase?.auth && typeof window.firebase.auth().signOut === 'function') {
            await window.firebase.auth().signOut();
        }

        sessionStorage.removeItem('userLoggedIn');
        sessionStorage.removeItem('userId');

        notify('Logged out successfully.', 'success');

        setTimeout(() => {
            const redirectTarget = window.location.pathname.includes('admin-dashboard.html')
                ? 'login-signup.html?redirect=admin-dashboard.html'
                : 'index.html';
            window.location.replace(redirectTarget);
        }, 350);
    } catch (error) {
        console.error('Logout error:', error);
        notify('Logout failed. Please try again.', 'error');
    }
}

// --- Product Data (Hardcoded for now - will come from Firestore/Backend later) ---
const products = [
    {
        id: 'hoodie',
        name: 'Faith Hoodie',
        price: 649.00,
        category: 'hoodie', // <--- Add this
        displayImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb53d0e.jpg',
        description: 'Representing warmth and comfort in the journey of disciplined living. Made from premium, soft-touch fabric for ultimate comfort and durability.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb53d0e.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb5c3fb.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-2-6898d6eb47f0b.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-back-6898d6eb52300.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-back-6898d6eb48eaf.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-left-front-6898d6eb612e0.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-right-front-6898d6eb66caa.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-zoomed-in-6898d6eb73758.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-product-details-6898d6eb317e2.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-left-front-6898d6eb6a7e5.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb36e77.jpg?size=small'
                    ]
                },
                'Maroon': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd7272343.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd727c49b.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd727095f.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-back-6898dd72819fe.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-back-6898dd729610d.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-left-6898dd728873b.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-right-front-6898dd72382d8.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-zoomed-in-6898dd722bebf.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-product-details-6898dd72279d8.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd722f6b6.jpg?size=small',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-2-6898dd7298a94.jpg'
                    ]
                },
                'Green': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27dba00b.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27e4a0dd.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27c800a6.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-back-6898e27d7ea61.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd77e06c2.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-back-6898dd7758566.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd76a466d.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-back-6898e27dafc8a.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd78b290f.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd76853fb.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27e16ff9.jpg'

                    ]
                },
                'Purple': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd75e5070.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd742d62b.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd747b062.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd759da14.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-left-6898dd7637434.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-left-front-6898dd7593dfa.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-product-details-6898dd75327de.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-right-front-6898dd75be2d5.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd7567dbc.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-zoomed-in-6898e27b36e88.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd74787de.jpg'
                    ]
                },
                'Royal Blue': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e27913bcb.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e279ec606.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e2791f527.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e2792ec16.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e27921e96.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-left-front-6898e279c3e48.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-product-details-6898dd73c4e8e.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-right-6898dd72bd2cf.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e2791b7dd.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-right-front-6898e279418a9.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-back-6898e27a16159.jpg'
                    
                    ]
                }
            },
            sizes: ['S', 'M', 'L', 'XL', 'XXL']
        }
    },
    {
        id: 'cap',
        name: 'Discipline Cap',
        price: 249.00,
        category: 'cap', // <--- Add this
        displayImage: 'Assets/Products/Caps/IMG-20250810-WA0005.jpg',
        description: 'A symbol of casual, everyday discipline. Perfect for any occasion.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Caps/IMG-20250810-WA0004.jpg',
                    images: [
                        'Assets/Products/Caps/IMG-20250810-WA0013.jpg',
                        'Assets/Products/Caps/IMG-20250810-WA0014.jpg',
                        
                    ]
                },
                'White': {
                    defaultImage: 'Assets/Products/Caps/IMG-20250810-WA0002.jpg',
                    images: [
                        'Assets/Products/Caps/IMG-20250810-WA0011 (1).jpg',
                        'Assets/Products/Caps/IMG-20250810-WA0010.jpg',
                        
                    ]
                },
                'Blue': {
                    defaultImage: 'Assets/Products/Caps/IMG-20250810-WA0001.jpg',
                    images: [
                        'Assets/Products/Caps/IMG-20250810-WA0001.jpg',
                        'Assets/Products/Caps/IMG-20250810-WA0001.jpg',
                        
                    ]
                },
                'Green': {
                    defaultImage: 'Assets/Other/WhatsApp Image 2025-09-28 at 12.08.00_71ef19fa.jpg',
                    images: [
                        'Assets/Other/WhatsApp Image 2025-09-28 at 12.06.24_c8914fa8.jpg',
                        'Assets/Other/WhatsApp Image 2025-09-28 at 12.08.00_71ef19fa.jpg',
                        
                    ]
                },
                'Pink': {
                    defaultImage: 'Assets/Products/Caps/IMG-20250810-WA0003.jpg',
                    images: [
                        'Assets/Other/WhatsApp Image 2025-09-28 at 12.08.01_503b73c2.jpg',
                        'Assets/Other/WhatsApp Image 2025-09-28 at 12.06.24_32158261.jpg',
                        'Assets/Other/WhatsApp Image 2025-09-28 at 12.06.23_a5a6943c.jpg'
                    ]
                },
                'Red': {
                    defaultImage: 'Assets/Products/Caps/IMG-20250810-WA0005.jpg',
                    images: [
                        'Assets/Products/Caps/IMG-20250810-WA0007.jpg',
                        'Assets/Products/Caps/IMG-20250810-WA0008.jpg',
                    
                    ]
                }
            },
            sizes: ['One Size']
        }
    },
    {
        id: 'normal-tee',
        name: 'Foundation Tee',
    price: 1.00,
        category: 'tee', // <-- add this if missing
        displayImage: 'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c91f11.jpg',
        description: 'Simple, yet powerful statements of one\'s values. A classic fit for everyday wear.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c93a6c.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c93fa2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c95a31.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-and-back-6898f24c990f6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-and-back-6898f24c98b08.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c926ba.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-6898f24c91105.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-left-6898f24c96f33.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-2-6898f24c935d7.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-right-6898f24c97490.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-front-2-6898f24c94c3c.jpg'
                    ]
                },
                'White': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f0127d4ec.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f012a3d3a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f012ba801.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-and-back-6898f0130a557.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f01284d2a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f012b2eff.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-back-6898f012d1188.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-back-2-6898f013029a3.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-2-6898f012ab692.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f0128c656.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-right-6898f012e01dd.jpg'
                    ]
                },
                'Pink': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010bd401.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010dcf78.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010ec1bd.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-and-back-6898f01122383.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010e772e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010cf5c3.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010e772e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-back-6898f01106182.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-back-2-6898f0111d880.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-2-6898f010e2c42.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010ca78e.jpg'                    
                    ]
                },
                'Red': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fbfa93.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fc0cac.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fc19a3.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-and-back-6898f00fc47fa.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fc153a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fbf15b.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-2-6898f00fc10fb.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-2-6898f00fc086e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-back-6898f00fc1eb6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-left-6898f00fc2dc4.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-right-6898f00fc32c2.jpg'
                    ]
                },
                'Blue': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f01126e9b.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f01141d54.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f011519e4.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-and-back-6898f0118213f.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f0114c50a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-back-6898f0115c384.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-2-6898f0113c9c7.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-2-6898f01147099.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f01126e9b.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-left-6898f01166d1f.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-right-6898f0116c109.jpg'
                    ]
                },
                'Light Blue': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01035b16.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f0105e9bf.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f0106e0ff.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01051a32.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-and-back-6898f010712b8.jpg',    
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-2-6898f0104b3e0.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-back-6898f0106af27.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f0104e7ef.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01035b16.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01067d9e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-left-6898f0105adbd.jpg',
                        
                        

                    ]
                },
                'Light Green': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01074455.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01087d12.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01093f97.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f010802ba.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-and-back-6898f010b8fc2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f0107c407.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-2-6898f0108ba04.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-back-6898f0109c5bd.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-back-6898f010a0497.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f0108f6fa.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-left-6898f010a4c1e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-right-6898f010a8b8e.jpg'
                    ]
                },
                'Light Pink': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f01201ce6.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f012238d2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f01237978.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-and-back-6898f0127696e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f01230f0c.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-2-6898f0122a3f6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-back-6898f0124ccc6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f0120f33f.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f012087d5.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-back-6898f01245a6c.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-back-2-6898f0126fcc5.jpg'
                        
                    ]
                },
                'Green': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00fdb53a.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00ff0050.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f010031b2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-and-back-6898f01004de2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00fdb53a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-2-6898f00fe59f7.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00fdd179.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00fe9144.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-back-6898f00fead0a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-back-6898f010015e2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-left-6898f00fee46c.jpg'
                    ]
                },
                'Yellow': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f0118846a.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011d25c6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011ea388.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f0118e73e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-and-back-6898f011f0140.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-left-6898f011cc3cc.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011de58b.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011b33bd.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011b9667.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-2-6898f011d8668.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-back-6898f011bfac2.jpg'

                    ]
                }
            },
            sizes: ['S', 'M', 'L', 'XL']
        }
    },
    {
        id: 'oversized-tee',
        name: 'Kingdom Oversized Tee',
        price: 449.00,
        category: 'oversized-tee', // <-- add this if missing
        displayImage: 'Assets/Other/WhatsApp Image 2025-09-28 at 12.08.01_503b73c2.jpg',
        description: 'For those who embrace comfort without compromising on style or conviction.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-front-6898e814f093a.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-front-6898e814f03ab.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-front-6898e814f05fa.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-back-6898e814f14af.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-back-6898e814f17da.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-left-6898e814f11cf.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-left-front-6898e814f207d.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-zoomed-in-6898e814f1a0d.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-product-details-2-6898e814f1b2f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-right-6898e814f1e56.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-right-front-6898e814f1f5a.jpg'
                    ]
                },
                'White': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-front-6898eb2686ba9.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-front-6898eb2683ffa.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-front-6898eb268598e.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-back-6898eb268c699.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-back-6898eb268ba0b.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-left-6898eb2689fca.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-right-6898eb268a698.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-zoomed-in-6898eb268cced.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-product-details-2-6898eb268d32b.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-left-front-6898eb2690056.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-left-front-2-6898eb2690b96.jpg'
                    ]
                },
                'Navy': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f347a.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-2-6898e814f2b50.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f2e0c.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f347a.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f3968.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-zoomed-in-6898e815033ee.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-right-6898e81502110.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-back-6898e8150244f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-back-6898e81502e4c.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-left-6898e81501bb2.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-left-front-6898e81501042.jpg'
                        
                    ]
                },
                'Khakhi': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-front-6898ea1ddbd2c.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-front-6898ea1ddba5e.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-back-6898ea1dddf60.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-right-6898ea1ddd441.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-left-front-6898ea1ddf524.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-product-details-2-6898ea1dde78f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-left-front-2-6898ea1ddf804.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-right-front-6898ea1ddf26b.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-right-front-6898ea1ddecf9.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-left-front-6898ea1ddcb23.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-left-6898ea1ddd128.jpg'
                    ]
                },
                'Faded': {
                    defaultImage: 'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df2bf6.jpg',
                    images: [
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df2e7c.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df30a2.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df239d.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df34eb.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df3719.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53e01fae.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53e04cf2.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-left-6898d53df4045.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-left-6898d53e007cb.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-right-6898d53e000b4.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-product-details-6898d53e03643.jpg'

                    
                    ]
                },
                'City Green': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb2672f75.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb267308e.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb2672294.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-left-6898eb267351f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-left-front-2-6898eb267496a.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-left-front-6898eb267482a.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-product-details-2-6898eb26742c0.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-right-6898eb2673a98.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-right-6898eb2674600.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-right-front-6898eb26744f4.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-zoomed-in-6898eb26741b8.jpg'
                    ]
                }
            },
            sizes: ['M', 'L', 'XL', 'XXL']
        }
    }
];

// Make products accessible globally
window.getProductById = (id) => products.find(p => p.id === id);
window.getAllProducts = () => products;

// --- Constants ---
const VAT_RATE = 0; // Temporarily zero-rated for testing
const SHIPPING_COST = 1.00; // Temporary flat shipping rate for testing
const PAYFAST_CONFIG = {
    merchantId: '10004002',
    merchantKey: 'q1cd2rdny4a53',
    processUrl: 'https://sandbox.payfast.co.za/eng/process',
    paymentMethods: 'creditcard,eft,debitcard,masterpass,mobicred,sc,capitec_pay',
    notifyUrl: 'https://us-central1-disciplined-disciples-1.cloudfunctions.net/verifyPayfastPayment'
};

// Expose constants globally
window.VAT_RATE = VAT_RATE;
window.SHIPPING_COST = SHIPPING_COST;

// --- Shopping Cart State ---
window.cart = []; // Array of { productId, name, price, quantity, imageUrl, size }

// Enhanced function to display messages to the user
function showMessage(message, type = 'success') {
    // Remove any existing messages first
    const existingMessages = document.querySelectorAll('.toast-message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageBox = document.createElement('div');
    messageBox.className = 'toast-message';
    messageBox.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${getMessageIcon(type)} mr-3"></i>
            <span>${message}</span>
        </div>
    `;
    
    messageBox.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: #fff;
        font-weight: 500;
        z-index: 10000;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease-in-out;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        max-width: 400px;
        min-width: 300px;
    `;

    const colors = {
        success: '#10b981', // Green
        error: '#ef4444',   // Red
        warning: '#f59e0b', // Yellow
        info: '#3b82f6'     // Blue
    };
    
    messageBox.style.backgroundColor = colors[type] || colors.success;

    document.body.appendChild(messageBox);

    // Slide in
    setTimeout(() => {
        messageBox.style.opacity = '1';
        messageBox.style.transform = 'translateX(0)';
    }, 50);

    // Auto-hide after duration based on message type
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => {
        messageBox.style.opacity = '0';
        messageBox.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (messageBox.parentNode) {
                messageBox.remove();
            }
        }, 300);
    }, duration);
    
    // Allow clicking to dismiss
    messageBox.addEventListener('click', () => {
        messageBox.style.opacity = '0';
        messageBox.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (messageBox.parentNode) {
                messageBox.remove();
            }
        }, 300);
    });
}

// Helper function to get appropriate icon for message type
function getMessageIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    return icons[type] || icons.success;
}

// Make showMessage available globally
window.showMessage = showMessage;

// --- Cart Management Functions ---
function saveCartToLocalStorage() {
    localStorage.setItem('disciplinedDisciplesCart', JSON.stringify(window.cart));
    renderCartIcon(); // Update cart icon whenever cart changes
}

function loadCartFromLocalStorage() {
    const storedCart = localStorage.getItem('disciplinedDisciplesCart');
    if (storedCart) {
        try {
            const parsedCart = JSON.parse(storedCart);
            if (Array.isArray(parsedCart)) {
                window.cart = parsedCart.map(item => {
                    const normalizedSize = (item && item.size !== undefined && item.size !== null && item.size !== '' && item.size !== 'undefined')
                        ? String(item.size)
                        : 'N/A';
                    const normalizedQuantity = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
                    const normalizedPrice = Number.isFinite(Number(item?.price)) ? Number(item.price) : 0;
                    return {
                        ...item,
                        size: normalizedSize,
                        quantity: normalizedQuantity,
                        price: normalizedPrice
                    };
                });
                saveCartToLocalStorage();
            } else {
                window.cart = [];
            }
        } catch (error) {
            console.error('Failed to parse stored cart, resetting.', error);
            window.cart = [];
        }
    }
    renderCartIcon(); // Update cart icon on load
}

function clearCart() {
    window.cart = [];
    saveCartToLocalStorage();
    console.log("Cart cleared.");
}

function getProductById(productId) {
    return products.find(p => p.id === productId);
}

// Modified addToCart to accept a size parameter
function addToCart(productId, quantity = 1, size = 'N/A') {
    const product = getProductById(productId);
    if (!product) {
        showMessage('Product not found!', 'error');
        return;
    }

    // Ensure size is a string for consistent comparison
    size = String(size);

    // Check if item with same product ID AND size already exists
    const existingItemIndex = window.cart.findIndex(item => item.productId === productId && String(item.size) === size);

    if (existingItemIndex > -1) {
        window.cart[existingItemIndex].quantity += quantity;
    } else {
        // Get the correct image URL - use displayImage or first available color image
        let imageUrl = product.displayImage;
        if (!imageUrl && product.options && product.options.colors) {
            // Get first color's default or first image
            const firstColor = Object.keys(product.options.colors)[0];
            if (firstColor) {
                const colorData = product.options.colors[firstColor];
                imageUrl = colorData.defaultImage || colorData.images[0];
            }
        }
        
        window.cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            imageUrl: imageUrl || product.displayImage,
            quantity: quantity,
            size: size // Store the selected size
        });
    }
    saveCartToLocalStorage();
    showMessage(`${product.name} (Size: ${size}) added to cart!`);
    console.log('Current Cart:', window.cart);
    // If on cart or checkout page, re-render it
    if (document.body.classList.contains('cart-page') && typeof window.renderCartPage === 'function') {
        window.renderCartPage();
    }
    if (document.body.classList.contains('checkout-page') && typeof window.renderCheckoutSummary === 'function') {
        window.renderCheckoutSummary();
    }
}

function updateCartItemQuantity(productId, size, newQuantity) {
    // Ensure size is a string for consistent comparison
    size = String(size);

    const parsedQuantity = parseInt(newQuantity, 10);
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
        newQuantity = 1;
    } else {
        newQuantity = parsedQuantity;
    }

    // Find item by product ID and size
    const itemIndex = window.cart.findIndex(item => item.productId === productId && String(item.size) === size);
    if (itemIndex > -1) {
        if (newQuantity <= 0) {
            window.cart.splice(itemIndex, 1); // Remove if quantity is 0 or less
        } else {
            window.cart[itemIndex].quantity = newQuantity;
        }
        saveCartToLocalStorage();
        // Trigger a re-render of the cart/checkout page if it's open
        if (document.body.classList.contains('cart-page') && typeof window.renderCartPage === 'function') {
            window.renderCartPage();
        }
        if (document.body.classList.contains('checkout-page') && typeof window.renderCheckoutSummary === 'function') {
            window.renderCheckoutSummary();
        }
        renderCartIcon();
    }
}

function removeCartItem(productId, size) {
    // Ensure size is a string for consistent comparison
    size = String(size);
    window.cart = window.cart.filter(item => !(item.productId === productId && String(item.size) === size));
    saveCartToLocalStorage();
    // Trigger a re-render of the cart/checkout page if it's open
    if (document.body.classList.contains('cart-page') && typeof window.renderCartPage === 'function') {
        window.renderCartPage();
    }
    if (document.body.classList.contains('checkout-page') && typeof window.renderCheckoutSummary === 'function') {
        window.renderCheckoutSummary();
    }
    showMessage('Item removed from cart.', 'info');
    renderCartIcon();
}

function getCartSubtotal() {
    return window.cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function getCartVAT(subtotal) {
    return subtotal * VAT_RATE;
}

function getCartTotal(subtotal, vat, shipping) {
    return subtotal + vat + shipping;
}

function getCartItemCount() {
    return window.cart.reduce((count, item) => count + item.quantity, 0);
}

function calculateCartTotals() {
    const subtotal = getCartSubtotal();
    const vat = getCartVAT(subtotal);
    const shipping = window.cart.length > 0 ? window.SHIPPING_COST : 0;
    return {
        subtotal,
        vat,
        shipping,
        total: getCartTotal(subtotal, vat, shipping)
    };
}

// Function to update the shopping cart icon with item count
function renderCartIcon() {
    const cartCount = getCartItemCount();
    const cartIconElements = document.querySelectorAll('.fa-shopping-cart'); // Get all cart icons

    cartIconElements.forEach(iconElement => {
        // Find existing count span or create a new one
        let countSpan = iconElement.nextElementSibling;
        if (!countSpan || !countSpan.classList.contains('cart-count')) {
            countSpan = document.createElement('span');
            countSpan.classList.add('cart-count');
            // Ensure insertion point is correct relative to the <a> tag, not just <i>
            if (iconElement.parentNode.tagName === 'A') { // If parent is an anchor, append to anchor
                 iconElement.parentNode.appendChild(countSpan);
            } else { // Fallback, insert after icon itself
                iconElement.parentNode.insertBefore(countSpan, iconElement.nextSibling);
            }
        }

        if (cartCount > 0) {
            countSpan.textContent = cartCount;
            countSpan.style.display = 'inline-block';
        } else {
            countSpan.style.display = 'none';
        }
    });
}

// --- User Profile / Address Management Functions ---
window.loadUserDeliveryAddress = async () => {
    if (!window.db || !window.currentUserId) {
        console.log("Firestore or user not ready to load address.");
        return;
    }

    try {
        const userDocRef = window.doc(window.db, "artifacts", "default-app-id", "users", window.currentUserId);
        const userDocSnap = await window.getDoc(userDocRef);

        if (userDocSnap.exists()) {
            window.currentUserProfile = userDocSnap.data();
            console.log("User profile loaded:", window.currentUserProfile);
            const address = window.currentUserProfile.deliveryAddress;
            if (address) {
                document.getElementById('address-line1').value = address.line1 || '';
                document.getElementById('address-line2').value = address.line2 || '';
                document.getElementById('city').value = address.city || '';
                document.getElementById('province').value = address.province || '';
                document.getElementById('postal-code').value = address.postalCode || '';
                document.getElementById('phone-number').value = address.phoneNumber || '';
                document.getElementById('save-address').checked = true;
            }
        }
    } catch (error) {
        console.error("Error loading user delivery address:", error);
        showMessage("Failed to load saved address.", "error");
    }
};

window.saveUserDeliveryAddress = async (addressData, saveForFuture = false) => {
    if (!window.db || !window.currentUserId) {
        showMessage("Please log in to save your address.", "error");
        return;
    }

    try {
        const userDocRef = window.doc(window.db, "artifacts", "default-app-id", "users", window.currentUserId);
        const updatePayload = {};

        if (saveForFuture) {
            updatePayload.deliveryAddress = addressData;
            await window.updateDoc(userDocRef, updatePayload);
            showMessage("Delivery address saved!", "success");
            window.currentUserProfile.deliveryAddress = addressData;
            console.log("Address saved to Firestore for user:", window.currentUserId);
        } else {
            showMessage("Address updated for this order.", "info");
        }
    }
    catch (error) {
        console.error("Error saving user delivery address:", error);
        showMessage("Failed to save address.", "error");
    }
};


// --- Payfast Integration (Client-side) ---
window.initiatePayfastPayment = async (orderItems, totalAmount, deliveryAddress) => {
    if (!window.db || !window.currentUserId) {
        showMessage('Please log in to complete your purchase.', 'info');
        return;
    }
    if (!orderItems || orderItems.length === 0) {
        showMessage('Your cart is empty. Nothing to pay for!', 'error');
        return;
    }

    const loadingSpinner = document.getElementById('loading-spinner');
    const payfastBtn = document.getElementById('pay-with-payfast-btn');

    loadingSpinner?.classList.remove('hidden');
    payfastBtn?.setAttribute('disabled', 'true');

    try {
        const ordersCollectionRef = window.collection(window.db, "artifacts", "default-app-id", "orders");
        const orderData = {
            userId: window.currentUserId,
            items: orderItems,
            totalAmount: totalAmount,
            deliveryAddress: deliveryAddress,
            orderDate: window.serverTimestamp(),
            status: 'Pending Payment',
            payfastTxnId: null,
            trackingNumber: null,
            email: window.auth.currentUser.email
        };
        const docRef = await window.addDoc(ordersCollectionRef, orderData);
        const orderId = docRef.id;
        console.log("Order created in Firestore with ID:", orderId);
        showMessage(`Order ${orderId} created. Redirecting to Payfast...`, 'info');

        // For now, create PayFast form directly (simplified integration)
        // In production, you would use your Firebase Functions to generate secure parameters
        const payfastParams = {
            merchant_id: PAYFAST_CONFIG.merchantId,
            merchant_key: PAYFAST_CONFIG.merchantKey,
            amount: totalAmount.toFixed(2),
            item_name: `Disciplined Disciples Order #${orderId.substring(0, 8)}`,
            item_description: `${orderItems.length} item(s) from Disciplined Disciples`,
            return_url: `${window.location.origin}/profile.html?payment=success&order=${orderId}`,
            cancel_url: `${window.location.origin}/cart.html?payment=cancelled`,
            notify_url: PAYFAST_CONFIG.notifyUrl,
            name_first: deliveryAddress.firstName || window.currentUserProfile.name?.split(' ')[0] || '',
            name_last: deliveryAddress.lastName || window.currentUserProfile.name?.split(' ').slice(1).join(' ') || '',
            email_address: window.auth.currentUser.email,
            cell_number: deliveryAddress.phoneNumber || window.currentUserProfile.phone || '',
            payment_method: PAYFAST_CONFIG.paymentMethods,
            custom_str1: orderId, // Store order ID for reference
            custom_str2: window.currentUserId // Store user ID for reference
        };
        
        console.log("PayFast parameters generated:", payfastParams);

        const payfastForm = document.createElement('form');
        payfastForm.method = 'POST';
    payfastForm.action = PAYFAST_CONFIG.processUrl;

        for (const key in payfastParams) {
            if (payfastParams.hasOwnProperty(key)) {
                const hiddenField = document.createElement('input');
                hiddenField.type = 'hidden';
                hiddenField.name = key;
                hiddenField.value = payfastParams[key];
                payfastForm.appendChild(hiddenField);
            }
            console.log(`Adding to Payfast form: ${key} = ${payfastParams[key]}`);
        }

        document.body.appendChild(payfastForm);
        payfastForm.submit();

    } catch (error) {
        console.error("Payfast initiation failed:", error);
        showMessage(`Payment error: ${error.message}`, 'error');
    } finally {
        loadingSpinner?.classList.add('hidden');
        payfastBtn?.removeAttribute('disabled');
    }
};

// --- Payment Completion Handler ---
window.handlePaymentCompletion = async () => {
    await waitForFirebaseReady();

    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const payfastPaymentId = urlParams.get('pf_payment_id');
    const orderDocId = localStorage.getItem('pendingOrderDocId') || urlParams.get('order') || localStorage.getItem('pendingOrderId');
    const successViaThankYou = window.location.pathname.includes('thank-you.html');
    const isSuccessful = paymentStatus === 'success' || !!payfastPaymentId || successViaThankYou;

    if (!window.db || typeof window.db.collection !== 'function') {
        console.warn('Payment completion skipped: Firestore is not ready yet.');
        return;
    }

    console.log('handlePaymentCompletion invoked', {
        paymentStatus,
        payfastPaymentId,
        orderDocId,
        successViaThankYou,
        isSuccessful
    });

    if (isSuccessful && orderDocId) {
        try {
            const ordersCollection = window.db.collection('artifacts').doc('default-app-id').collection('orders');
            const orderRef = ordersCollection.doc(orderDocId);
            const snapshot = await orderRef.get();

            if (!snapshot.exists) {
                console.warn('Order not found for payment completion:', orderDocId);
            } else {
                const orderData = snapshot.data() || {};
                const alreadyCompleted = (orderData.paymentStatus || '').toLowerCase() === 'paid';
                const template = window.ORDER_STATUS_TEMPLATES?.orderPlaced || {
                    key: 'order_placed',
                    status: 'Order Placed',
                    label: 'Order placed',
                    icon: '🎉',
                    message: '🎉 Thank you! Your Disciplined Disciples order is officially locked in.'
                };

                if (!alreadyCompleted) {
                    const context = Object.assign({}, orderData, {
                        customerName: orderData.customerName || orderData.deliveryAddress?.name,
                        deliveryAddress: orderData.deliveryAddress || {}
                    });
                    const { payload } = buildStatusUpdatePayload(template, context, {}, { email: 'system@disciplineddisciples.co.za', uid: 'system' });
                    payload.paymentGateway = 'PayFast';
                    payload.paymentReference = payfastPaymentId || payload.paymentReference || null;
                    payload.paymentStatus = 'Paid';

                    await orderRef.set(payload, { merge: true });
                }
            }

            localStorage.removeItem('disciplinedDisciplesCart');
            localStorage.removeItem('cart');
            localStorage.removeItem('pendingOrderId');
            localStorage.removeItem('pendingOrderDocId');
            window.cart = [];
            if (typeof renderCartIcon === 'function') {
                renderCartIcon();
            }
            showMessage('Payment successful! Your order is being processed.', 'success');

            if (window.location.pathname.includes('profile.html')) {
                setTimeout(() => {
                    const ordersTab = document.querySelector('[data-tab="orders"]');
                    if (ordersTab) {
                        ordersTab.click();
                    }
                }, 1000);
            }

            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);

        } catch (error) {
            console.error('Error updating order status:', error);
            showMessage('Payment received, but there was an issue updating your order. Please contact support.', 'warning');
        }
    } else if (paymentStatus === 'cancelled') {
        showMessage('Payment was cancelled. Your order is still pending.', 'info');
        // Clean up URL parameters
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
};

// --- Authentication UI Update Function ---
// Clean profile dropdown system
function updateAuthUI(isLoggedIn) {
    console.log("updateAuthUI called. Is logged in:", isLoggedIn);
    
    // Get existing elements from HTML
    const loginSignupLinkDesktop = document.getElementById('login-signup-link');
    const loginSignupLinkMobile = document.getElementById('login-signup-link-mobile');
    const profileRibbon = document.getElementById('profile-ribbon');
    
    // Remove any previously added dynamic auth links to prevent duplicates
    document.querySelectorAll('.auth-link, .auth-link-mobile').forEach(link => link.remove());

    if (isLoggedIn) {
        // Hide login/signup buttons
        if (loginSignupLinkDesktop) loginSignupLinkDesktop.style.display = 'none';
        if (loginSignupLinkMobile) loginSignupLinkMobile.style.display = 'none';
        
        // Show and setup profile dropdown
        if (profileRibbon) {
            profileRibbon.style.display = 'flex';
            setupProfileDropdown();
        }
        
        // Add mobile profile option since dropdown doesn't work well on mobile
        const authLinksMobile = document.querySelector('.mobile-menu ul');
        if (authLinksMobile) {
            // Add Profile link for mobile
            const profileLiMobile = document.createElement('li');
            profileLiMobile.classList.add('auth-link-mobile');
            profileLiMobile.innerHTML = '<a href="profile.html" class="nav-link-mobile"><i class="fas fa-user"></i> My Profile</a>';
            authLinksMobile.appendChild(profileLiMobile);
            
            // Add Logout link for mobile
            const logoutLiMobile = document.createElement('li');
            logoutLiMobile.classList.add('auth-link-mobile');
            logoutLiMobile.innerHTML = '<a href="#" id="logout-btn-mobile" class="nav-link-mobile"><i class="fas fa-sign-out-alt"></i> Logout</a>';
            authLinksMobile.appendChild(logoutLiMobile);
            
            // Add mobile logout event listener
            document.getElementById('logout-btn-mobile')?.addEventListener('click', handleLogout);
        }

    } else {
        // Show login/signup buttons
        if (loginSignupLinkDesktop) loginSignupLinkDesktop.style.display = 'inline-block';
        if (loginSignupLinkMobile) loginSignupLinkMobile.style.display = 'block';
        
        // Hide profile dropdown
        if (profileRibbon) profileRibbon.style.display = 'none';
    }
    
    renderCartIcon(); // Update cart count to ensure it's always accurate
}

// --- Profile Dropdown Setup Function ---
function setupProfileDropdown() {
    const profileRibbon = document.getElementById('profile-ribbon');
    const profileDropdown = document.getElementById('profile-dropdown');
    const profileRibbonName = document.getElementById('profile-ribbon-name');
    const profileRibbonAvatar = document.getElementById('profile-ribbon-avatar');
    const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');
    
    if (!profileRibbon || !profileDropdown) return;
    
    // Load and refresh user profile data
    refreshProfileDropdownData();
    
    // Remove any existing event listeners to prevent duplicates
    const existingRibbonHandler = profileRibbon.cloneNode(true);
    profileRibbon.parentNode.replaceChild(existingRibbonHandler, profileRibbon);
    
    // Profile ribbon click handler
    document.getElementById('profile-ribbon').addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = document.getElementById('profile-dropdown');
        const chevron = document.querySelector('#profile-ribbon .fa-chevron-down');
        
        dropdown.classList.toggle('hidden');
        
        // Animate chevron icon
        if (chevron) {
            if (dropdown.classList.contains('hidden')) {
                chevron.style.transform = 'rotate(0deg)';
            } else {
                chevron.style.transform = 'rotate(180deg)';
            }
        }
        
        console.log('Profile dropdown toggled:', !dropdown.classList.contains('hidden') ? 'visible' : 'hidden');
    });
    
    // Close dropdown when clicking outside
    const outsideClickHandler = (e) => {
        const ribbon = document.getElementById('profile-ribbon');
        const dropdown = document.getElementById('profile-dropdown');
        const chevron = document.querySelector('#profile-ribbon .fa-chevron-down');
        
        if (ribbon && dropdown && !ribbon.contains(e.target)) {
            dropdown.classList.add('hidden');
            // Reset chevron rotation
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    };
    
    // Remove existing outside click listeners and add new one
    document.removeEventListener('click', window.profileDropdownOutsideHandler);
    window.profileDropdownOutsideHandler = outsideClickHandler;
    document.addEventListener('click', outsideClickHandler);
    
    // Handle dropdown link clicks
    const dropdownLinks = profileDropdown.querySelectorAll('a');
    dropdownLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log('Dropdown link clicked:', link.href);
            profileDropdown.classList.add('hidden');
            
            // Reset chevron rotation
            const chevron = document.querySelector('#profile-ribbon .fa-chevron-down');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
            // Let the default navigation happen
        });
    });
    
    // Dropdown logout button
    const logoutBtn = document.getElementById('dropdown-logout-btn');
    if (logoutBtn) {
        // Remove existing listeners and add new one
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        document.getElementById('dropdown-logout-btn').addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Logout clicked from dropdown');
            document.getElementById('profile-dropdown').classList.add('hidden');
            
            // Reset chevron rotation
            const chevron = document.querySelector('#profile-ribbon .fa-chevron-down');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
            }
            
            handleLogout();
        });
    }
}

// --- Function to refresh profile dropdown data ---
async function refreshProfileDropdownData() {
    const profileRibbonName = document.getElementById('profile-ribbon-name');
    const profileRibbonAvatar = document.getElementById('profile-ribbon-avatar');
    
    if (!window.auth?.currentUser) return;
    
    const user = window.auth.currentUser;
    let displayName = user.displayName || user.email.split('@')[0];
    let avatarUrl = user.photoURL;
    
    // Try to get updated profile data from Firestore
    try {
        if (window.db && window.currentUserId) {
            const userDoc = await window.db.collection('artifacts').doc('default-app-id')
                .collection('users').doc(window.currentUserId).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                displayName = userData.name || displayName;
                if (userData.avatarUrl) {
                    avatarUrl = userData.avatarUrl;
                }
            }
        }
    } catch (error) {
        console.log('Could not load profile data for dropdown:', error.message);
    }
    
    // Update profile ribbon display
    if (profileRibbonName) {
        profileRibbonName.textContent = displayName;
    }
    
    if (profileRibbonAvatar) {
        if (avatarUrl) {
            profileRibbonAvatar.innerHTML = `<img src="${avatarUrl}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
        } else {
            profileRibbonAvatar.textContent = displayName.charAt(0).toUpperCase();
            profileRibbonAvatar.className = 'w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-gray-700 font-bold text-xs border-2 border-gray-300';
        }
    }
    
    // Add smooth transition to chevron icon
    const chevron = document.querySelector('#profile-ribbon .fa-chevron-down');
    if (chevron) {
        chevron.style.transition = 'transform 0.2s ease-in-out';
    }
}


// --- Unified Login/Profile Button Logic ---
function updateHeaderUI(user) {
    // Desktop
    const loginSignupLink = document.getElementById('login-signup-link');
    const profileRibbon = document.getElementById('profile-ribbon');
    const profileRibbonName = document.getElementById('profile-ribbon-name');
    const profileRibbonAvatar = document.getElementById('profile-ribbon-avatar');
    // Mobile
    const loginSignupLinkMobile = document.getElementById('login-signup-link-mobile');

    if (user) {
        // Show profile ribbon, hide login/signup
        if (loginSignupLink) loginSignupLink.style.display = 'none';
        if (loginSignupLinkMobile) loginSignupLinkMobile.style.display = 'none';
        if (profileRibbon) profileRibbon.style.display = 'flex';

        // Fetch name from Firestore, prioritize customer name over email
        if (window.db && profileRibbonName && profileRibbonAvatar) {
            window.db.collection('artifacts').doc('default-app-id').collection('users').doc(user.uid).get().then(doc => {
                let name = '';
                let avatarUrl = '';
                
                if (doc.exists && doc.data().name && doc.data().name.trim()) {
                    // Use the customer's actual name
                    name = doc.data().name.trim();
                    avatarUrl = doc.data().avatarUrl || '';
                } else if (user.displayName) {
                    // Fallback to display name
                    name = user.displayName;
                } else {
                    // Last resort: use email prefix
                    name = user.email.split('@')[0];
                }
                
                profileRibbonName.textContent = name;
                
                // Set avatar
                if (avatarUrl) {
                    profileRibbonAvatar.innerHTML = `<img src="${avatarUrl}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
                } else {
                    // Generate initials from name
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                    profileRibbonAvatar.textContent = initials;
                }
            }).catch(error => {
                console.error('Error fetching user profile:', error);
                // Fallback if Firestore fails
                const fallbackName = user.displayName || user.email.split('@')[0];
                profileRibbonName.textContent = fallbackName;
                const initials = fallbackName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                profileRibbonAvatar.textContent = initials;
            });
        }
        
        // Set up dropdown functionality after profile is shown
        setupProfileDropdown();
    } else {
        // Show login/signup, hide profile ribbon
        if (loginSignupLink) loginSignupLink.style.display = 'inline-block';
        if (loginSignupLinkMobile) loginSignupLinkMobile.style.display = 'inline-block';
        if (profileRibbon) profileRibbon.style.display = 'none';
    }
}

// Profile dropdown functionality is now handled in the setupProfileDropdown() function called above

// Ensure only one login/signup button per menu (desktop/mobile) in your HTML
// Example for desktop: <a href="login-signup.html" id="login-signup-link" class="nav-link">...</a>
// Example for mobile: <a href="login-signup.html" id="login-signup-link-mobile" class="nav-link-mobile">...</a>

// --- Profile Ribbon Click: Handled by setupProfileDropdown function ---

// --- Auth State Listener (will be set up after Firebase initialization) ---

// --- Firebase Initialization Function ---
async function initFirebase() {
    console.log("Attempting to initialize Firebase...");
    
    // Check if Firebase is available
    if (typeof window.firebase === 'undefined') {
        console.log("Firebase SDK not loaded. Running in offline mode.");
        updateAuthUI(false);
        settleFirebaseInitialization(false);
        return false;
    }
    
    // Check if firebaseConfig is populated
    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
        console.log("Firebase config not available. Running in offline mode.");
        updateAuthUI(false);
        settleFirebaseInitialization(false);
        return false;
    }

    try {
        // Firebase is already initialized at the top of the script, so just verify it's ready
        if (!window.app || !window.auth || !window.db) {
            console.log("Firebase objects not found, attempting to use existing initialization...");
            window.app = window.firebase.app(); // Get existing app instead of creating new one
            window.auth = window.firebase.auth();
            window.db = window.firebase.firestore();
            window.serverTimestamp = window.firebase.firestore.FieldValue.serverTimestamp;
        }

        console.log("Firebase objects verified: app=", !!window.app, "auth=", !!window.auth, "db=", !!window.db);

        if (window.auth) {
            // Check for existing authentication state first
            if (window.auth.currentUser) {
                console.log('User already authenticated:', window.auth.currentUser.uid);
            } else {
                console.log('No existing user session found.');
                // Don't sign in anonymously automatically - let users sign in explicitly
            }

            // Set up unified auth state listener for all pages
            window.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    window.currentUserId = user.uid;
                    console.log('User is signed in (onAuthStateChanged):', user.uid);
                    console.log('Current page:', window.location.pathname);
                    
                    // Update header UI to show profile
                    updateHeaderUI(user);
                    updateAuthUI(true);
                    
                    if (document.body.classList.contains('checkout-page')) {
                         await window.loadUserDeliveryAddress();
                    }
                } else {
                    window.currentUserId = null;
                    window.currentUserProfile = {};
                    console.log('User is signed out (onAuthStateChanged).');
                    
                    // Update header UI to show login button
                    updateHeaderUI(null);
                    updateAuthUI(false);
                }
            });
            settleFirebaseInitialization(true);
            return true;
        } else {
            console.log("Firebase Auth not available. Running in offline mode.");
            updateAuthUI(false);
            settleFirebaseInitialization(false);
            return false;
        }

    } catch (error) {
        console.error("Error during Firebase initialization:", error.message);
        updateAuthUI(false);
        settleFirebaseInitialization(false);
        return false;
    }
}


// --- Main DOM Content Loaded Listener ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOMContentLoaded fired.");
    loadCartFromLocalStorage();

    const firebaseReady = await initFirebase();

    if (firebaseReady) {
        console.log("Firebase is ready. Proceeding with UI and event listeners.");
        settleFirebaseInitialization(true);
        updateAuthUI(!!window.auth.currentUser);
    } else {
        console.log("Firebase initialization failed. Using offline mode.");
        settleFirebaseInitialization(false);
        updateAuthUI(false);
    }


    // --- Global UI Logic (Menu Toggle) ---
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileMenu = document.querySelector('.mobile-menu');

    if (menuToggle && mobileMenu) {
        menuToggle.addEventListener('click', () => {
            mobileMenu.classList.toggle('open');
            const icon = menuToggle.querySelector('i');
            if (mobileMenu.classList.contains('open')) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });

        const mobileLinks = mobileMenu.querySelectorAll('a');
        mobileLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.remove('open');
                menuToggle.querySelector('i').classList.remove('fa-times');
                menuToggle.querySelector('i').classList.add('fa-bars');
            });
        });
    }

    // Call renderCartPage on cart.html load
    if (document.body.classList.contains('cart-page') || window.location.pathname.includes('cart.html')) {
        if (typeof window.renderCartPage === 'function') {
            window.renderCartPage();
        }
    }

    // Call renderCheckoutSummary on checkout.html load
    if (document.body.classList.contains('checkout-page') || window.location.pathname.includes('checkout.html')) {
        if (typeof window.renderCheckoutSummary === 'function') {
            window.renderCheckoutSummary();
        }
    }


    // --- Authentication Functions (Globally available for login-signup.html forms) ---
    window.registerUser = async (email, password) => {
        console.log("Attempting to register user...");
        if (!window.auth) {
            console.error("window.auth is null during registerUser call. Firebase likely failed to initialize.");
            showMessage("App is not fully ready for registration. Please refresh the page.", "error");
            return;
        }
        try {
            const userCredential = await window.createUserWithEmailAndPassword(window.auth, email, password);
            console.log("User registered:", userCredential.user);
            showMessage("Registration successful! You are now logged in.");
            await window.setDoc(window.doc(window.db, "artifacts", "default-app-id", "users", userCredential.user.uid), {
                email: email,
                createdAt: window.serverTimestamp(),
                deliveryAddress: {}
            });
            // After successful signup
await window.db.collection('artifacts').doc('default-app-id')
    .collection('users').doc(user.uid).set({
        email: user.email,
        name: "", // Let user fill later
        phone: "",
        avatarUrl: "",
        deliveryAddress: {
            line1: "",
            line2: "",
            city: "",
            province: "",
            postalCode: ""
        }
    });
            window.location.href = 'index.html';
        } catch (error) {
            console.error("Error during registration:", error.message);
            let errorMessage = "Registration failed. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid email address.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password is too weak (min 6 characters).";
            }
            showMessage(errorMessage, "error");
        }
    };

    window.loginUser = async (email, password) => {
        console.log("Attempting to login user...");
        if (!window.auth) {
            console.error("window.auth is null during loginUser call. Firebase likely failed to initialize.");
            showMessage("App is not fully ready for login. Please refresh the page.", "error");
            return;
        }
        try {
            const userCredential = await window.signInWithEmailAndPassword(window.auth, email, password);
            console.log("User logged in:", userCredential.user);
            showMessage("Login successful!");
            window.location.href = 'profile.html'; // <-- Redirect to profile page after login
        } catch (error) {
            console.error("Error during login:", error.message);
            let errorMessage = "Login failed. Please check your credentials.";
            if (error.code === 'auth/invalid-credential') {
                errorMessage = "Invalid email or password.";
            }
            showMessage(errorMessage, "error");
        }
    };

    // handleLogout function moved to global scope above

    // --- Attach Login/Signup Form Event Listeners ---
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            try {
                const userCredential = await window.auth.signInWithEmailAndPassword(email, password);
                alert('Login successful!');
                window.location.href = "profile.html"; // Redirect to profile/dashboard
            } catch (error) {
                alert(error.message);
            }
        });
    } else {
        console.warn("Login form not found on this page.");
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name') ? document.getElementById('signup-name').value.trim() : "";
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-confirm-password').value;

            if (name && name.length < 2) {
                alert('Please enter your full name.');
                return;
            }
            if (password.length < 6) {
                alert('Password must be at least 6 characters.');
                return;
            }
            if (password !== confirmPassword) {
                alert('Passwords do not match.');
                return;
            }

            try {
                const userCredential = await window.auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                // Create user profile in Firestore with captured name
                await window.db.collection('artifacts').doc('default-app-id')
                    .collection('users').doc(user.uid).set({
                        email: user.email,
                        name: name || "", // Use captured name or empty string
                        phone: "",
                        avatarUrl: "",
                        deliveryAddress: {
                            line1: "",
                            line2: "",
                            city: "",
                            province: "",
                            postalCode: ""
                        }
                    });
                alert('Signup successful! You can now log in.');
                // Optionally redirect or switch to login tab
            } catch (error) {
                alert(error.message);
            }
        });
    } else {
        console.warn("Signup form not found on this page.");
    }

    // Make core functions globally available (for other pages like product-detail, cart, checkout)
    window.addToCart = addToCart;
    window.updateCartItemQuantity = updateCartItemQuantity;
    window.removeCartItem = removeCartItem;
    window.getCartSubtotal = getCartSubtotal;
    window.getCartVAT = getCartVAT;
    window.getCartTotal = getCartTotal;
    window.calculateCartTotals = calculateCartTotals;
    window.getCartItemCount = getCartItemCount;
    window.products = products;
    window.getProductById = getProductById;
    window.showMessage = showMessage;
    window.renderCartPage = renderCartPage;
    window.renderCheckoutSummary = renderCheckoutSummary;

    // --- Upload Products to Firestore (for initial setup, not for regular use) ---
    window.uploadProductsToFirestore = async function() {
    if (!window.db) {
        console.error("Firestore not initialized.");
        showMessage("Firestore not initialized.", "error");
        return;
    }
    const productsRef = window.collection(window.db, 'products');
    for (const product of window.products) {
        // Flatten color names and images for easier Firestore structure
        const colors = Object.keys(product.options.colors);
        const imageUrls = [];
        colors.forEach(color => {
            imageUrls.push(...product.options.colors[color].images);
        });
        await window.addDoc(productsRef, {
            name: product.name,
            price: product.price,
            description: product.description,
            displayImage: product.displayImage,
            imageUrls: imageUrls,
            colors: colors,
            sizes: product.options.sizes,
            category: product.category || 'hoodie'
        });
        console.log(`Uploaded: ${product.name}`);
    }
    showMessage("All products uploaded to Firestore!", "success");
}

    // --- Uncomment to enable product upload on initial load (one-time setup) ---
    // if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    //     console.log("Localhost detected. Uploading products to Firestore...");
    //     uploadProductsToFirestore();
    // } else {
    //     console.log("Non-localhost environment. Skipping product upload.");
    // }

    async function fetchProductsFromFirestore() {
        if (!window.db) {
            console.error("Firestore not initialized.");
            return;
        }
        const productsRef = window.collection(window.db, 'products');
        const snapshot = await window.getDocs(productsRef);
        window.products = [];
        snapshot.forEach(doc => {
            const product = doc.data();
            product.id = doc.id;
            window.products.push(product);
        });
        renderProducts(); // Call your function to display products
    }

    // Call this after Firebase is initialized and DOM is ready
    document.addEventListener('DOMContentLoaded', async () => {
        await fetchProductsFromFirestore();
    });
});

function renderProducts() {
    const productsList = document.getElementById('products-list');
    if (!productsList) return;
    productsList.innerHTML = '';
    window.products.forEach(product => {
        productsList.innerHTML += `
            <div class="product-card">
                <img src="${product.displayImage}" alt="${product.name}" style="width:180px; height:180px; object-fit:cover;">
                <h3>${product.name}</h3>
                <p>R${product.price.toFixed(2)}</p>
                <button onclick="addToCart('${product.id}', 1)">Add to Cart</button>
            </div>
        `;
    });
}

function renderCartPage() {
    const enhancedContainer = document.getElementById('cart-items-container');
    const legacyContainer = document.getElementById('cart-items');

    if (enhancedContainer) {
        const emptyMessage = document.getElementById('empty-cart-message');
        const summaryDesktop = document.getElementById('cart-summary');
        const summaryMobile = document.getElementById('cart-summary-mobile');
        const proceedButton = document.getElementById('proceed-to-checkout-btn');
        const proceedButtonMobile = document.getElementById('proceed-to-checkout-btn-mobile');

        const desktopTotals = {
            subtotal: document.getElementById('cart-subtotal'),
            vat: document.getElementById('cart-vat'),
            shipping: document.getElementById('cart-shipping'),
            total: document.getElementById('cart-total')
        };

        const mobileTotals = {
            subtotal: document.getElementById('cart-subtotal-mobile'),
            vat: document.getElementById('cart-vat-mobile'),
            shipping: document.getElementById('cart-shipping-mobile'),
            total: document.getElementById('cart-total-mobile')
        };

        enhancedContainer.innerHTML = '';

        const handleEmptyCart = () => {
            emptyMessage?.classList.remove('hidden');
            summaryDesktop?.classList.add('hidden');
            summaryMobile?.classList.add('hidden');
            proceedButton?.setAttribute('disabled', 'true');
            proceedButton?.classList.add('opacity-50', 'cursor-not-allowed');
            proceedButtonMobile?.setAttribute('disabled', 'true');
            proceedButtonMobile?.classList.add('opacity-50', 'cursor-not-allowed');

            [desktopTotals, mobileTotals].forEach(group => {
                Object.values(group).forEach(span => {
                    if (span) {
                        span.textContent = '0.00';
                    }
                });
            });
        };

        if (!window.cart.length) {
            handleEmptyCart();
            return;
        }

        emptyMessage?.classList.add('hidden');
        summaryDesktop?.classList.remove('hidden');
        summaryMobile?.classList.remove('hidden');
        proceedButton?.removeAttribute('disabled');
        proceedButton?.classList.remove('opacity-50', 'cursor-not-allowed');
        proceedButtonMobile?.removeAttribute('disabled');
        proceedButtonMobile?.classList.remove('opacity-50', 'cursor-not-allowed');

        const table = document.createElement('table');
        table.classList.add('w-full', 'cart-table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th class="py-3 px-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Product</th>
                    <th class="py-3 px-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                    <th class="py-3 px-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Quantity</th>
                    <th class="py-3 px-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Subtotal</th>
                    <th class="py-3 px-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"></th>
                </tr>
            </thead>
            <tbody id="cart-table-body"></tbody>
        `;
        enhancedContainer.appendChild(table);

        const tableBody = document.getElementById('cart-table-body');
        window.cart.forEach(item => {
            const itemRecord = getProductById(item.productId) || item;
            const sizeKey = (item.size === undefined || item.size === null || item.size === '' ? 'N/A' : String(item.size));
            const encodedSize = encodeURIComponent(sizeKey);
            const displaySize = sizeKey === 'N/A' ? '' : ` (Size: ${sizeKey})`;
            const itemTotal = item.price * item.quantity;

            const row = document.createElement('tr');
            row.classList.add('cart-item-row');
            row.innerHTML = `
                <td class="py-4 px-2 whitespace-nowrap">
                    <div class="flex items-center">
                        <img src="${itemRecord.displayImage || item.imageUrl || ''}" alt="${item.name}" class="w-16 h-16 rounded-md object-cover mr-4">
                        <span class="text-sm font-medium text-gray-900">${item.name}${displaySize}</span>
                    </div>
                </td>
                <td class="py-4 px-2 whitespace-nowrap text-sm text-gray-700">R ${item.price.toFixed(2)}</td>
                <td class="py-4 px-2 whitespace-nowrap">
                    <div class="flex items-center">
                        <button class="quantity-btn" data-action="decrement" data-product-id="${item.productId}" data-size="${encodedSize}" data-quantity="${item.quantity}">-</button>
                        <input type="number" value="${item.quantity}" min="1" class="quantity-input"
                            data-product-id="${item.productId}" data-size="${encodedSize}">
                        <button class="quantity-btn" data-action="increment" data-product-id="${item.productId}" data-size="${encodedSize}" data-quantity="${item.quantity}">+</button>
                    </div>
                </td>
                <td class="py-4 px-2 whitespace-nowrap text-sm text-gray-700">R ${itemTotal.toFixed(2)}</td>
                <td class="py-4 px-2 whitespace-nowrap text-right text-sm font-medium">
                    <button class="remove-item-btn" data-action="remove" data-product-id="${item.productId}" data-size="${encodedSize}">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </td>
            `;
            tableBody?.appendChild(row);
        });

        const attachQuantityHandlers = () => {
            const getDecodedSize = datasetSize => {
                const decoded = decodeURIComponent(datasetSize || 'N%2FA');
                if (!decoded || decoded === 'undefined') {
                    return 'N/A';
                }
                return decoded;
            };

            enhancedContainer.querySelectorAll('[data-action="decrement"], [data-action="increment"]').forEach(button => {
                button.addEventListener('click', () => {
                    const productId = button.getAttribute('data-product-id');
                    const size = getDecodedSize(button.getAttribute('data-size'));
                    const quantity = parseInt(button.getAttribute('data-quantity'), 10) || 1;
                    const nextQuantity = button.getAttribute('data-action') === 'increment' ? quantity + 1 : quantity - 1;
                    window.updateCartItemQuantity(productId, size, nextQuantity);
                });
            });

            enhancedContainer.querySelectorAll('.quantity-input').forEach(input => {
                input.addEventListener('change', event => {
                    const productId = event.target.getAttribute('data-product-id');
                    const size = getDecodedSize(event.target.getAttribute('data-size'));
                    window.updateCartItemQuantity(productId, size, event.target.value);
                });
            });

            enhancedContainer.querySelectorAll('[data-action="remove"]').forEach(button => {
                button.addEventListener('click', () => {
                    const productId = button.getAttribute('data-product-id');
                    const size = getDecodedSize(button.getAttribute('data-size'));
                    window.removeCartItem(productId, size);
                });
            });
        };

        attachQuantityHandlers();

        const totals = calculateCartTotals();
        [desktopTotals, mobileTotals].forEach(group => {
            group.subtotal && (group.subtotal.textContent = totals.subtotal.toFixed(2));
            group.vat && (group.vat.textContent = totals.vat.toFixed(2));
            group.shipping && (group.shipping.textContent = totals.shipping.toFixed(2));
            group.total && (group.total.textContent = totals.total.toFixed(2));
        });

        return;
    }

    if (!legacyContainer) {
        return;
    }

    legacyContainer.innerHTML = '';

    if (!window.cart.length) {
        legacyContainer.innerHTML = '<p>Your cart is empty.</p>';
        return;
    }

    window.cart.forEach(item => {
        legacyContainer.innerHTML += `
            <div class="cart-item">
                <img src="${item.imageUrl || item.displayImage || ''}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-size">Size: ${item.size || 'N/A'}</div>
                    <div class="cart-item-qty">Qty: ${item.quantity}</div>
                    <div class="cart-item-price">R${item.price.toFixed(2)}</div>
                </div>
                <button onclick="window.removeCartItem('${item.productId}', '${item.size || 'N/A'}')">Remove</button>
            </div>
        `;
    });

    const totals = calculateCartTotals();
    legacyContainer.innerHTML += `
        <div class="cart-totals">
            <div>Subtotal: R${totals.subtotal.toFixed(2)}</div>
            <div>VAT: R${totals.vat.toFixed(2)}</div>
            <div>Shipping: R${totals.shipping.toFixed(2)}</div>
            <div><strong>Total: R${totals.total.toFixed(2)}</strong></div>
            <a href="checkout.html" class="btn btn-primary">Proceed to Checkout</a>
        </div>
    `;
}

function renderCheckoutSummary() {
    const cartItemsDiv = document.getElementById('checkout-cart-items');
    if (!cartItemsDiv) {
        return;
    }

    cartItemsDiv.innerHTML = '';

    if (!window.cart.length) {
        cartItemsDiv.innerHTML = '<p>Your cart is empty.</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'cart-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Image</th>
                    <th>Price</th>
                    <th>Quantity</th>
                    <th>Subtotal</th>
                </tr>
            </thead>
            <tbody id="checkout-table-body"></tbody>
        `;
        cartItemsDiv.appendChild(table);

        const tbody = table.querySelector('#checkout-table-body');
        window.cart.forEach(item => {
            const sizeKey = (item.size === undefined || item.size === null || item.size === '' ? 'N/A' : String(item.size));
            const displaySize = sizeKey === 'N/A' ? '' : ` (Size: ${sizeKey})`;
            const row = document.createElement('tr');
            const itemTotal = item.price * item.quantity;
            const catalogEntry = getProductById(item.productId) || {};
            const imageSource = item.imageUrl || catalogEntry.displayImage || '';
            row.innerHTML = `
                <td>${item.name}${displaySize}</td>
                <td><img src="${imageSource}" alt="${item.name}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;"></td>
                <td>R${item.price.toFixed(2)}</td>
                <td>${item.quantity}</td>
                <td>R${itemTotal.toFixed(2)}</td>
            `;
            tbody?.appendChild(row);
        });
    }

    const totals = calculateCartTotals();
    const subtotalEl = document.getElementById('checkout-subtotal');
    const vatEl = document.getElementById('checkout-vat');
    const shippingEl = document.getElementById('checkout-shipping');
    const totalEl = document.getElementById('checkout-total');

    subtotalEl && (subtotalEl.textContent = `R${totals.subtotal.toFixed(2)}`);
    vatEl && (vatEl.textContent = `R${totals.vat.toFixed(2)}`);
    shippingEl && (shippingEl.textContent = `R${totals.shipping.toFixed(2)}`);
    totalEl && (totalEl.textContent = `R${totals.total.toFixed(2)}`);
}

async function showProfileRibbon(user) {
    const db = window.getFirestore();
    const profileRef = window.doc(db, 'artifacts', 'default-app-id', 'users', user.uid);
    const profileSnap = await window.getDoc(profileRef);
    let profile = profileSnap.exists() ? profileSnap.data() : {};
    const name = profile.name || user.displayName || user.email || '';
    const email = user.email || '';
    const avatarUrl = profile.avatarUrl || '';

    // Set name
    const ribbonName = document.getElementById('profile-ribbon-name');
    if (ribbonName) ribbonName.textContent = name;

    // Set avatar or initials
    const ribbonAvatar = document.getElementById('profile-ribbon-avatar');
    if (ribbonAvatar) {
        if (avatarUrl) {
            ribbonAvatar.innerHTML = `<img src="${avatarUrl}" alt="Profile" class="w-full h-full object-cover rounded-full">`;
        } else {
            ribbonAvatar.textContent = name
                ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
                : email[0].toUpperCase();
        }
    }

    // Show ribbon
    const ribbon = document.getElementById('profile-ribbon');
    if (ribbon) ribbon.style.display = 'flex';
}

// --- Profile Ribbon Dropdown Navigation (Moved to setupProfileDropdown function) ---

document.addEventListener('DOMContentLoaded', () => {
    // Scroll to section if hash is present (for profile page navigation)
    if (window.location.hash) {
        const section = document.getElementById(window.location.hash.replace('#', ''));
        if (section) section.scrollIntoView({ behavior: 'smooth' });
    }
});

async function saveProfileChanges(data) {
    if (!window.currentUserId) return showMessage("Not logged in.", "error");
    await window.db.collection('artifacts').doc('default-app-id')
        .collection('users').doc(window.currentUserId).update(data);
    Object.assign(window.currentUserProfile, data);
    showMessage("Profile updated!", "success");
}

function prefillProfileForm() {
    document.getElementById('profile-name').value = window.currentUserProfile.name || '';
    document.getElementById('profile-phone').value = window.currentUserProfile.phone || '';
    // ...repeat for address fields
}

// --- Profile Page Logic ---
window.ProfileApp = (function() {
    const state = {
        initialized: false,
        eventsBound: false,
        user: null,
        profile: null,
        orders: [],
        filteredOrders: []
    };

    const selectors = {
        loadingOverlay: () => document.getElementById('profile-loading'),
        alert: () => document.getElementById('profile-alert'),
        name: () => document.getElementById('customer-name'),
        email: () => document.getElementById('customer-email'),
        joined: () => document.getElementById('customer-joined'),
        totalOrders: () => document.getElementById('stat-total-orders'),
        totalSpend: () => document.getElementById('stat-total-spend'),
        pendingOrders: () => document.getElementById('stat-pending-orders'),
        ordersSubtitle: () => document.getElementById('orders-subtitle'),
        ordersTableBody: () => document.getElementById('orders-table-body'),
        orderFilter: () => document.getElementById('order-filter'),
        downloadOrdersBtn: () => document.getElementById('download-orders'),
        downloadOrdersPdfBtn: () => document.getElementById('download-orders-pdf'),
        addressForm: () => document.getElementById('address-form'),
        addressInputs: {
            line1: () => document.getElementById('address-line1'),
            line2: () => document.getElementById('address-line2'),
            city: () => document.getElementById('address-city'),
            province: () => document.getElementById('address-province'),
            postal: () => document.getElementById('address-postal')
        },
        logoutBtn: () => document.getElementById('logout-btn')
    };

    let cachedBrandLogoDataUrl = null;

    async function init() {
        if (state.initialized) {
            return;
        }

        if (!isProfilePage()) {
            return;
        }

        let guardApproved = true;
        if (window.AuthGuard && typeof window.AuthGuard.requireAuth === 'function') {
            try {
                const guardResult = window.AuthGuard.requireAuth();
                guardApproved = typeof guardResult?.then === 'function' ? await guardResult : !!guardResult;
            } catch (error) {
                console.error('AuthGuard.requireAuth failed:', error);
                guardApproved = false;
            }
        }

        if (!guardApproved) {
            return;
        }

        hideAlert();
        showLoading(true);

        const firebaseReady = await waitForFirebaseReady();
        if (!firebaseReady) {
            showAlert('error', 'We could not connect to the store right now. Please refresh to try again.');
            showLoading(false);
            return;
        }

        state.initialized = true;

        const auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
        if (!auth) {
            showAlert('error', 'Unable to connect to authentication service. Please try again later.');
            showLoading(false);
            return;
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
            handleAuthenticatedUser(currentUser);
        } else {
            auth.onAuthStateChanged(user => {
                if (user) {
                    handleAuthenticatedUser(user);
                } else {
                    showLoading(false);
                    window.location.replace('login-signup.html?redirect=profile.html');
                }
            });

        }
    }

    function isProfilePage() {
        return window.location.pathname.includes('profile.html');
    }

    async function handleAuthenticatedUser(user) {
        if (!user) {
            showLoading(false);
            window.location.replace('login-signup.html?redirect=profile.html');
            return;
        }

        if (isAdminEmail(user.email)) {
            window.location.replace('admin-dashboard.html');
            return;
        }

        state.user = user;
        window.currentUserId = user.uid;
        sessionStorage.setItem('userLoggedIn', 'true');
        sessionStorage.setItem('userId', user.uid);

        try {
            await Promise.all([loadProfile(), loadOrders()]);
            bindEvents();
            renderProfileSummary();
            renderAddressForm();
            renderOrders();
            showLoading(false);
        } catch (error) {
            console.error('ProfileApp initialization error:', error);
            showAlert('error', 'We could not load your profile right now. Please refresh to try again.');
            showLoading(false);
        }
    }

    async function loadProfile() {
        if (!window.db) {
            throw new Error('Firestore not available');
        }

        const userRef = window.db.collection('artifacts').doc('default-app-id')
            .collection('users').doc(state.user.uid);

        const snapshot = await userRef.get();

        if (snapshot.exists) {
            state.profile = snapshot.data();
        } else {
            state.profile = {
                email: state.user.email,
                name: state.user.displayName || '',
                phone: '',
                deliveryAddress: {},
                createdAt: new Date()
            };
            await userRef.set(state.profile, { merge: true });
        }

        window.currentUserProfile = state.profile;
    }

    async function loadOrders() {
        state.orders = [];
        state.filteredOrders = [];

        if (!window.db) {
            return;
        }

        const ordersRef = window.db.collection('artifacts')
            .doc('default-app-id')
            .collection('orders')
            .where('userId', '==', state.user.uid)
            .orderBy('orderDate', 'desc');

        try {
            const snapshot = await ordersRef.get();
            snapshot.forEach(doc => {
                const data = doc.data() || {};
                const orderDate = coerceToDate(data.orderDate);
                const order = {
                    docId: doc.id,
                    orderId: data.orderId || doc.id,
                    statusKey: data.statusKey || '',
                    status: data.status || 'Pending',
                    statusLabel: data.statusLabel || data.status || 'Pending',
                    statusMessage: data.statusMessage || data.lastCustomerMessage || '',
                    statusIcon: data.statusIcon || '',
                    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
                    paymentStatus: data.paymentStatus || 'Pending',
                    orderDate,
                    totalAmount: Number(data.totalAmount) || 0,
                    items: Array.isArray(data.items) ? data.items : [],
                    estimatedArrivalText: data.estimatedArrivalText || data.estimatedDelivery || '',
                    deliveryAddress: data.deliveryAddress || data.shippingAddress || null
                };

                if (isAwaitingPaymentExpired(order)) {
                    return;
                }

                state.orders.push(order);
            });
        } catch (error) {
            console.error('Error loading orders:', error);
        }

        state.filteredOrders = [...state.orders];
    }

    function bindEvents() {
        if (state.eventsBound) {
            return;
        }
        state.eventsBound = true;

        const form = selectors.addressForm();
        if (form) {
            form.addEventListener('submit', async event => {
                event.preventDefault();
                await handleAddressSave();
            });
        }

        const filter = selectors.orderFilter();
        if (filter) {
            filter.addEventListener('change', () => {
                renderOrders();
            });
        }

        const downloadBtn = selectors.downloadOrdersBtn();
        if (downloadBtn) {
            downloadBtn.addEventListener('click', downloadOrderCsv);
        }

        const downloadPdfBtn = selectors.downloadOrdersPdfBtn();
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', downloadOrdersPdf);
        }

        const logout = selectors.logoutBtn();
        if (logout) {
            logout.addEventListener('click', () => {
                handleLogout();
            });
        }

        const tableBody = selectors.ordersTableBody();
        if (tableBody && !tableBody.dataset.bound) {
            tableBody.addEventListener('click', async event => {
                const deleteBtn = event.target.closest('button[data-action="delete-awaiting-order"]');
                if (deleteBtn) {
                    const docId = deleteBtn.dataset.docId;
                    await deleteAwaitingPaymentOrder(docId);
                    return;
                }

                const button = event.target.closest('button[data-action="download-invoice"]');
                if (!button) {
                    return;
                }

                const docId = button.dataset.docId;
                const order = state.orders.find(candidate => candidate.docId === docId);
                if (!order) {
                    showAlert('error', 'We could not find that order. Please refresh and try again.');
                    return;
                }

                await downloadInvoicePdf(order);
            });
            tableBody.dataset.bound = 'true';
        }
    }

    async function handleAddressSave() {
        if (!window.db || !state.profile) {
            return;
        }

        const deliveryAddress = {
            line1: selectors.addressInputs.line1()?.value.trim() || '',
            line2: selectors.addressInputs.line2()?.value.trim() || '',
            city: selectors.addressInputs.city()?.value.trim() || '',
            province: selectors.addressInputs.province()?.value.trim() || '',
            postalCode: selectors.addressInputs.postal()?.value.trim() || ''
        };

        try {
            await window.db.collection('artifacts').doc('default-app-id')
                .collection('users').doc(state.user.uid)
                .set({ deliveryAddress }, { merge: true });

            state.profile.deliveryAddress = deliveryAddress;
            window.currentUserProfile = state.profile;
            showAlert('success', 'Address updated successfully.', true);
        } catch (error) {
            console.error('Address update failed:', error);
            showAlert('error', 'Could not update your address. Please try again.');
        }
    }

    async function deleteAwaitingPaymentOrder(docId) {
        if (!docId) {
            return;
        }

        const orderIndex = state.orders.findIndex(candidate => candidate.docId === docId);
        if (orderIndex === -1) {
            showAlert('error', 'We could not find that order. Please refresh and try again.');
            return;
        }

        const order = state.orders[orderIndex];
        if (!isAwaitingPaymentOrder(order)) {
            showAlert('info', 'Only awaiting-payment orders can be deleted.', true);
            return;
        }

        const confirmed = window.confirm('Delete this awaiting-payment order? This cannot be undone.');
        if (!confirmed) {
            return;
        }

        if (!window.db) {
            showAlert('error', 'We could not reach the store right now. Please try again.');
            return;
        }

        try {
            showLoading(true);
            await window.db.collection('artifacts')
                .doc('default-app-id')
                .collection('orders')
                .doc(docId)
                .delete();

            state.orders.splice(orderIndex, 1);
            renderOrders();
            showAlert('success', 'Awaiting-payment order deleted.', true);
        } catch (error) {
            console.error('Failed to delete awaiting-payment order:', error);
            showAlert('error', 'We could not delete that order. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    function renderProfileSummary() {
        const nameEl = selectors.name();
        const emailEl = selectors.email();
        const joinedEl = selectors.joined();

        if (nameEl) {
            nameEl.textContent = state.profile?.name || state.user.email?.split('@')[0] || 'Customer';
        }

        if (emailEl) {
            emailEl.textContent = state.profile?.email || state.user.email || '';
        }

        if (joinedEl) {
            const source = state.profile?.createdAt || state.user.metadata?.creationTime || new Date();
            joinedEl.textContent = `Member since ${formatDate(source, { month: 'long', year: 'numeric' })}`;
        }
    }

    function renderAddressForm() {
        const address = state.profile?.deliveryAddress || {};

        const line1 = selectors.addressInputs.line1();
        const line2 = selectors.addressInputs.line2();
        const city = selectors.addressInputs.city();
        const province = selectors.addressInputs.province();
        const postal = selectors.addressInputs.postal();

        if (line1) line1.value = address.line1 || '';
        if (line2) line2.value = address.line2 || '';
        if (city) city.value = address.city || '';
        if (province) province.value = address.province || '';
        if (postal) postal.value = address.postalCode || '';
    }

    function renderOrders() {
        const tableBody = selectors.ordersTableBody();
        if (!tableBody) {
            return;
        }

        const filter = selectors.orderFilter();
        const filterValue = filter ? filter.value : 'all';

        state.filteredOrders = applyOrderFilter(filterValue);

        tableBody.innerHTML = '';

        if (state.filteredOrders.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-6 text-center text-gray-500">
                        ${state.orders.length === 0 ? 'No orders yet. Visit the shop to get started.' : 'No orders match this filter.'}
                    </td>
                </tr>`;
        } else {
            state.filteredOrders.forEach(order => {
                tableBody.appendChild(buildOrderRow(order));
            });
        }

    updateSubtitle(filterValue, filter);
        updateStats();
    }

    function applyOrderFilter(filterValue) {
        if (filterValue === 'all') {
            return [...state.orders];
        }

        return state.orders.filter(order => {
            const status = (order.status || '').toLowerCase();
            return status.includes(filterValue.toLowerCase());
        });
    }

    function buildOrderRow(order) {
        const row = document.createElement('tr');
        row.className = 'border-b last:border-0';

        const date = formatDate(order.orderDate);
        const status = order.status || 'Pending';
        const total = formatCurrency(order.totalAmount);
        const items = (order.items || []).map(item => `${item.name || 'Item'} x${item.quantity || 1}`).join(', ');
        const message = escapeHtml(order.statusMessage || order.lastCustomerMessage || 'We will update you soon.');
        const timeline = renderStatusTimeline(order);
        const eta = order.estimatedArrivalText ? `<div class="mt-1 text-xs text-blue-600">ETA: ${escapeHtml(order.estimatedArrivalText)}</div>` : '';
        const invoiceButton = isInvoiceAvailable(order)
            ? `<button type="button" class="mt-3 inline-flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-100 transition" data-action="download-invoice" data-doc-id="${escapeHtml(order.docId)}">
                    <i class="fas fa-file-invoice"></i>
                    Download Invoice
               </button>`
            : '';
        const deleteButton = isAwaitingPaymentOrder(order)
            ? `<button type="button" class="mt-2 inline-flex items-center gap-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100 transition" data-action="delete-awaiting-order" data-doc-id="${escapeHtml(order.docId)}">
                    <i class="fas fa-trash"></i>
                    Delete order
               </button>`
            : '';

        row.innerHTML = `
            <td class="px-4 py-3 font-medium text-gray-700">${order.orderId}</td>
            <td class="px-4 py-3 text-gray-500">${date}</td>
            <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(status)}">${status}</span>
            </td>
            <td class="px-4 py-3 text-gray-700">${total}</td>
            <td class="px-4 py-3 text-gray-500">
                ${items || '—'}
                <div class="mt-2 text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded px-3 py-2">${message}</div>
                ${eta}
                <details class="mt-3">
                    <summary class="text-xs text-blue-600 cursor-pointer">See delivery journey</summary>
                    <ul class="mt-2 space-y-2">${timeline}</ul>
                </details>
                ${invoiceButton}
                ${deleteButton}
            </td>
        `;

        return row;
    }

    function renderStatusTimeline(order) {
        const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
        if (!history.length) {
            return '<li class="text-xs text-gray-400">No updates just yet—we will keep you posted 💛</li>';
        }

        return history
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .map(entry => {
                const icon = escapeHtml(entry.icon || '✨');
                const label = escapeHtml(entry.status || entry.label || 'Update');
                const message = escapeHtml(entry.message || '');
                const when = formatDate(entry.createdAt);
                return `<li class="flex items-start gap-2 text-xs text-gray-500">
                    <span class="text-lg leading-none">${icon}</span>
                    <div>
                        <div class="font-semibold text-gray-700">${label}</div>
                        ${message ? `<div class="mt-1">${message}</div>` : ''}
                        <div class="text-[10px] uppercase tracking-wide text-gray-400">${escapeHtml(when || '')}</div>
                    </div>
                </li>`;
            })
            .join('');
    }

    function statusBadgeClass(status) {
        const normalized = (status || '').toLowerCase();
        if (normalized.includes('delivered')) return 'bg-green-100 text-green-700';
        if (normalized.includes('out for delivery')) return 'bg-blue-100 text-blue-700';
        if (normalized.includes('arriving') || normalized.includes('eta')) return 'bg-teal-100 text-teal-700';
        if (normalized.includes('order placed') || normalized.includes('placed')) return 'bg-purple-100 text-purple-700';
        if (normalized.includes('cancel')) return 'bg-red-100 text-red-700';
        if (normalized.includes('awaiting') || normalized.includes('pending')) return 'bg-yellow-100 text-yellow-700';
        return 'bg-gray-100 text-gray-600';
    }

    function updateSubtitle(filterValue, filterElement) {
        const subtitle = selectors.ordersSubtitle();
        if (!subtitle) {
            return;
        }

        let label;
        if (filterValue === 'all') {
            label = 'All orders';
        } else if (filterElement && filterElement.options && filterElement.selectedIndex >= 0) {
            label = `${filterElement.options[filterElement.selectedIndex].text} orders`;
        } else {
            label = `${filterValue.charAt(0).toUpperCase()}${filterValue.slice(1)} orders`;
        }
        const count = state.filteredOrders.length;
        subtitle.textContent = `Showing ${count} ${count === 1 ? 'order' : 'orders'} (${label})`;
    }

    function updateStats() {
        const totalOrdersEl = selectors.totalOrders();
        const totalSpendEl = selectors.totalSpend();
        const pendingEl = selectors.pendingOrders();

        if (totalOrdersEl) {
            totalOrdersEl.textContent = state.orders.length;
        }
        if (totalSpendEl) {
            const total = state.orders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
            totalSpendEl.textContent = formatCurrency(total);
        }
        if (pendingEl) {
            const pendingCount = state.orders.filter(order => {
                const normalized = (order.status || '').toLowerCase();
                return normalized.includes('pending') || normalized.includes('awaiting');
            }).length;
            pendingEl.textContent = pendingCount;
        }
    }

    function downloadOrderCsv() {
        if (!state.filteredOrders.length) {
            showAlert('info', 'There are no orders to download right now.', true);
            return;
        }

        const header = ['Order ID', 'Date', 'Status', 'Status Message', 'Payment Status', 'Total', 'Items'];
        const rows = state.filteredOrders.map(order => {
            const date = formatDate(order.orderDate);
            const items = (order.items || []).map(item => `${item.name || 'Item'} x${item.quantity || 1}`).join('; ');
            return [
                quoteCsv(order.orderId),
                quoteCsv(date),
                quoteCsv(order.status || ''),
                quoteCsv(order.statusMessage || order.lastCustomerMessage || ''),
                quoteCsv(order.paymentStatus || ''),
                quoteCsv(formatCurrency(order.totalAmount)),
                quoteCsv(items)
            ].join(',');
        });

        const csvContent = [header.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `disciplined-disciples-orders-${Date.now()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async function downloadOrdersPdf() {
        if (!state.filteredOrders.length) {
            showAlert('info', 'There are no orders to download right now.', true);
            return;
        }

        const JsPdfCtor = await resolveJsPdfConstructor();
        if (!JsPdfCtor) {
            showAlert('error', 'PDF export is unavailable right now. Please try again.');
            return;
        }

        const doc = new JsPdfCtor({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 48;

        const accent = hexToRgb('#111827');
        const accentSecondary = hexToRgb('#2563EB');
        const neutralText = hexToRgb('#1F2937');
        const mutedText = hexToRgb('#4B5563');
        const subtleBackground = hexToRgb('#F3F4F6');
        const stripeBackground = hexToRgb('#F9FAFB');

        const logoDataUrl = await getBrandLogoDataUrl();

        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.rect(0, 0, pageWidth, 110, 'F');

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, 'PNG', margin, 24, 72, 72);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.text('Disciplined Disciples', margin + 92, 46);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text('Order History Summary', margin + 92, 68);
        doc.setFontSize(11);
        doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, pageWidth - margin, 46, { align: 'right' });

        const customerName = state.profile?.name || state.user?.email || 'Customer';
        const pendingCount = state.filteredOrders.filter(order => (order.status || '').toLowerCase().includes('pending')).length;
        const totalSpend = state.filteredOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);

        let cursorY = 140;

        doc.setFillColor(subtleBackground.r, subtleBackground.g, subtleBackground.b);
        doc.roundedRect(margin, cursorY, pageWidth - 2 * margin, 88, 12, 12, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(accentSecondary.r, accentSecondary.g, accentSecondary.b);
        doc.text('At a glance', margin + 20, cursorY + 28);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
        doc.text(`Customer: ${customerName}`, margin + 20, cursorY + 48);
        doc.text(`Orders in view: ${state.filteredOrders.length}`, margin + 20, cursorY + 66);
        doc.text(`Pending orders: ${pendingCount}`, margin + 260, cursorY + 48);
        doc.text(`Total spend (view): ${formatCurrency(totalSpend)}`, margin + 260, cursorY + 66);

        cursorY += 120;

        const tableWidth = pageWidth - 2 * margin;
        const rowHeight = 30;
        const headerHeight = 34;
        let tableY = cursorY;

        const columns = (() => {
            const base = [
                { title: 'Order ID', width: 150, getter: order => (order.orderId || order.docId || '').slice(0, 18) },
                { title: 'Date', width: 90, getter: order => formatDate(order.orderDate) },
                { title: 'Status', width: 140, getter: order => order.status || '—' },
                { title: 'Payment', width: 120, getter: order => order.paymentStatus || '—' }
            ];
            const usedWidth = base.reduce((sum, col) => sum + col.width, 0);
            base.push({ title: 'Total', width: tableWidth - usedWidth, getter: order => formatCurrency(order.totalAmount) });
            return base;
        })();

        const renderTableHeader = () => {
            doc.setFillColor(accent.r, accent.g, accent.b);
            doc.roundedRect(margin, tableY, tableWidth, headerHeight, 8, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);

            let colX = margin;
            columns.forEach((col, index) => {
                const textX = index === columns.length - 1 ? colX + col.width - 14 : colX + 14;
                const align = index === columns.length - 1 ? 'right' : 'left';
                doc.text(col.title, textX, tableY + 22, { align });
                colX += col.width;
            });

            tableY += headerHeight;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
        };

        const renderRow = (order, index) => {
            if (tableY + rowHeight > pageHeight - margin) {
                doc.addPage();
                tableY = margin;
                doc.setFillColor(255, 255, 255);
                doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
                renderTableHeader();
            }

            if (index % 2 === 0) {
                doc.setFillColor(stripeBackground.r, stripeBackground.g, stripeBackground.b);
                doc.rect(margin, tableY, tableWidth, rowHeight, 'F');
            }

            let colX = margin;
            const textBaseline = tableY + 19;
            columns.forEach((col, colIndex) => {
                const value = col.getter(order) || '—';
                if (colIndex === columns.length - 1) {
                    doc.text(String(value), colX + col.width - 14, textBaseline, { align: 'right' });
                } else {
                    doc.text(String(value), colX + 14, textBaseline, { maxWidth: col.width - 28 });
                }
                colX += col.width;
            });

            tableY += rowHeight;
        };

        renderTableHeader();
        state.filteredOrders.forEach(renderRow);

        cursorY = tableY + 36;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
        doc.text('Need help with an order? Reach us at support@disciplineddisciples.com.', margin, cursorY);

        doc.save(`disciplined-disciples-order-history-${Date.now()}.pdf`);
        showAlert('success', 'Order history PDF downloaded.', true);
    }

    async function downloadInvoicePdf(order) {
        const JsPdfCtor = await resolveJsPdfConstructor();
        if (!JsPdfCtor) {
            showAlert('error', 'PDF export is unavailable right now. Please try again.');
            return;
        }

        const doc = new JsPdfCtor({ unit: 'pt', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 48;

        const accent = hexToRgb('#111827');
        const accentSecondary = hexToRgb('#2563EB');
        const neutralText = hexToRgb('#1F2937');
        const mutedText = hexToRgb('#4B5563');
        const subtleBackground = hexToRgb('#F3F4F6');
        const stripeBackground = hexToRgb('#F9FAFB');

        const logoDataUrl = await getBrandLogoDataUrl();

        doc.setFillColor(accent.r, accent.g, accent.b);
        doc.rect(0, 0, pageWidth, 120, 'F');

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, 'PNG', margin, 26, 90, 90);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.text('Invoice', margin + 110, 56);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text('Disciplined Disciples', margin + 110, 78);
        doc.text('inspired@disciplineddisciples.com', margin + 110, 96);

        const invoiceDateText = `Invoice Date: ${new Date().toLocaleDateString('en-ZA')}`;
        const invoiceNumberText = `Invoice No: ${(order.orderId || order.docId || '').toUpperCase()}`;
        doc.text(invoiceDateText, pageWidth - margin, 56, { align: 'right' });
        doc.text(invoiceNumberText, pageWidth - margin, 78, { align: 'right' });

        let cursorY = 150;
        const rightColumnX = pageWidth / 2 + 10;

        const customerEmail = state.user?.email || '';
        const customerName = state.profile?.name || (customerEmail ? customerEmail.split('@')[0] : 'Customer');
        const address = state.profile?.deliveryAddress || {};
        const addressLines = [address.line1, address.line2, address.city, address.province, address.postalCode]
            .filter(line => line && line.trim());

        doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Billed To', margin, cursorY);
        doc.text('Order Details', rightColumnX, cursorY);

        cursorY += 20;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);

        const billingBlock = [customerName, customerEmail, ...addressLines, ''];
        billingBlock.forEach(line => {
            if (!line) {
                cursorY += 2;
                return;
            }
            doc.text(line, margin, cursorY);
            cursorY += 16;
        });

        let orderDetailsY = 170;
        const details = [
            `Order ID: ${order.orderId || order.docId}`,
            `Order Date: ${formatDate(order.orderDate)}`,
            `Payment Status: ${order.paymentStatus || 'Pending'}`,
            `Order Status: ${order.status || 'Pending'}`
        ];
        details.forEach(line => {
            doc.text(line, rightColumnX, orderDetailsY);
            orderDetailsY += 16;
        });

        cursorY = Math.max(cursorY, orderDetailsY) + 10;

        doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Items', margin, cursorY);
        cursorY += 14;

        const tableWidth = pageWidth - 2 * margin;
        const rowHeight = 28;
        const headerHeight = 32;
        let tableY = cursorY;

        const itemColumns = (() => {
            const itemWidth = Math.round(tableWidth * 0.46);
            const qtyWidth = Math.round(tableWidth * 0.14);
            const priceWidth = Math.round(tableWidth * 0.16);
            const lineTotalWidth = tableWidth - itemWidth - qtyWidth - priceWidth;
            return [
                { title: 'Item', width: itemWidth, getter: item => buildItemLabel(item) },
                { title: 'Qty', width: qtyWidth, getter: item => item.quantity || 1 },
                { title: 'Price', width: priceWidth, getter: item => item.price ? formatCurrency(item.price) : '—' },
                { title: 'Line Total', width: lineTotalWidth, getter: item => item.price ? formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1)) : '—' }
            ];
        })();

        const renderItemsHeader = () => {
            doc.setFillColor(accent.r, accent.g, accent.b);
            doc.roundedRect(margin, tableY, tableWidth, headerHeight, 8, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(255, 255, 255);

            let colX = margin;
            itemColumns.forEach((col, index) => {
                const textX = index === itemColumns.length - 1 ? colX + col.width - 14 : colX + 14;
                const align = index === itemColumns.length - 1 ? 'right' : 'left';
                doc.text(col.title, textX, tableY + 21, { align });
                colX += col.width;
            });

            tableY += headerHeight;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
        };

        const renderItemRow = (item, index) => {
            if (tableY + rowHeight > pageHeight - margin) {
                doc.addPage();
                tableY = margin;
                renderItemsHeader();
            }

            if (index % 2 === 0) {
                doc.setFillColor(stripeBackground.r, stripeBackground.g, stripeBackground.b);
                doc.rect(margin, tableY, tableWidth, rowHeight, 'F');
            }

            let colX = margin;
            const baseline = tableY + 18;
            itemColumns.forEach((col, colIndex) => {
                const value = col.getter(item) || '—';
                if (colIndex === itemColumns.length - 1) {
                    doc.text(String(value), colX + col.width - 14, baseline, { align: 'right' });
                } else if (colIndex === 1) {
                    doc.text(String(value), colX + col.width / 2, baseline, { align: 'center' });
                } else {
                    doc.text(String(value), colX + 14, baseline, { maxWidth: col.width - 28 });
                }
                colX += col.width;
            });

            tableY += rowHeight;
        };

        renderItemsHeader();

        if (!order.items.length) {
            doc.setFillColor(stripeBackground.r, stripeBackground.g, stripeBackground.b);
            doc.rect(margin, tableY, tableWidth, rowHeight, 'F');
            doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
            doc.text('No line items are available for this order.', margin + 14, tableY + 18);
            tableY += rowHeight;
        } else {
            order.items.forEach(renderItemRow);
        }

        cursorY = tableY + 24;

        const subtotal = calculateSubtotal(order);
        const shipping = Number(order.shippingFee) || 0;
        const totalAmount = Number(order.totalAmount) || subtotal + shipping;

        const summaryBoxWidth = 220;
        doc.setFillColor(subtleBackground.r, subtleBackground.g, subtleBackground.b);
        doc.roundedRect(pageWidth - margin - summaryBoxWidth, cursorY, summaryBoxWidth, 110, 10, 10, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(accentSecondary.r, accentSecondary.g, accentSecondary.b);
        doc.text('Payment Summary', pageWidth - margin - summaryBoxWidth + 16, cursorY + 24);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
        let summaryY = cursorY + 44;
        doc.text(`Subtotal: ${formatCurrency(subtotal)}`, pageWidth - margin - summaryBoxWidth + 16, summaryY);
        summaryY += 20;
        doc.text(`Shipping: ${formatCurrency(shipping)}`, pageWidth - margin - summaryBoxWidth + 16, summaryY);
        summaryY += 20;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(accent.r, accent.g, accent.b);
        doc.text(`Total: ${formatCurrency(totalAmount)}`, pageWidth - margin - summaryBoxWidth + 16, summaryY);

        cursorY += 140;

        if (cursorY > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
        }

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(11);
        doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
        doc.text('Thank you for shopping with Disciplined Disciples.', margin, cursorY);
        cursorY += 18;
        doc.text('If you have any questions about this invoice, reply to inspired@disciplineddisciples.com.', margin, cursorY);

        doc.save(`disciplined-disciples-invoice-${order.orderId || order.docId}.pdf`);
        showAlert('success', 'Invoice PDF downloaded.', true);
    }

    function buildItemLabel(item) {
        const parts = [];
        if (item?.name) {
            parts.push(item.name);
        } else {
            parts.push('Item');
        }
        if (item?.size && item.size !== 'N/A') {
            parts.push(`Size: ${item.size}`);
        }
        if (item?.color) {
            parts.push(`Color: ${item.color}`);
        }
        return parts.join(' • ');
    }

    function calculateSubtotal(order) {
        const items = Array.isArray(order.items) ? order.items : [];
        const itemTotal = items.reduce((total, item) => {
            const price = Number(item?.price);
            const quantity = Number(item?.quantity) || 1;
            if (Number.isFinite(price) && price > 0) {
                return total + price * quantity;
            }
            return total;
        }, 0);

        if (itemTotal > 0) {
            return itemTotal;
        }

        const shipping = Number(order.shippingFee) || 0;
        const totalAmount = Number(order.totalAmount) || 0;
        const fallback = totalAmount - shipping;
        return fallback > 0 ? fallback : totalAmount;
    }

    function isInvoiceAvailable(order) {
        const status = (order.status || '').toLowerCase();
        const paymentStatus = (order.paymentStatus || '').toLowerCase();
        return status.includes('order placed') || paymentStatus.includes('paid');
    }

    async function resolveJsPdfConstructor() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return window.jspdf.jsPDF;
        }
        if (window.jsPDF) {
            return window.jsPDF;
        }
        return null;
    }

    async function getBrandLogoDataUrl() {
        if (cachedBrandLogoDataUrl) {
            return cachedBrandLogoDataUrl;
        }

        try {
            const dataUrl = await getPrimaryLogoDataUrl('[data-brand-logo]');
            if (dataUrl) {
                cachedBrandLogoDataUrl = dataUrl;
            }
            return cachedBrandLogoDataUrl;
        } catch (error) {
            console.warn('Unable to embed brand logo into PDF export:', error);
            return null;
        }
    }

    function showLoading(isVisible) {
        const overlay = selectors.loadingOverlay();
        if (!overlay) {
            return;
        }
        overlay.classList.toggle('hidden', !isVisible);
    }

    function hideAlert() {
        const alertEl = selectors.alert();
        if (!alertEl) {
            return;
        }
        alertEl.classList.add('hidden');
        alertEl.textContent = '';
    }

    function showAlert(type, message, autoHide = false) {
        const alertEl = selectors.alert();
        if (!alertEl) {
            return;
        }

        const classMap = {
            success: 'bg-green-50 border-green-500 text-green-700',
            error: 'bg-red-50 border-red-500 text-red-700',
            info: 'bg-blue-50 border-blue-500 text-blue-700'
        };

        alertEl.className = `mb-6 p-4 rounded border ${classMap[type] || 'bg-gray-50 border-gray-400 text-gray-700'}`;
        alertEl.textContent = message;
        alertEl.classList.remove('hidden');

        if (autoHide) {
            setTimeout(() => {
                alertEl.classList.add('hidden');
            }, 4000);
        }
    }

    function showTab(targetId) {
        if (!targetId) {
            return;
        }
        const section = document.getElementById(targetId);
        if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    return {
        init,
        showTab
    };
})();

window.AdminApp = (function() {
    const STATUS_OPTIONS = ['Awaiting Payment', 'Order Placed', 'Out for Delivery', 'Arriving Soon', 'Delivered', 'Cancelled'];
    const PAYMENT_OPTIONS = ['Pending Payment', 'Paid', 'Refunded', 'Failed', 'Cancelled'];
    const STATUS_ACTION_KEYS = ['orderPlaced', 'outForDelivery', 'eta', 'delivered'];
    const STATUS_ACTION_TEMPLATES = STATUS_ACTION_KEYS
        .map(key => window.ORDER_STATUS_TEMPLATES?.[key])
        .filter(Boolean);

    const state = {
        initialized: false,
        eventsBound: false,
        user: null,
        orders: [],
        filteredOrders: [],
        customers: [],
        customersById: {},
        customerStats: {},
        customerList: [],
        metrics: {
            totalOrders: 0,
            pendingOrders: 0,
            totalRevenue: 0,
            totalCustomers: 0
        },
        staleAwaitingPaymentTotal: 0,
        hiddenStaleOrdersForFilters: 0,
        visibleStaleOrdersForFilters: 0,
        hideStaleAwaitingPayments: true,
        loadingOrdersError: null,
        loadingCustomersError: null,
        cachedLogoDataUrl: null,
        filters: {
            status: 'all',
            customerQuery: '',
            dateFrom: '',
            dateTo: ''
        }
    };

    const selectors = {
        loadingOverlay: () => document.getElementById('admin-loading'),
        alert: () => document.getElementById('admin-alert'),
        totalOrders: () => document.getElementById('admin-total-orders'),
        pendingOrders: () => document.getElementById('admin-pending-orders'),
        totalRevenue: () => document.getElementById('admin-total-revenue'),
        totalCustomers: () => document.getElementById('admin-total-customers'),
        statusFilter: () => document.getElementById('admin-status-filter'),
        customerFilter: () => document.getElementById('admin-customer-filter'),
        dateFrom: () => document.getElementById('admin-date-from'),
        dateTo: () => document.getElementById('admin-date-to'),
        refreshBtn: () => document.getElementById('admin-refresh'),
        exportBtn: () => document.getElementById('admin-export'),
        exportPdfBtn: () => document.getElementById('admin-export-pdf'),
        ordersBody: () => document.getElementById('admin-orders-body'),
        customersBody: () => document.getElementById('admin-customers-body'),
        logoutBtn: () => document.getElementById('admin-logout'),
        ordersSummary: () => document.getElementById('admin-orders-summary'),
        staleBanner: () => document.getElementById('admin-stale-banner'),
        staleBannerTitle: () => document.getElementById('admin-stale-banner-title'),
        staleBannerDetail: () => document.getElementById('admin-stale-banner-detail'),
        staleBannerTip: () => document.getElementById('admin-stale-banner-tip'),
        staleBannerToggle: () => document.getElementById('admin-toggle-stale-orders')
    };

    function pluralize(count, singular, plural) {
        if (count === 1) {
            return singular;
        }
        return plural || `${singular}s`;
    }

    function getTemplateByKey(key) {
        if (!key) {
            return null;
        }
        const normalized = key.replace(/-/g, '_');
        return STATUS_ACTION_TEMPLATES.find(template => template.key === normalized);
    }

    function getTemplateByStatusLabel(label) {
        if (!label) {
            return null;
        }
        const normalized = label.toLowerCase();
        return STATUS_ACTION_TEMPLATES.find(template =>
            template.status.toLowerCase() === normalized || template.label.toLowerCase() === normalized
        );
    }

    function buildHistoryList(order) {
        const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
        if (!history.length) {
            return '<li class="text-xs text-slate-400">No updates yet.</li>';
        }

        const sorted = history.sort((a, b) => {
            const aTime = new Date(a.createdAt || 0).getTime();
            const bTime = new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
        }).slice(0, 4);

        return sorted.map(entry => {
            const icon = entry.icon || '';
            const when = formatDate(entry.createdAt) || '';
            const message = escapeHtml(entry.message || entry.status || 'Update');
            return `<li class="flex items-start gap-2">
                <span class="text-lg leading-none">${icon}</span>
                <div class="text-xs text-slate-500">
                    <div class="font-semibold text-slate-600">${escapeHtml(entry.status || entry.label || 'Update')}</div>
                    <div>${message}</div>
                    <div class="text-[10px] uppercase tracking-wide text-slate-400">${escapeHtml(when)} • ${escapeHtml(entry.updatedBy || 'team')}</div>
                </div>
            </li>`;
        }).join('');
    }

    function buildStatusActions(order) {
        const docId = escapeHtml(order.docId);
        const buttons = STATUS_ACTION_TEMPLATES.map(template => `<button type="button" data-doc-id="${docId}" data-status-action="${template.key}" class="px-2 py-1 text-xs rounded border border-slate-200 hover:border-blue-400 hover:text-blue-600 transition">${escapeHtml(template.buttonLabel || template.label)}</button>`);

        if (isAwaitingPaymentOrder(order)) {
            buttons.push(`<button type="button" data-doc-id="${docId}" data-action="delete-awaiting-order" class="px-2 py-1 text-xs rounded border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition">Delete order</button>`);
        }

        return buttons.join('<span class="text-slate-200">|</span>');
    }

    function isAdminPage() {
        return window.location.pathname.includes('admin-dashboard.html');
    }

    async function init() {
        if (!isAdminPage()) {
            return;
        }

        if (state.initialized) {
            return;
        }
        state.initialized = true;

        hideAlert();
        showLoading(true);

        await waitForFirebaseReady();

        const auth = window.auth || (window.firebase && window.firebase.auth && window.firebase.auth());
        if (!auth) {
            showAlert('error', 'Unable to connect to Firebase. Please try again later.');
            showLoading(false);
            return;
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
            await handleAuthenticatedAdmin(currentUser);
        } else {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    await handleAuthenticatedAdmin(user);
                } else {
                    showLoading(false);
                    window.location.replace('login-signup.html?redirect=admin-dashboard.html');
                }
            });
        }
    }

    async function handleAuthenticatedAdmin(user) {
        if (!isAdminEmail(user.email)) {
            showLoading(false);
            window.location.replace('profile.html');
            return;
        }

        state.user = user;
        window.currentUserId = user.uid;
        sessionStorage.setItem('userLoggedIn', 'true');
        sessionStorage.setItem('userId', user.uid);

        bindEvents();

        try {
            await loadCustomers();
            await loadOrders();
            composeCustomerList();
            updateMetrics();
            renderAll();
            if (state.loadingCustomersError || state.loadingOrdersError) {
                const parts = [];
                if (state.loadingOrdersError) {
                    parts.push(`orders: ${state.loadingOrdersError.message || state.loadingOrdersError}`);
                }
                if (state.loadingCustomersError) {
                    parts.push(`customers: ${state.loadingCustomersError.message || state.loadingCustomersError}`);
                }
                showAlert('error', `We could not load all admin data. Details: ${parts.join(' | ')}`);
            } else {
                hideAlert();
            }
        } catch (error) {
            console.error('AdminApp initialization error:', error);
            const details = error && error.message ? ` (${error.message})` : '';
            showAlert('error', `We could not load the admin dashboard. Please refresh and try again${details}.`);
        } finally {
            showLoading(false);
        }
    }

    async function loadCustomers() {
        state.customers = [];
        state.customersById = {};
        state.loadingCustomersError = null;

        if (!window.db) {
            state.loadingCustomersError = new Error('Firestore is not available.');
            return;
        }

        try {
            const snapshot = await usersCollection().get();
            snapshot.forEach(doc => {
                const data = doc.data() || {};
                const record = {
                    id: doc.id,
                    name: (data.name || '').trim() || 'Customer',
                    email: (data.email || '').trim(),
                    phone: (data.phone || '').trim(),
                    createdAt: coerceToDate(data.createdAt || data.memberSince),
                    deliveryAddress: data.deliveryAddress || null
                };

                state.customers.push(record);
                state.customersById[doc.id] = record;
            });
        } catch (error) {
            state.loadingCustomersError = error;
            console.error('Failed to load customers:', error);
            showAlert('error', `Unable to load customers: ${error.message || error}`);
        }
    }

    async function loadOrders() {
        state.orders = [];
        state.filteredOrders = [];
        state.customerStats = {};
        state.loadingOrdersError = null;
        state.staleAwaitingPaymentTotal = 0;

        if (!window.db) {
            state.loadingOrdersError = new Error('Firestore is not available.');
            return;
        }

        try {
            let snapshot;
            try {
                snapshot = await ordersCollection().orderBy('orderDate', 'desc').get();
            } catch (orderError) {
                if (orderError && orderError.code === 'failed-precondition') {
                    console.warn('Missing Firestore index for admin order listing, falling back to unsorted fetch.');
                    snapshot = await ordersCollection().get();
                } else {
                    throw orderError;
                }
            }

            snapshot.forEach(doc => {
                const data = doc.data() || {};
                const orderDate = coerceToDate(data.orderDate);
                const order = {
                    docId: doc.id,
                    orderId: data.orderId || doc.id,
                    userId: data.userId || '',
                    statusKey: data.statusKey || '',
                    status: data.status || 'Pending',
                    statusLabel: data.statusLabel || data.status || 'Pending',
                    statusMessage: data.statusMessage || data.lastCustomerMessage || '',
                    statusIcon: data.statusIcon || '',
                    statusUpdatedAt: coerceToDate(data.statusUpdatedAt),
                    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
                    paymentStatus: data.paymentStatus || data.payment_status || 'Pending Payment',
                    orderDate,
                    totalAmount: Number(data.totalAmount) || 0,
                    items: Array.isArray(data.items) ? data.items : [],
                    shippingFee: Number(data.shippingFee || data.shippingCost || 0),
                    trackingNumber: data.trackingNumber || '',
                    estimatedArrivalText: data.estimatedArrivalText || data.estimatedDelivery || '',
                    customerName: data.customerName || (data.customer && data.customer.name) || '',
                    customerEmail: data.customerEmail || (data.customer && data.customer.email) || '',
                    customerPhone: data.customerPhone || data.deliveryAddress?.phone || data.deliveryAddress?.phoneNumber || '',
                    deliveryAddress: data.deliveryAddress || data.shippingAddress || null,
                    lastCustomerMessage: data.lastCustomerMessage || data.statusMessage || ''
                };

                order.isAwaitingPaymentExpired = isAwaitingPaymentExpired(order);
                if (order.isAwaitingPaymentExpired) {
                    state.staleAwaitingPaymentTotal += 1;
                }

                state.orders.push(order);
            });

            state.orders.sort((a, b) => {
                const aTime = (a.orderDate instanceof Date && !Number.isNaN(a.orderDate.getTime())) ? a.orderDate.getTime() : 0;
                const bTime = (b.orderDate instanceof Date && !Number.isNaN(b.orderDate.getTime())) ? b.orderDate.getTime() : 0;
                return bTime - aTime;
            });

            state.filteredOrders = [...state.orders];
            console.info('Admin dashboard loaded orders:', state.orders.length);
        } catch (error) {
            state.loadingOrdersError = error;
            console.error('Failed to load orders:', error);
            showAlert('error', `Unable to load orders: ${error.message || error}`);
        }
    }

    function accumulateCustomerStats(order) {
        const key = order.userId || 'unknown';
        const stats = state.customerStats[key] || { orders: 0, revenue: 0, lastOrder: null };

        stats.orders += 1;
        stats.revenue += Number(order.totalAmount) || 0;

        const orderDate = coerceToDate(order.orderDate);
        if (orderDate && (!stats.lastOrder || orderDate > stats.lastOrder)) {
            stats.lastOrder = orderDate;
        }

        state.customerStats[key] = stats;
    }

    function updateMetrics() {
        const visibleOrders = state.orders.filter(order => !state.hideStaleAwaitingPayments || !order.isAwaitingPaymentExpired);

        state.metrics.totalOrders = visibleOrders.length;
        state.metrics.pendingOrders = visibleOrders.filter(order => (order.status || '').toLowerCase().includes('pending')).length;
        state.metrics.totalRevenue = visibleOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
        state.metrics.totalCustomers = state.customers.length;
    }

    function composeCustomerList() {
        state.customerStats = {};

        state.orders.forEach(order => {
            if (state.hideStaleAwaitingPayments && order.isAwaitingPaymentExpired) {
                return;
            }
            accumulateCustomerStats(order);
        });

        const combined = [];
        const seen = new Set();

        state.customers.forEach(customer => {
            const stats = state.customerStats[customer.id] || { orders: 0, revenue: 0, lastOrder: null };
            combined.push({
                id: customer.id,
                name: customer.name || customer.email || 'Customer',
                email: customer.email || '—',
                phone: customer.phone || '—',
                orders: stats.orders,
                revenue: stats.revenue,
                lastOrder: stats.lastOrder
            });
            seen.add(customer.id);
        });

        Object.entries(state.customerStats).forEach(([userId, stats]) => {
            if (seen.has(userId)) {
                return;
            }
            combined.push({
                id: userId,
                name: userId === 'unknown' ? 'Guest Checkout' : 'Customer',
                email: userId === 'unknown' ? '—' : userId,
                phone: '—',
                orders: stats.orders,
                revenue: stats.revenue,
                lastOrder: stats.lastOrder
            });
        });

        state.customerList = combined.sort((a, b) => b.revenue - a.revenue);
    }

    function bindEvents() {
        if (state.eventsBound) {
            return;
        }
        state.eventsBound = true;

        const statusFilter = selectors.statusFilter();
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                renderOrders();
            });
        }

        const customerFilter = selectors.customerFilter();
        if (customerFilter) {
            let customerDebounceHandle;
            customerFilter.addEventListener('input', () => {
                if (customerDebounceHandle) {
                    clearTimeout(customerDebounceHandle);
                }
                customerDebounceHandle = setTimeout(() => {
                    renderOrders();
                }, 200);
            });
        }

        const dateFromInput = selectors.dateFrom();
        if (dateFromInput) {
            dateFromInput.addEventListener('change', () => {
                renderOrders();
            });
        }

        const dateToInput = selectors.dateTo();
        if (dateToInput) {
            dateToInput.addEventListener('change', () => {
                renderOrders();
            });
        }

        const refreshBtn = selectors.refreshBtn();
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                refreshData();
            });
        }

        const exportBtn = selectors.exportBtn();
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                exportOrders();
            });
        }

        const exportPdfBtn = selectors.exportPdfBtn();
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener('click', () => {
                exportOrdersToPdf();
            });
        }

        const logoutBtn = selectors.logoutBtn();
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (event) => {
                event.preventDefault();
                handleLogout();
            });
        }

        const ordersBody = selectors.ordersBody();
        if (ordersBody && !ordersBody.dataset.bound) {
            ordersBody.addEventListener('change', async (event) => {
                const select = event.target.closest('select[data-doc-id]');
                if (!select) {
                    return;
                }

                const docId = select.dataset.docId;
                const field = select.dataset.field;
                const value = select.value;

                await updateOrderField(docId, field, value);
            });
            ordersBody.addEventListener('click', async (event) => {
                const deleteBtn = event.target.closest('button[data-action="delete-awaiting-order"]');
                if (deleteBtn) {
                    const docId = deleteBtn.dataset.docId;
                    await deleteAwaitingPaymentOrder(docId);
                    return;
                }

                const button = event.target.closest('button[data-status-action]');
                if (!button) {
                    return;
                }
                const docId = button.dataset.docId;
                const actionKey = button.dataset.statusAction;
                await applyStatusTemplate(docId, actionKey);
            });
            ordersBody.dataset.bound = 'true';
        }

        const staleToggle = selectors.staleBannerToggle();
        if (staleToggle) {
            staleToggle.addEventListener('click', () => {
                state.hideStaleAwaitingPayments = !state.hideStaleAwaitingPayments;
                renderOrders();
                composeCustomerList();
                renderCustomers();
                updateMetrics();
                renderMetrics();
            });
        }
    }

    async function refreshData() {
        showLoading(true);
        try {
            await loadOrders();
            composeCustomerList();
            updateMetrics();
            renderAll();
            showAlert('success', 'Dashboard data refreshed.', true);
        } catch (error) {
            console.error('Failed to refresh admin data:', error);
            showAlert('error', 'Could not refresh data. Please try again later.');
        } finally {
            showLoading(false);
        }
    }

    async function applyStatusTemplate(docId, actionKey) {
        const template = getTemplateByKey(actionKey) || getTemplateByStatusLabel(actionKey);
        if (!template) {
            showAlert('info', 'No quick message template found for that action yet.', true);
            return;
        }

        const order = state.orders.find(candidate => candidate.docId === docId);
        if (!order) {
            showAlert('error', 'Unable to locate that order. Please refresh and try again.');
            return;
        }

        let overrides = {};
        if (template.requiresInput) {
            const userInput = window.prompt(template.requiresInput.prompt, template.requiresInput.placeholderFallback || 'soon');
            if (userInput === null) {
                return;
            }
            overrides = {
                [template.requiresInput.field]: userInput.trim() || template.requiresInput.placeholderFallback || 'soon'
            };
        }

        try {
            showLoading(true);
            const actor = { email: state.user?.email, uid: state.user?.uid };
            const { payload } = buildStatusUpdatePayload(template, order, overrides, actor);
            await ordersCollection().doc(docId).set(payload, { merge: true });
            await loadOrders();
            composeCustomerList();
            updateMetrics();
            renderAll();
            const successLabel = `${template.icon || ''} ${template.label} update shared with the customer.`.trim();
            showAlert('success', successLabel, true);
        } catch (error) {
            console.error('Failed to apply status template:', error);
            showAlert('error', 'Could not send that update. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    async function updateOrderField(docId, field, value) {
        if (!docId || !field) {
            return;
        }

        if (field === 'status') {
            const template = getTemplateByStatusLabel(value);
            if (template) {
                await applyStatusTemplate(docId, template.key);
                return;
            }
        }

        try {
            await ordersCollection().doc(docId).set({
                [field]: value,
                updatedAt: window.serverTimestamp ? window.serverTimestamp() : new Date()
            }, { merge: true });

            await loadOrders();
            composeCustomerList();
            updateMetrics();
            renderAll();
            showAlert('success', 'Order updated successfully.', true);
        } catch (error) {
            console.error('Failed to update order:', error);
            showAlert('error', 'Could not update this order. Please retry.');
        }
    }

    async function deleteAwaitingPaymentOrder(docId) {
        if (!docId) {
            return;
        }

        const order = state.orders.find(candidate => candidate.docId === docId);
        if (!order) {
            showAlert('error', 'Unable to locate that order. Please refresh and try again.');
            return;
        }

        if (!isAwaitingPaymentOrder(order)) {
            showAlert('info', 'Only awaiting-payment orders can be deleted.', true);
            return;
        }

        const confirmed = window.confirm('Delete this awaiting-payment order for both the admin and customer views? This cannot be undone.');
        if (!confirmed) {
            return;
        }

        try {
            showLoading(true);
            await ordersCollection().doc(docId).delete();
            await loadOrders();
            composeCustomerList();
            updateMetrics();
            renderAll();
            showAlert('success', 'Awaiting-payment order deleted.', true);
        } catch (error) {
            console.error('Failed to delete awaiting-payment order:', error);
            showAlert('error', 'Could not delete that order. Please try again.');
        } finally {
            showLoading(false);
        }
    }

    function renderAll() {
        renderMetrics();
        renderOrders();
        renderCustomers();
    }

    function renderMetrics() {
        const totalOrdersEl = selectors.totalOrders();
        const pendingOrdersEl = selectors.pendingOrders();
        const totalRevenueEl = selectors.totalRevenue();
        const totalCustomersEl = selectors.totalCustomers();

        if (totalOrdersEl) totalOrdersEl.textContent = state.metrics.totalOrders;
        if (pendingOrdersEl) pendingOrdersEl.textContent = state.metrics.pendingOrders;
        if (totalRevenueEl) totalRevenueEl.textContent = formatCurrency(state.metrics.totalRevenue);
        if (totalCustomersEl) totalCustomersEl.textContent = state.metrics.totalCustomers;
    }

    function renderOrders() {
        const tbody = selectors.ordersBody();
        if (!tbody) {
            return;
        }

        const filters = collectActiveFilters();
        tbody.innerHTML = '';

        if (state.loadingOrdersError) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-6 text-center text-red-600">Failed to load orders: ${escapeHtml(state.loadingOrdersError.message || 'Unknown error')}</td>
                </tr>`;
            state.filteredOrders = [];
            state.visibleStaleOrdersForFilters = 0;
            state.hiddenStaleOrdersForFilters = 0;
            updateOrdersSummary(filters);
            renderStaleBanner();
            return;
        }

        state.filteredOrders = filterOrders(filters);
        state.visibleStaleOrdersForFilters = state.hideStaleAwaitingPayments
            ? 0
            : state.filteredOrders.filter(order => order.isAwaitingPaymentExpired).length;

        if (!state.filteredOrders.length) {
            const noResultsMessage = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
                ? 'The date range is invalid. Please adjust your filters.'
                : 'No orders match the selected filters.';
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="px-4 py-6 text-center text-gray-500">${escapeHtml(noResultsMessage)}</td>
                </tr>`;
            updateOrdersSummary(filters);
            renderStaleBanner();
            return;
        }

        state.filteredOrders.forEach(order => {
            tbody.appendChild(buildOrderRow(order));
        });

        updateOrdersSummary(filters);
        renderStaleBanner();
    }

    function collectActiveFilters() {
        const statusEl = selectors.statusFilter();
        const customerEl = selectors.customerFilter();
        const dateFromEl = selectors.dateFrom();
        const dateToEl = selectors.dateTo();

        state.filters.status = statusEl ? (statusEl.value || 'all') : 'all';
        state.filters.customerQuery = customerEl ? customerEl.value.trim() : '';
        state.filters.dateFrom = dateFromEl && dateFromEl.value ? dateFromEl.value : '';
        state.filters.dateTo = dateToEl && dateToEl.value ? dateToEl.value : '';

        return { ...state.filters };
    }

    function filterOrders(filters) {
        if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
            state.hiddenStaleOrdersForFilters = 0;
            return [];
        }

        state.hiddenStaleOrdersForFilters = 0;
        const statusValue = (filters.status || 'all').toLowerCase();
        const customerQuery = (filters.customerQuery || '').toLowerCase();
        const startDate = parseDateInput(filters.dateFrom, false);
        const endDate = parseDateInput(filters.dateTo, true);

        return state.orders.filter(order => {
            if (statusValue !== 'all') {
                const orderStatus = (order.status || '').toLowerCase();
                if (!orderStatus.includes(statusValue)) {
                    return false;
                }
            }

            if (customerQuery) {
                const associatedCustomer = state.customersById[order.userId] || {};
                const candidates = [
                    order.orderId,
                    order.docId,
                    order.customerName,
                    order.customerEmail,
                    associatedCustomer.name,
                    associatedCustomer.email,
                    formatDeliveryAddress(order.deliveryAddress),
                    formatDeliveryAddress(associatedCustomer.deliveryAddress)
                ];

                const matchesCustomer = candidates.some(candidate => {
                    if (!candidate) {
                        return false;
                    }
                    return String(candidate).toLowerCase().includes(customerQuery);
                });

                if (!matchesCustomer) {
                    return false;
                }
            }

            const orderDate = order.orderDate instanceof Date ? order.orderDate : coerceToDate(order.orderDate);

            if (startDate && (!orderDate || orderDate < startDate)) {
                return false;
            }

            if (endDate && (!orderDate || orderDate > endDate)) {
                return false;
            }

            if (state.hideStaleAwaitingPayments && order.isAwaitingPaymentExpired) {
                state.hiddenStaleOrdersForFilters += 1;
                return false;
            }

            return true;
        });
    }

    function parseDateInput(value, endOfDay = false) {
        if (!value) {
            return null;
        }

        const parts = value.split('-').map(Number);
        if (parts.length !== 3 || parts.some(part => Number.isNaN(part))) {
            return null;
        }

        const [year, month, day] = parts;
        const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function updateOrdersSummary(filters) {
        const summaryEl = selectors.ordersSummary ? selectors.ordersSummary() : null;
        if (!summaryEl) {
            return;
        }

        const statusSelect = selectors.statusFilter();
        const statusLabel = statusSelect && statusSelect.options && statusSelect.selectedIndex >= 0
            ? statusSelect.options[statusSelect.selectedIndex].text
            : 'All statuses';

        const customerLabel = filters.customerQuery
            ? `Customer contains "${filters.customerQuery}"`
            : 'All customers';

        let dateLabel;
        if (filters.dateFrom && filters.dateTo) {
            dateLabel = filters.dateFrom > filters.dateTo
                ? 'Date filter invalid'
                : `Date ${filters.dateFrom} → ${filters.dateTo}`;
        } else if (filters.dateFrom || filters.dateTo) {
            dateLabel = `Date ${filters.dateFrom || 'any'} → ${filters.dateTo || 'any'}`;
        } else {
            dateLabel = 'All dates';
        }

        const count = state.filteredOrders.length;
        summaryEl.textContent = `Showing ${count} ${count === 1 ? 'order' : 'orders'} (${statusLabel} • ${customerLabel} • ${dateLabel})`;
    }

    function renderStaleBanner() {
        const banner = selectors.staleBanner();
        const titleEl = selectors.staleBannerTitle();
        const detailEl = selectors.staleBannerDetail();
        const tipEl = selectors.staleBannerTip();
        const toggleBtn = selectors.staleBannerToggle();

        if (!banner || !titleEl || !detailEl || !tipEl || !toggleBtn) {
            return;
        }

        const totalStale = state.staleAwaitingPaymentTotal;
        if (!totalStale) {
            banner.classList.add('hidden');
            detailEl.textContent = '';
            tipEl.textContent = '';
            toggleBtn.setAttribute('aria-pressed', 'false');
            return;
        }

        const hiddenCount = state.hideStaleAwaitingPayments ? state.hiddenStaleOrdersForFilters : 0;
        const visibleCount = state.hideStaleAwaitingPayments ? 0 : state.visibleStaleOrdersForFilters;

        banner.classList.remove('hidden');

        if (state.hideStaleAwaitingPayments) {
            titleEl.textContent = 'Awaiting-payment orders filtered';
            if (hiddenCount) {
                detailEl.textContent = `We filtered out ${hiddenCount} ${pluralize(hiddenCount, 'order')} older than 7 days to keep this view focused.`;
            } else {
                detailEl.textContent = `None of the awaiting-payment orders in this view are older than 7 days, but ${totalStale} ${pluralize(totalStale, 'order')} overall could use a quick check-in.`;
            }
            tipEl.textContent = 'You can review those older orders anytime without changing your saved filters.';
            toggleBtn.textContent = 'Review older orders';
            toggleBtn.setAttribute('aria-pressed', 'false');
        } else {
            titleEl.textContent = 'Reviewing older awaiting-payment orders';
            if (visibleCount) {
                detailEl.textContent = `You are viewing ${visibleCount} ${pluralize(visibleCount, 'order')} that are older than 7 days.`;
            } else {
                detailEl.textContent = `None of the awaiting-payment orders matching these filters are older than 7 days, though ${totalStale} ${pluralize(totalStale, 'order')} are older overall.`;
            }
            tipEl.textContent = 'Hide them again whenever you want to focus on more recent activity.';
            toggleBtn.textContent = 'Hide older orders';
            toggleBtn.setAttribute('aria-pressed', 'true');
        }
    }

    function buildOrderRow(order) {
        const row = document.createElement('tr');
        row.className = 'border-b last:border-0 hover:bg-gray-50 transition-colors';

        const customer = state.customersById[order.userId] || {};
        const customerName = customer.name || order.customerName || 'Customer';
        const customerEmail = customer.email || order.customerEmail || '—';
    const deliveryAddress = order.deliveryAddress || customer.deliveryAddress || null;
    const shippingAddress = deliveryAddress ? formatDeliveryAddress(deliveryAddress) : '';
    const shippingPhone = order.customerPhone || customer.phone || deliveryAddress?.phone || deliveryAddress?.phoneNumber || '';
    const shippingRecipient = deliveryAddress?.name || customerName;

        const safeOrderId = escapeHtml(order.orderId);
        const safeDocId = escapeHtml(order.docId);
        const safeCustomerName = escapeHtml(customerName);
        const safeCustomerEmail = escapeHtml(customerEmail);
        const safeTracking = escapeHtml(order.trackingNumber || '');
    const safeShippingRecipient = escapeHtml(shippingRecipient || '');
    const safeShippingPhone = escapeHtml(shippingPhone || '');
    const safeShippingAddress = escapeHtml(shippingAddress || '');

        const statusOptions = buildOptions(STATUS_OPTIONS, order.status);
        const paymentOptions = buildOptions(PAYMENT_OPTIONS, order.paymentStatus);

        const items = (order.items || []).map(item => {
            const title = item.name || 'Item';
            const quantity = item.quantity || 1;
            const size = item.size && item.size !== 'N/A' ? ` (${item.size})` : '';
            const label = escapeHtml(`${title}${size}`);
            return `<li>${label} x${quantity}</li>`;
        }).join('');

        const latestMessage = escapeHtml(order.statusMessage || order.lastCustomerMessage || 'No message yet.');
        const statusActions = buildStatusActions(order);
        const historyList = buildHistoryList(order);
        const eta = order.estimatedArrivalText ? `<div class="mt-1 text-[11px] text-blue-600">ETA: ${escapeHtml(order.estimatedArrivalText)}</div>` : '';

        row.innerHTML = `
            <td class="px-4 py-3 text-sm font-semibold text-gray-800">
                <div>${safeOrderId}</div>
                <div class="text-xs text-gray-400">${safeDocId}</div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${formatDate(order.orderDate)}</td>
            <td class="px-4 py-3 text-sm text-gray-700">
                <div>${safeCustomerName}</div>
                <div class="text-xs text-gray-400">${safeCustomerEmail}</div>
                ${shippingAddress ? `
                    <div class="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <div class="font-semibold text-slate-700 uppercase tracking-wide text-[10px]">Shipping to</div>
                        <div class="mt-1">${safeShippingRecipient}</div>
                        ${safeShippingPhone ? `<div class="mt-1">${safeShippingPhone}</div>` : ''}
                        <div class="mt-1 leading-relaxed">${safeShippingAddress}</div>
                    </div>` : ''}
            </td>
            <td class="px-4 py-3 text-sm text-gray-700">${formatCurrency(order.totalAmount)}</td>
            <td class="px-4 py-3 text-sm">
                <select class="border rounded px-2 py-1 text-sm" data-doc-id="${safeDocId}" data-field="status">
                    ${statusOptions}
                </select>
            </td>
            <td class="px-4 py-3 text-sm">
                <select class="border rounded px-2 py-1 text-sm" data-doc-id="${safeDocId}" data-field="paymentStatus">
                    ${paymentOptions}
                </select>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">
                <details class="group">
                    <summary class="cursor-pointer text-blue-600 hover:underline text-sm">Items (${order.items.length})</summary>
                    <ul class="mt-2 space-y-1 text-xs text-gray-500 group-open:animate-fade">${items || '<li>No items</li>'}</ul>
                    ${safeTracking ? `<div class="mt-2 text-xs text-gray-500">Tracking: ${safeTracking}</div>` : ''}
                </details>
            </td>
            <td class="px-4 py-3 text-sm text-gray-600">
                <div class="text-xs text-gray-700 bg-slate-100 border border-slate-200 rounded px-3 py-2">${latestMessage}</div>
                ${eta}
                <ul class="mt-3 space-y-2">${historyList}</ul>
                <div class="mt-3 flex flex-wrap gap-2">${statusActions}</div>
            </td>
        `;

        return row;
    }

    function buildOptions(options, currentValue) {
        const normalized = (currentValue || '').toLowerCase();
        const unique = new Set(options.map(option => option.toLowerCase()));
        const rendered = [...options];

        if (currentValue && !unique.has(normalized)) {
            rendered.push(currentValue);
        }

        return rendered.map(option => {
            const selected = option.toLowerCase() === normalized ? 'selected' : '';
            const safeOption = escapeHtml(option);
            return `<option value="${safeOption}" ${selected}>${safeOption}</option>`;
        }).join('');
    }

    function renderCustomers() {
        const tbody = selectors.customersBody();
        if (!tbody) {
            return;
        }

        tbody.innerHTML = '';

        if (state.loadingCustomersError) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-6 text-center text-red-600">Failed to load customers: ${escapeHtml(state.loadingCustomersError.message || 'Unknown error')}</td>
                </tr>`;
            return;
        }

        if (!state.customerList.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-4 py-6 text-center text-gray-500">No customers found.</td>
                </tr>`;
            return;
        }

        state.customerList.slice(0, 10).forEach(customer => {
            const row = document.createElement('tr');
            row.className = 'border-b last:border-0';
            row.innerHTML = `
                <td class="px-4 py-3 text-sm font-semibold text-gray-800">${escapeHtml(customer.name)}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${escapeHtml(customer.email)}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${customer.orders}</td>
                <td class="px-4 py-3 text-sm text-gray-700">${formatCurrency(customer.revenue)}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${customer.lastOrder ? formatDate(customer.lastOrder) : '—'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    function exportOrders() {
        if (!state.filteredOrders.length) {
            showAlert('info', 'There are no orders to export for this filter.', true);
            return;
        }

        try {
            const header = ['Order ID', 'Customer Name', 'Customer Email', 'Status', 'Status Message', 'Payment Status', 'Date', 'Total', 'Delivery Address', 'Items'];
            const rows = state.filteredOrders.map(order => {
                const customer = state.customersById[order.userId] || {};
                const customerName = customer.name || order.customerName || 'Customer';
                const customerEmail = customer.email || order.customerEmail || '';
                const items = (order.items || []).map(item => `${item.name || 'Item'} x${item.quantity || 1}`).join('; ');
                const addressText = formatDeliveryAddress(order.deliveryAddress) || formatDeliveryAddress(customer.deliveryAddress);

                return [
                    quoteCsv(order.orderId),
                    quoteCsv(customerName),
                    quoteCsv(customerEmail),
                    quoteCsv(order.status || ''),
                    quoteCsv(order.statusMessage || order.lastCustomerMessage || ''),
                    quoteCsv(order.paymentStatus || ''),
                    quoteCsv(formatDate(order.orderDate)),
                    quoteCsv(formatCurrency(order.totalAmount)),
                    quoteCsv(addressText),
                    quoteCsv(items)
                ].join(',');
            });

            const csvContent = [header.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `disciplined-disciples-admin-orders-${Date.now()}.csv`;
            link.click();
            URL.revokeObjectURL(url);
            showAlert('success', 'CSV exported successfully.', true);
        } catch (error) {
            console.error('Failed to export CSV:', error);
            showAlert('error', `Could not generate the CSV. ${error.message || error}`);
        }
    }

    async function exportOrdersToPdf() {
        if (!state.filteredOrders.length) {
            showAlert('info', 'There are no orders to export for this filter.', true);
            return;
        }

        try {
            const JsPdfCtor = await resolveJsPdfConstructor();
            if (!JsPdfCtor) {
                showAlert('error', 'PDF export is unavailable right now. Please refresh and try again.');
                return;
            }

            const doc = new JsPdfCtor({ unit: 'pt', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 48;

            const accent = hexToRgb('#111827');
            const accentSecondary = hexToRgb('#2563EB');
            const neutralText = hexToRgb('#1F2937');
            const mutedText = hexToRgb('#4B5563');
            const subtleBackground = hexToRgb('#F3F4F6');
            const stripeBackground = hexToRgb('#F9FAFB');

            const preferredSelectors = ['[data-admin-logo]', '[data-brand-logo]'];
            const logoDataUrl = state.cachedLogoDataUrl || await getPrimaryLogoDataUrl(preferredSelectors);
            if (logoDataUrl && !state.cachedLogoDataUrl) {
                state.cachedLogoDataUrl = logoDataUrl;
            }

            doc.setFillColor(accent.r, accent.g, accent.b);
            doc.rect(0, 0, pageWidth, 110, 'F');

            if (logoDataUrl) {
                doc.addImage(logoDataUrl, 'PNG', margin, 24, 72, 72);
            }

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(22);
            doc.text('Disciplined Disciples', margin + 92, 46);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text('Admin Orders Overview', margin + 92, 68);
            doc.setFontSize(11);
            doc.text(`Generated: ${new Date().toLocaleString('en-ZA')}`, pageWidth - margin, 46, { align: 'right' });

            const filterSelect = selectors.statusFilter && selectors.statusFilter();
            const selectedOption = filterSelect && filterSelect.options ? filterSelect.options[filterSelect.selectedIndex] : null;
            const filterLabel = selectedOption ? (selectedOption.text || selectedOption.value || 'All orders') : 'All orders';
            const filters = { ...state.filters };
            const customerFilterLabel = filters.customerQuery
                ? `Customer filter: ${filters.customerQuery}`
                : 'Customer filter: All customers';
            const dateFilterLabel = (() => {
                if (filters.dateFrom && filters.dateTo) {
                    return filters.dateFrom > filters.dateTo
                        ? 'Date filter: invalid range'
                        : `Date filter: ${filters.dateFrom} → ${filters.dateTo}`;
                }
                if (filters.dateFrom || filters.dateTo) {
                    return `Date filter: ${filters.dateFrom || 'any'} → ${filters.dateTo || 'any'}`;
                }
                return 'Date filter: All dates';
            })();
            const pendingCount = state.filteredOrders.filter(order => (order.status || '').toLowerCase().includes('pending')).length;
            const totalRevenue = state.filteredOrders.reduce((sum, order) => sum + (Number(order.totalAmount) || 0), 0);
            const uniqueCustomers = new Set(state.filteredOrders.map(order => order.userId || order.customerEmail || order.customerName || order.docId)).size;

            let cursorY = 140;
            const summaryHeight = 170;

            doc.setFillColor(subtleBackground.r, subtleBackground.g, subtleBackground.b);
            doc.roundedRect(margin, cursorY, pageWidth - 2 * margin, summaryHeight, 12, 12, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(accentSecondary.r, accentSecondary.g, accentSecondary.b);
            doc.text('At a glance', margin + 20, cursorY + 28);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
            const summaryBase = cursorY + 48;
            doc.text(`Orders in view: ${state.filteredOrders.length}`, margin + 20, summaryBase);
            doc.text(`Pending orders: ${pendingCount}`, margin + 20, summaryBase + 18);
            doc.text(`Status filter: ${filterLabel}`, margin + 20, summaryBase + 36);
            doc.text(customerFilterLabel, margin + 20, summaryBase + 54);
            doc.text(dateFilterLabel, margin + 20, summaryBase + 72);
            doc.text(`Total revenue (view): ${formatCurrency(totalRevenue)}`, margin + 260, summaryBase);
            doc.text(`Unique customers: ${uniqueCustomers}`, margin + 260, summaryBase + 18);
            doc.text('Generated from: Admin dashboard', margin + 260, summaryBase + 36);

            cursorY += summaryHeight + 20;

            const tableWidth = pageWidth - 2 * margin;
            const rowHeight = 30;
            const headerHeight = 34;
            let tableY = cursorY;

            const columns = (() => {
                const base = [
                    { title: 'Order ID', width: 150, getter: order => (order.orderId || order.docId || '').slice(0, 18) },
                    { title: 'Date', width: 90, getter: order => formatDate(order.orderDate) },
                    { title: 'Status', width: 140, getter: order => order.status || '—' },
                    { title: 'Payment', width: 120, getter: order => order.paymentStatus || '—' }
                ];
                const usedWidth = base.reduce((sum, col) => sum + col.width, 0);
                base.push({ title: 'Total', width: tableWidth - usedWidth, getter: order => formatCurrency(order.totalAmount) });
                return base;
            })();

            const renderTableHeader = () => {
                doc.setFillColor(accent.r, accent.g, accent.b);
                doc.roundedRect(margin, tableY, tableWidth, headerHeight, 8, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.setTextColor(255, 255, 255);

                let colX = margin;
                columns.forEach((col, index) => {
                    const textX = index === columns.length - 1 ? colX + col.width - 14 : colX + 14;
                    const align = index === columns.length - 1 ? 'right' : 'left';
                    doc.text(col.title, textX, tableY + 22, { align });
                    colX += col.width;
                });

                tableY += headerHeight;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(neutralText.r, neutralText.g, neutralText.b);
            };

            const renderRow = (order, index) => {
                if (tableY + rowHeight > pageHeight - margin) {
                    doc.addPage();
                    tableY = margin;
                    renderTableHeader();
                }

                if (index % 2 === 0) {
                    doc.setFillColor(stripeBackground.r, stripeBackground.g, stripeBackground.b);
                    doc.rect(margin, tableY, tableWidth, rowHeight, 'F');
                }

                let colX = margin;
                const textBaseline = tableY + 19;
                columns.forEach((col, colIndex) => {
                    const value = col.getter(order) || '—';
                    if (colIndex === columns.length - 1) {
                        doc.text(String(value), colX + col.width - 14, textBaseline, { align: 'right' });
                    } else {
                        doc.text(String(value), colX + 14, textBaseline, { maxWidth: col.width - 28 });
                    }
                    colX += col.width;
                });

                tableY += rowHeight;
            };

            renderTableHeader();
            state.filteredOrders.forEach((order, index) => renderRow(order, index));

            cursorY = tableY + 36;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(10);
            doc.setTextColor(mutedText.r, mutedText.g, mutedText.b);
            doc.text('For full order management, continue in the Disciplined Disciples admin dashboard.', margin, cursorY);

            doc.save(`disciplined-disciples-admin-orders-${Date.now()}.pdf`);
            showAlert('success', 'PDF exported successfully.', true);
        } catch (error) {
            console.error('Failed to export PDF:', error);
            showAlert('error', `Could not generate the PDF. ${error.message || error}`);
        }
    }

    async function resolveJsPdfConstructor() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return window.jspdf.jsPDF;
        }
        if (window.jsPDF) {
            return window.jsPDF;
        }
        return null;
    }

    function showLoading(isVisible) {
        const overlay = selectors.loadingOverlay();
        if (!overlay) {
            return;
        }
        overlay.classList.toggle('hidden', !isVisible);
    }

    function hideAlert() {
        const alertEl = selectors.alert();
        if (!alertEl) {
            return;
        }
        alertEl.classList.add('hidden');
        alertEl.textContent = '';
    }

    function showAlert(type, message, autoHide = false) {
        const alertEl = selectors.alert();
        if (!alertEl) {
            return;
        }

        const classMap = {
            success: 'bg-emerald-50 border border-emerald-200 text-emerald-700',
            error: 'bg-red-50 border border-red-200 text-red-700',
            info: 'bg-blue-50 border border-blue-200 text-blue-700'
        };

        alertEl.className = `mb-6 px-4 py-3 rounded ${classMap[type] || 'bg-gray-50 border border-gray-200 text-gray-700'}`;
        alertEl.textContent = message;
        alertEl.classList.remove('hidden');
        if (typeof alertEl.scrollIntoView === 'function') {
            alertEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (autoHide) {
            setTimeout(() => {
                alertEl.classList.add('hidden');
            }, 4000);
        }
    }

    function ordersCollection() {
        return window.db.collection('artifacts').doc('default-app-id').collection('orders');
    }

    function usersCollection() {
        return window.db.collection('artifacts').doc('default-app-id').collection('users');
    }

    return {
        init
    };
})();

// Legacy helper for deep links into profile sections
window.showTab = function(target) {
    if (window.ProfileApp && typeof window.ProfileApp.showTab === 'function') {
        window.ProfileApp.showTab(target);
    }
};

// Handle payment completion redirects once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (window.AdminApp) {
        window.AdminApp.init();
    }

    setTimeout(() => {
        if (typeof handlePaymentCompletion === 'function') {
            handlePaymentCompletion();
        }
    }, 2000);
});

