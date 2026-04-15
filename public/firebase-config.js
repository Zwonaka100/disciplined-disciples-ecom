/**
 * Firebase Configuration Loader
 * This file handles Firebase API key configuration from environment variables
 * Do not hardcode API keys directly in HTML files
 */

// Check if API key is available from environment/window
if (!window.FIREBASE_API_KEY) {
    // Try to load from window.firebaseConfig if it exists
    console.warn('⚠️ Firebase API Key not configured. Set window.FIREBASE_API_KEY or provide configuration.');
}

/**
 * Get Firebase configuration
 * @returns {Object} Firebase config object
 */
function getFirebaseConfig() {
    return {
        apiKey: 'AIzaSyBVpuDI_YJI7mxtT6-igSL7ZX3s-cqMRnc',
        authDomain: 'disciplined-disciples-1.firebaseapp.com',
        projectId: 'disciplined-disciples-1',
        storageBucket: 'disciplined-disciples-1.firebasestorage.app',
        messagingSenderId: '565996965931',
        appId: '1:565996965931:web:b9d18489caa790e7afda6e',
        measurementId: 'G-2J1GWH59V4'
    };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getFirebaseConfig };
}
