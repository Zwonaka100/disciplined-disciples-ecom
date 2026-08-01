/**
 * Firebase Configuration Loader
 * This file handles Firebase API key configuration from environment variables
 * Do not hardcode API keys directly in HTML files
 */

/**
 * Get Firebase configuration
 * @returns {Object} Firebase config object
 */
function getFirebaseConfig() {
    const runtimeApiKey = (typeof window !== 'undefined' && window.FIREBASE_API_KEY) ? window.FIREBASE_API_KEY : null;
    return {
        apiKey: runtimeApiKey || 'AIzaSyBVpuDI_YJI7mxtT6-igSL7ZX3s-cqMRnc',
        authDomain: 'disciplined-disciples-1.firebaseapp.com',
        projectId: 'disciplined-disciples-1',
        storageBucket: 'disciplined-disciples-1.firebasestorage.app',
        messagingSenderId: '565996965931',
        appId: '1:565996965931:web:b9d18489caa790e7afda6e',
        measurementId: 'G-2J1GWH59V4'
    };
}

// Initialize Firebase in browser pages that rely on compat SDK globals.
if (typeof window !== 'undefined' && typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(getFirebaseConfig());
        }
        window.firebaseConfig = getFirebaseConfig();
    } catch (err) {
        console.error('Firebase initialization failed:', err);
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getFirebaseConfig };
}
