// Global Firebase variables, explicitly declared on window for unambiguous global access
window.app = null;
window.auth = null;
window.db = null;
window.currentUserId = null; // To store the logged-in user's UID
window.currentUserProfile = {}; // To store user profile data including address
window.serverTimestamp = null; // To store Firestore's serverTimestamp function

// Promise that resolves when Firebase is fully initialized and ready
let resolveFirebaseInitialized;
window.firebaseInitialized = new Promise(resolve => {
    resolveFirebaseInitialized = resolve; // Capture the resolve function
});

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

// === NEW DIAGNOSTIC LOG ===
console.log("firebaseConfig loaded:", firebaseConfig);
console.log("firebaseConfig keys count:", Object.keys(firebaseConfig).length);
console.log("firebaseConfig.apiKey present:", !!firebaseConfig.apiKey);
// ==========================

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
        price: 299.00,
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
const VAT_RATE = 0.15; // 15% VAT for South Africa
const SHIPPING_COST = 80.00; // Example fixed shipping cost

// Expose constants globally
window.VAT_RATE = VAT_RATE;
window.SHIPPING_COST = SHIPPING_COST;

// --- Shopping Cart State ---
window.cart = []; // Array of { productId, name, price, quantity, imageUrl, size }

// Function to display messages to the user (replaces alert/confirm)
function showMessage(message, type = 'success') {
    const messageBox = document.createElement('div');
    messageBox.textContent = message;
    messageBox.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 15px 30px;
        border-radius: 8px;
        color: #fff;
        font-weight: bold;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.5s ease-in-out;
        box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    `;

    if (type === 'success') {
        messageBox.style.backgroundColor = '#28a745'; // Green
    } else if (type === 'error') {
        messageBox.style.backgroundColor = '#dc3545'; // Red
    } else if (type === 'info') {
        messageBox.style.backgroundColor = '#007bff'; // Blue (accent color)
    }

    document.body.appendChild(messageBox);

    // Fade in
    setTimeout(() => {
        messageBox.style.opacity = '1';
    }, 50);

    // Fade out and remove
    setTimeout(() => {
        messageBox.style.opacity = '0';
        messageBox.addEventListener('transitionend', () => {
            messageBox.remove();
        });
    }, 3000); // Message disappears after 3 seconds
}

// --- Cart Management Functions ---
function saveCartToLocalStorage() {
    localStorage.setItem('disciplinedDisciplesCart', JSON.stringify(window.cart));
    renderCartIcon(); // Update cart icon whenever cart changes
}

function loadCartFromLocalStorage() {
    const storedCart = localStorage.getItem('disciplinedDisciplesCart');
    if (storedCart) {
        window.cart = JSON.parse(storedCart);
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
    if (document.body.classList.contains('cart-page') && typeof renderCartPage === 'function') {
        renderCartPage();
    }
    if (document.body.classList.contains('checkout-page') && typeof renderCheckoutSummary === 'function') {
        renderCheckoutSummary();
    }
}

function updateCartItemQuantity(productId, size, newQuantity) {
    // Ensure size is a string for consistent comparison
    size = String(size);

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
        if (document.body.classList.contains('cart-page') && typeof renderCartPage === 'function') {
            renderCartPage();
        }
        if (document.body.classList.contains('checkout-page') && typeof renderCheckoutSummary === 'function') {
            renderCheckoutSummary();
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
    if (document.body.classList.contains('cart-page') && typeof renderCartPage === 'function') {
        renderCartPage();
    }
    if (document.body.classList.contains('checkout-page') && typeof renderCheckoutSummary === 'function') {
        renderCheckoutSummary();
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
        const userDocRef = window.doc(window.db, "artifacts", appId, "users", window.currentUserId);
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
        const userDocRef = window.doc(window.db, "artifacts", appId, "users", window.currentUserId);
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
        const ordersCollectionRef = window.collection(window.db, "artifacts", appId, "orders");
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

        const cloudFunctionUrl = `https://your-cloud-function-endpoint.cloudfunctions.net/preparePayfastPayment`; // <--- REPLACE THIS LATER!
        const idToken = await window.auth.currentUser.getIdToken();

        const response = await fetch(cloudFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                orderId: orderId,
                amount: totalAmount.toFixed(2),
                itemName: `Disciplined Disciples Order #${orderId}`,
                emailAddress: window.auth.currentUser.email,
                firstName: window.currentUserProfile.firstName || '',
                lastName: window.currentUserProfile.lastName || '',
                phoneNumber: deliveryAddress.phoneNumber || '',
                returnUrl: `https://${window.location.hostname}/order-status.html?orderId=${orderId}&status=success`,
                cancelUrl: `https://${window.location.hostname}/order-status.html?orderId=${orderId}&status=cancelled`,
                notifyUrl: `https://your-cloud-function-endpoint.cloudfunctions.net/payfastITNHandler`, // <--- ANOTHER CLOUD FUNCTION FOR ITN, REPLACE THIS LATER!
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to get Payfast parameters from backend.');
        }

        const payfastParams = await response.json();
        console.log("Payfast parameters received:", payfastParams);

        const payfastForm = document.createElement('form');
        payfastForm.method = 'POST';
        payfastForm.action = 'https://www.payfast.co.za/eng/process'; // Payfast production URL

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

// --- Authentication UI Update Function ---
// Moved outside DOMContentLoaded to be globally accessible
function updateAuthUI(isLoggedIn) {
    const authLinksDesktop = document.querySelector('.nav-menu ul');
    const authLinksMobile = document.querySelector('.mobile-menu ul');

    console.log("updateAuthUI called. Is logged in:", isLoggedIn);
    console.log("Auth Links Desktop element:", authLinksDesktop);
    console.log("Auth Links Mobile element:", authLinksMobile);

    // Defensive check: if no navigation containers, cannot update UI
    if (!authLinksDesktop && !authLinksMobile) {
        console.error("Auth navigation containers not found. Cannot update UI.");
        return;
    }

    // Find the cart links for positioning; they should always be present.
    const cartLinkDesktop = authLinksDesktop?.querySelector('.nav-link[href="cart.html"]');
    const cartLinkMobile = authLinksMobile?.querySelector('.nav-link-mobile[href="cart.html"]');

    console.log("Desktop Cart Link found (for positioning):", !!cartLinkDesktop);
    console.log("Mobile Cart Link found (for positioning):", !!cartLinkMobile);

    // Remove any previously added auth links to prevent duplicates on state change
    authLinksDesktop?.querySelectorAll('.auth-link').forEach(link => link.remove());
    authLinksMobile?.querySelectorAll('.auth-link-mobile').forEach(link => link.remove());

    if (isLoggedIn) {
        // Logged In: Show My Account and Logout
        const myAccountLi = document.createElement('li');
        myAccountLi.classList.add('auth-link');
        myAccountLi.innerHTML = '<a href="profile.html" class="nav-link"><i class="fas fa-user"></i> My Account</a>'; // <-- Link to profile.html
        if (authLinksDesktop) {
            const cartLinkDesktop = authLinksDesktop.querySelector('.nav-link[href="cart.html"]');
            if (cartLinkDesktop) { authLinksDesktop.insertBefore(myAccountLi, cartLinkDesktop.nextSibling); }
            else { authLinksDesktop.appendChild(myAccountLi); }
        }

        const logoutLi = document.createElement('li');
        logoutLi.classList.add('auth-link');
        logoutLi.innerHTML = '<a href="#" id="logout-btn" class="nav-link">Logout</a>';
        authLinksDesktop?.appendChild(logoutLi);

        // Mobile menu
        const myAccountLiMobile = document.createElement('li');
        myAccountLiMobile.classList.add('auth-link-mobile');
        myAccountLiMobile.innerHTML = '<a href="profile.html" class="nav-link-mobile"><i class="fas fa-user"></i> My Account</a>'; // <-- Link to profile.html
        if (authLinksMobile) {
            const cartLinkMobile = authLinksMobile.querySelector('.nav-link-mobile[href="cart.html"]');
            if (cartLinkMobile) { authLinksMobile.insertBefore(myAccountLiMobile, cartLinkMobile.nextSibling); }
            else { authLinksMobile.appendChild(myAccountLiMobile); }
        }

        const logoutLiMobile = document.createElement('li');
        logoutLiMobile.classList.add('auth-link-mobile');
        logoutLiMobile.innerHTML = '<a href="#" id="logout-btn-mobile" class="nav-link-mobile">Logout</a>';
        authLinksMobile?.appendChild(logoutLiMobile);

        document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
        document.getElementById('logout-btn-mobile')?.addEventListener('click', handleLogout);

        document.querySelectorAll('a[href="login-signup.html"]').forEach(link => link.style.display = 'none');
    } else {
        // Not Logged In: Show Login/Signup
        const loginSignupLi = document.createElement('li');
        loginSignupLi.classList.add('auth-link');
        loginSignupLi.innerHTML = '<a href="login-signup.html" class="nav-link"><i class="fas fa-sign-in-alt"></i> Login/Signup</a>';
        if (authLinksDesktop) {
            if (cartLinkDesktop) { authLinksDesktop.insertBefore(loginSignupLi, cartLinkDesktop.nextSibling); } // Insert after cart
            else { authLinksDesktop.appendChild(loginSignupLi); }
        }

        // Mobile menu
        const loginSignupLiMobile = document.createElement('li');
        loginSignupLiMobile.classList.add('auth-link-mobile');
        loginSignupLiMobile.innerHTML = '<a href="login-signup.html" class="nav-link-mobile"><i class="fas fa-sign-in-alt"></i> Login/Signup</a>';
        if (authLinksMobile) {
            if (cartLinkMobile) { authLinksMobile.insertBefore(loginSignupLiMobile, cartLinkMobile.nextSibling); } // Insert after cart
            else { authLinksMobile.appendChild(loginSignupLiMobile); }
        }

        // Ensure any static "Login/Signup" links are visible
        document.querySelectorAll('a[href="login-signup.html"]').forEach(link => link.style.display = 'block');
    }
    renderCartIcon(); // Update cart count to ensure it's always accurate
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

        // Fetch name from Firestore, fallback to displayName/email
        window.db.collection('artifacts').doc('default-app-id').collection('users').doc(user.uid).get().then(doc => {
            let name = doc.exists && doc.data().name ? doc.data().name : (user.displayName || user.email);
            profileRibbonName.textContent = name;
            profileRibbonAvatar.textContent = name.split(' ').map(n => n[0]).join('').toUpperCase();
        });
    } else {
        // Show login/signup, hide profile ribbon
        if (loginSignupLink) loginSignupLink.style.display = 'inline-block';
        if (loginSignupLinkMobile) loginSignupLinkMobile.style.display = 'inline-block';
        if (profileRibbon) profileRibbon.style.display = 'none';
    }
}

