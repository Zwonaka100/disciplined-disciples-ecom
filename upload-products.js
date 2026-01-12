// Run this in browser console to upload 3 products to Firebase with proper folder/color organization

const productsToUpload = [
    {
        id: 'hoodie',
        name: 'Faith Hoodie',
        price: 649.00,
        category: 'hoodie',
        displayImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb53d0e.jpg',
        description: 'Representing warmth and comfort in the journey of disciplined living. Made from premium, soft-touch fabric for ultimate comfort and durability.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb53d0e.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-front-6898d6eb5c3fb.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-back-6898d6eb52300.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-back-6898d6eb48eaf.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-zoomed-in-6898d6eb73758.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-black-product-details-6898d6eb317e2.jpg'
                    ]
                },
                'Maroon': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd7272343.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-front-6898dd722f6b6.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-back-6898dd72819fe.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-left-6898dd728873b.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-zoomed-in-6898dd722bebf.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-maroon-product-details-6898dd72279d8.jpg'
                    ]
                },
                'Green': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27dba00b.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd77e06c2.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898dd76853fb.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-back-6898e27d7ea61.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-back-6898e27dafc8a.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-forest-green-front-6898e27e16ff9.jpg'
                    ]
                },
                'Purple': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd75e5070.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd742d62b.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-front-6898dd74787de.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-left-6898dd7637434.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-product-details-6898dd75327de.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-purple-zoomed-in-6898e27b36e88.jpg'
                    ]
                },
                'Royal Blue': {
                    defaultImage: 'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e27913bcb.jpg',
                    images: [
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e279ec606.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-front-6898e2792ec16.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-product-details-6898dd73c4e8e.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-right-6898dd72bd2cf.jpg',
                        'Assets/Products/Hoodies/unisex-premium-hoodie-team-royal-back-6898e27a16159.jpg'
                    ]
                }
            },
            sizes: ['S', 'M', 'L', 'XL', 'XXL']
        }
    },
    {
        id: 'normal-tee',
        name: 'Purpose Tee',
        price: 299.00,
        category: 'tee',
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
                        'Assets/Products/Classic tees/unisex-classic-tee-black-left-6898f24c96f33.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-black-right-6898f24c97490.jpg'
                    ]
                },
                'White': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f0127d4ec.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f012a3d3a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-6898f012ba801.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-front-and-back-6898f0130a557.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-back-6898f012d1188.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-white-right-6898f012e01dd.jpg'
                    ]
                },
                'Pink': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010bd401.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010dcf78.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-6898f010ec1bd.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-front-and-back-6898f01122383.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-back-6898f01106182.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-azalea-back-2-6898f0111d880.jpg'
                    ]
                },
                'Red': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fbfa93.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fc0cac.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-6898f00fc19a3.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-front-and-back-6898f00fc47fa.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-back-6898f00fc1eb6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-red-left-6898f00fc2dc4.jpg'
                    ]
                },
                'Blue': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f01126e9b.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f01141d54.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-6898f011519e4.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-front-and-back-6898f0118213f.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-back-6898f0115c384.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-carolina-blue-left-6898f01166d1f.jpg'
                    ]
                },
                'Light Blue': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01035b16.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f0105e9bf.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f0106e0ff.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-front-6898f01051a32.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-back-6898f0106af27.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-tropical-blue-left-6898f0105adbd.jpg'
                    ]
                },
                'Light Green': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01074455.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01087d12.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-6898f01093f97.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-front-and-back-6898f010b8fc2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-back-6898f0109c5bd.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-irish-green-left-6898f010a4c1e.jpg'
                    ]
                },
                'Light Pink': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f01201ce6.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f012238d2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-6898f01237978.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-front-and-back-6898f0127696e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-back-6898f0124ccc6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-light-pink-back-2-6898f0126fcc5.jpg'
                    ]
                },
                'Green': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00fdb53a.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f00ff0050.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-6898f010031b2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-front-and-back-6898f01004de2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-back-6898f00fead0a.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-turf-green-left-6898f00fee46c.jpg'
                    ]
                },
                'Yellow': {
                    defaultImage: 'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f0118846a.jpg',
                    images: [
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011d25c6.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f011ea388.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-front-6898f0118e73e.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-back-6898f011bfac2.jpg',
                        'Assets/Products/Classic tees/unisex-classic-tee-yellow-haze-left-6898f011cc3cc.jpg'
                    ]
                }
            },
            sizes: ['S', 'M', 'L', 'XL']
        }
    },
    {
        id: 'oversized-tee',
        name: 'Faith Oversized Tee',
        price: 449.00,
        category: 'oversized-tee',
        displayImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-front-6898e814f093a.jpg',
        description: 'For those who embrace comfort without compromising on style or conviction.',
        options: {
            colors: {
                'Black': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-front-6898e814f093a.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-back-6898e814f17da.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-left-6898e814f11cf.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-zoomed-in-6898e814f1a0d.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-product-details-2-6898e814f1b2f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-black-right-6898e814f1e56.jpg'
                    ]
                },
                'White': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-front-6898eb2686ba9.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-back-6898eb268c699.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-left-6898eb2689fca.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-right-6898eb268a698.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-zoomed-in-6898eb268cced.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-white-product-details-2-6898eb268d32b.jpg'
                    ]
                },
                'Navy': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f347a.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-zoomed-in-6898e815033ee.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-right-6898e81502110.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-back-6898e81502e4c.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-left-6898e81501bb2.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-navy-front-6898e814f3968.jpg'
                    ]
                },
                'Khakhi': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-front-6898ea1ddbd2c.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-front-6898ea1ddba5e.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-back-6898ea1dddf60.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-right-6898ea1ddd441.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-product-details-2-6898ea1dde78f.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-sand-khaki-left-6898ea1ddd128.jpg'
                    ]
                },
                'Bone': {
                    defaultImage: 'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df2bf6.jpg',
                    images: [
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df2e7c.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-front-6898d53df239d.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-left-6898d53df4045.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-product-details-6898d53e03643.jpg',
                        'Assets/Products/Oversized tess/oversized-faded-t-shirt-faded-bone-right-6898d53e000b4.jpg'
                    ]
                },
                'City Green': {
                    defaultImage: 'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb2672f75.jpg',
                    images: [
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb267308e.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-front-6898eb2672294.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-product-details-2-6898eb26742c0.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-right-6898eb2673a98.jpg',
                        'Assets/Products/Oversized tess/unisex-oversized-t-shirt-city-green-zoomed-in-6898eb26741b8.jpg'
                    ]
                }
            },
            sizes: ['M', 'L', 'XL', 'XXL']
        }
    }
];

// Upload all 3 to Firebase
console.log('Uploading 3 products to Firebase...');
for (const product of productsToUpload) {
    window.db.collection('products').doc(product.id).set(product, { merge: false })
        .then(() => console.log(`✓ ${product.name} uploaded with ${Object.keys(product.options.colors).length} colors`))
        .catch(e => console.error(`✗ ${product.id} failed:`, e.message));
}

console.log('Upload complete. Hard refresh page (Ctrl+Shift+R) to see changes.');