// Ensure only one login/signup button per menu (desktop/mobile) in your HTML
// Example for desktop: <a href="login-signup.html" id="login-signup-link" class="nav-link">...</a>
// Example for mobile: <a href="login-signup.html" id="login-signup-link-mobile" class="nav-link-mobile">...</a>

// --- Profile Ribbon Click: Go to Profile ---
document.addEventListener('DOMContentLoaded', () => {
    const profileRibbon = document.getElementById('profile-ribbon');
    if (profileRibbon) {
        profileRibbon.onclick = () => {
            window.location.href = "profile.html";
        };
    }
});

// --- Auth State Listener ---
window.auth.onAuthStateChanged(updateHeaderUI);

// --- Firebase Initialization Function ---
async function initFirebase() {
    console.log("Attempting to initialize Firebase...");
    // Check if firebaseConfig is populated
    if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.apiKey) {
        console.error("firebaseConfig is empty or missing apiKey. Firebase will not initialize. Current config:", firebaseConfig); // Added config to log
        showMessage("Firebase configuration missing. Core features will not work.", "error");
        updateAuthUI(false);
        if (resolveFirebaseInitialized) {
            resolveFirebaseInitialized(false);
            resolveFirebaseInitialized = null;
        }
        return false;
    }

    try {
        window.app = window.firebase.initializeApp(firebaseConfig);
        window.auth = window.firebase.auth();
        window.db = window.firebase.firestore();
        window.serverTimestamp = window.firebase.firestore.FieldValue.serverTimestamp;

        console.log("Firebase objects assigned: app=", !!window.app, "auth=", !!window.auth, "db=", !!window.db);

        if (window.auth) {
            if (initialAuthToken) {
                await window.auth.signInWithCustomToken(initialAuthToken);
                console.log('Signed in with custom token.');
            } else {
                await window.auth.signInAnonymously();
                console.log('Signed in anonymously.');
            }

            window.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    window.currentUserId = user.uid;
                    console.log('User is signed in (onAuthStateChanged):', user.uid);
                    console.log('Current page:', window.location.pathname);
                    updateAuthUI(true);
                    if (document.body.classList.contains('checkout-page')) {
                         await window.loadUserDeliveryAddress();
                    }
                } else {
                    window.currentUserId = null;
                    window.currentUserProfile = {};
                    console.log('User is signed out (onAuthStateChanged).');
                    updateAuthUI(false);
                }
            });
            return true;
        } else {
            console.error("window.auth was null after getAuth. Firebase Auth not properly initialized.");
            showMessage("Firebase Authentication failed to initialize.", "error");
            updateAuthUI(false);
            if (resolveFirebaseInitialized) {
                resolveFirebaseInitialized(false);
                resolveFirebaseInitialized = null;
            }
            return false;
        }

    } catch (error) {
        console.error("Error during Firebase initialization (initFirebase function):", error.message);
        showMessage("Failed to initialize Firebase: " + error.message + ". Check console for details.", "error");
        updateAuthUI(false);
        if (resolveFirebaseInitialized) {
            resolveFirebaseInitialized(false);
            resolveFirebaseInitialized = null;
        }
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
        if (resolveFirebaseInitialized) {
            resolveFirebaseInitialized(true);
            resolveFirebaseInitialized = null;
        }
        updateAuthUI(!!window.auth.currentUser);
    } else {
        console.error("Firebase initialization failed. Some application features will not work.");
        if (resolveFirebaseInitialized) {
            resolveFirebaseInitialized(false);
            resolveFirebaseInitialized = null;
        }
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
            await window.setDoc(window.doc(window.db, "artifacts", appId, "users", userCredential.user.uid), {
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

    async function handleLogout() {
        try {
            await window.auth.signOut();
            showMessage("Logged out.");
            window.location.href = "index.html";
        } catch (error) {
            showMessage("Logout failed.", "error");
        }
    }

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
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-confirm-password').value;

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
                // Create user profile in Firestore
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
    window.getCartItemCount = getCartItemCount;
    window.products = products;
    window.getProductById = getProductById;
    window.showMessage = showMessage;

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
    const cartContainer = document.getElementById('cart-items');
    if (!cartContainer) return;
    cartContainer.innerHTML = '';
    if (window.cart.length === 0) {
        cartContainer.innerHTML = '<p>Your cart is empty.</p>';
        return;
    }
    window.cart.forEach(item => {
        cartContainer.innerHTML += `
            <div class="cart-item">
                <img src="${item.imageUrl || item.displayImage}" alt="${item.name}" class="cart-item-img">
                <div class="cart-item-details">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-size">Size: ${item.size}</div>
                    <div class="cart-item-qty">Qty: ${item.quantity}</div>
                    <div class="cart-item-price">R${item.price.toFixed(2)}</div>
                </div>
                <button onclick="window.removeCartItem('${item.productId}', '${item.size}')">Remove</button>
            </div>
        `;
    });
    // Optionally, show totals
    const subtotal = window.getCartSubtotal();
    const vat = window.getCartVAT(subtotal);
    const shipping = window.cart.length > 0 ? window.SHIPPING_COST : 0;
    const total = window.getCartTotal(subtotal, vat, shipping);
    cartContainer.innerHTML += `
        <div class="cart-totals">
            <div>Subtotal: R${subtotal.toFixed(2)}</div>
            <div>VAT: R${vat.toFixed(2)}</div>
            <div>Shipping: R${shipping.toFixed(2)}</div>
            <div><strong>Total: R${total.toFixed(2)}</strong></div>
            <a href="checkout.html" class="btn btn-primary">Proceed to Checkout</a>
        </div>
    `;
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

// --- Profile Ribbon Dropdown Navigation ---
document.addEventListener('DOMContentLoaded', () => {
    const profileRibbon = document.getElementById('profile-ribbon');
    const profileDropdown = document.getElementById('profile-dropdown');
    if (profileRibbon && profileDropdown) {
        // Toggle dropdown on click
        profileRibbon.onclick = function(e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        };
        // Hide dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!profileRibbon.contains(e.target)) profileDropdown.classList.add('hidden');
        });
        // Profile link
        profileDropdown.querySelector('a[href="profile.html"]')?.addEventListener('click', function(e) {
            e.preventDefault();

            window.location.href = "profile.html";
        });
        // Account link
        profileDropdown.querySelector('a[href="profile.html#account"]')?.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = "profile.html#account";
        });
        // Orders link
        profileDropdown.querySelector('a[href="profile.html#orders"]')?.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = "profile.html#orders";
        });
        // Logout button
        document.getElementById('dropdown-logout-btn')?.addEventListener('click', async function() {
            if ( window.auth) {
                await window.auth.signOut();
                window.location.href = "index.html";
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Profile dropdown navigation
    document.querySelector('a[href="profile.html"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = "profile.html#dashboard";
    });
    document.querySelector('a[href="profile.html#account"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = "profile.html#account";
    });
    document.querySelector('a[href="profile.html#orders"]')?.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = "profile.html#orders";
    });
    document.getElementById('dropdown-logout-btn')?.addEventListener('click', async function() {
        if (window.auth) {
            await window.auth.signOut();
            window.location.href = "index.html";
        }
    });

    // Scroll to section if hash is present
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
document.addEventListener('DOMContentLoaded', async () => {
    // Only run on profile page
    if (!document.body.classList.contains('profile-page') && !window.location.pathname.includes('profile.html')) return;

    // Elements
    const dashboardAvatar = document.getElementById('dashboard-avatar');
    const dashboardName = document.getElementById('dashboard-name');
    const dashboardEmail = document.getElementById('dashboard-email');
    const dashboardAddress = document.getElementById('dashboard-address');
    const ordersList = document.getElementById('orders-list');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const editAddressBtn = document.getElementById('edit-address-btn');

    // Modals
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const profileForm = document.getElementById('profile-form');
    const profileUpdateMsg = document.getElementById('profile-update-message');
    const addressModal = document.getElementById('address-modal');
    const closeAddressModal = document.getElementById('close-address-modal');
    const addressForm = document.getElementById('address-form');
    const addressUpdateMsg = document.getElementById('address-update-message');

    // Helper: Render Profile
    async function renderProfile() {
        if (!window.currentUserId) {
            window.location.href = "login-signup.html";
            return;
        }
        // Fetch profile from Firestore
        const userDoc = await window.db.collection('artifacts').doc('default-app-id')
            .collection('users').doc(window.currentUserId).get();
        if (!userDoc.exists) return;
        window.currentUserProfile = userDoc.data();

        // Avatar
        if (window.currentUserProfile.avatarUrl) {
            dashboardAvatar.innerHTML = `<img src="${window.currentUserProfile.avatarUrl}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        } else {
            dashboardAvatar.textContent = (window.currentUserProfile.name || window.currentUserProfile.email || "U")[0].toUpperCase();
        }
        // Name & Email
        dashboardName.textContent = window.currentUserProfile.name || "";
        dashboardEmail.textContent = window.currentUserProfile.email || "";

        // Address
        const addr = window.currentUserProfile.deliveryAddress || {};
        dashboardAddress.innerHTML = `
            <div>${addr.line1 || ""}</div>
            <div>${addr.line2 || ""}</div>
            <div>${addr.city || ""}, ${addr.province || ""}</div>
            <div>${addr.postalCode || ""}</div>
        `;

        // Orders
        renderOrderHistory();
    }

    // Helper: Render Order History
    async function renderOrderHistory() {
        ordersList.innerHTML = "<div>Loading orders...</div>";
        const ordersRef = window.db.collection('artifacts').doc('default-app-id')
            .collection('orders').where("userId", "==", window.currentUserId).orderBy("orderDate", "desc");
        const snapshot = await ordersRef.get();
        if (snapshot.empty) {
            ordersList.innerHTML = "<div>No orders found.</div>";
            return;
        }
        ordersList.innerHTML = "";
        snapshot.forEach(doc => {
            const order = doc.data();
            const productsHtml = order.items.map(item => `
                <div class="flex items-center mb-2">
                    <img src="${item.imageUrl}" alt="${item.name}" style="width:40px;height:40px;border-radius:6px;margin-right:10px;">
                    <span>${item.name} ${item.size && item.size !== 'N/A' ? `(Size: ${item.size})` : ''} x${item.quantity}</span>
                </div>
            `).join('');
            ordersList.innerHTML += `
                <div class="border rounded-lg p-4 bg-gray-50">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-semibold">Order #${doc.id}</span>
                        <span class="text-sm text-gray-600">${order.status || "Pending"}</span>
                    </div>
                    <div class="mb-2">${productsHtml}</div>
                    <div class="text-sm text-gray-700 mb-1">Total: R${order.totalAmount?.toFixed(2) || "0.00"}</div>
                    <div class="text-xs text-gray-500">Date: ${order.orderDate?.toDate().toLocaleString() || ""}</div>
                    ${order.invoiceUrl ? `<a href="${order.invoiceUrl}" target="_blank" class="text-blue-600 underline text-sm">Download Invoice</a>` : ""}
                    ${order.trackingNumber ? `<div class="text-green-600 text-sm">Tracking: ${order.trackingNumber}</div>` : ""}
                </div>
            `;
        });
    }

    // Edit Profile Modal
    editProfileBtn.onclick = () => {
        profileModal.classList.remove('hidden');
        profileForm['profile-name'].value = window.currentUserProfile.name || "";
        profileForm['profile-phone'].value = window.currentUserProfile.phone || "";
        profileUpdateMsg.textContent = "";
    };
    closeProfileModal.onclick = () => profileModal.classList.add('hidden');

    profileForm.onsubmit = async function(e) {
        e.preventDefault();
        const name = profileForm['profile-name'].value.trim();
        const phone = profileForm['profile-phone'].value.trim();
        let avatarUrl = window.currentUserProfile.avatarUrl || "";
        // Handle avatar upload (optional)
        const avatarFile = profileForm['profile-avatar-upload'].files[0];
        if (avatarFile) {
            // You need Firebase Storage for this, here is a placeholder:
            // avatarUrl = await uploadAvatarToStorage(avatarFile, window.currentUserId);
        }
        await window.db.collection('artifacts').doc('default-app-id')
            .collection('users').doc(window.currentUserId).update({ name, phone, avatarUrl });
        window.currentUserProfile.name = name;
        window.currentUserProfile.phone = phone;
        window.currentUserProfile.avatarUrl = avatarUrl;
        profileUpdateMsg.textContent = "Profile updated!";
        setTimeout(() => { profileModal.classList.add('hidden'); renderProfile(); }, 1200);
    };

    // Edit Address Modal
    editAddressBtn.onclick = () => {
        addressModal.classList.remove('hidden');
        const addr = window.currentUserProfile.deliveryAddress || {};
        addressForm['address-line1'].value = addr.line1 || "";
        addressForm['address-line2'].value = addr.line2 || "";
        addressForm['address-city'].value = addr.city || "";
        addressForm['address-province'].value = addr.province || "";
        addressForm['address-postal'].value = addr.postalCode || "";
        addressUpdateMsg.textContent = "";
    };
    closeAddressModal.onclick = () => addressModal.classList.add('hidden');

    addressForm.onsubmit = async function(e) {
        e.preventDefault();
        const deliveryAddress = {
            line1: addressForm['address-line1'].value.trim(),
            line2: addressForm['address-line2'].value.trim(),
            city: addressForm['address-city'].value.trim(),
            province: addressForm['address-province'].value.trim(),
            postalCode: addressForm['address-postal'].value.trim()
        };
        await window.db.collection('artifacts').doc('default-app-id')
            .collection('users').doc(window.currentUserId).update({ deliveryAddress });
        window.currentUserProfile.deliveryAddress = deliveryAddress;
        addressUpdateMsg.textContent = "Address updated!";
        setTimeout(() => { addressModal.classList.add('hidden'); renderProfile(); }, 1200);
    };

    // Logout
    logoutBtn.onclick = async () => {
        await window.auth.signOut();
        window.location.href = "index.html";
    };

    // Initial render
    renderProfile();
});

