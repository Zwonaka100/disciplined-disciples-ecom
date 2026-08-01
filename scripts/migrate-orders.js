#!/usr/bin/env node
/*
 * One-time data migration for Disciplined Disciples orders.
 *
 *   B5: Backfill orderType, hasEbookItem, normalize legacy digital order status,
 *       and grant missing ebook entitlements.
 *   B6: Fix legacy order status drift (e.g. paid digital orders still showing
 *       "Arriving Soon" / "Out for Delivery" — those are physical-only statuses).
 *
 * Safety:
 *   - Default mode is DRY RUN. Nothing is written.
 *   - Pass `--apply` to actually write changes.
 *   - Pass `--limit=N` to only process the first N orders (useful for verifying).
 *   - Pass `--order=<docId>` to scope to a single order.
 *
 * Auth:
 *   - Uses GOOGLE_APPLICATION_CREDENTIALS or `gcloud auth application-default login`.
 *   - Or pass `--service-account=path/to/key.json`.
 *
 * Usage examples (run from repo root):
 *   node scripts/migrate-orders.js                       # dry run, all orders
 *   node scripts/migrate-orders.js --limit=5             # dry run, first 5
 *   node scripts/migrate-orders.js --order=DD1779...     # dry run, single order
 *   node scripts/migrate-orders.js --apply               # APPLY all changes
 *   node scripts/migrate-orders.js --apply --limit=1     # APPLY one change
 */

'use strict';

const path = require('path');

// --- CLI parsing ---------------------------------------------------------
const args = process.argv.slice(2);
function flag(name) { return args.includes(`--${name}`); }
function value(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const APPLY = flag('apply');
const DRY_RUN = !APPLY;
const LIMIT = Number(value('limit', '0')) || 0;
const ONLY_ORDER = value('order', null);
const SERVICE_ACCOUNT = value('service-account', null);
const PROJECT_ID = value('project', 'disciplined-disciples-1');

// --- firebase-admin (reuse the one installed for functions/) -------------
const adminModulePath = path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin');
let admin;
try {
  admin = require(adminModulePath);
} catch (err) {
  console.error('Failed to load firebase-admin from functions/node_modules.');
  console.error('Run `npm install` inside the functions/ directory first.');
  console.error(err.message);
  process.exit(1);
}

if (SERVICE_ACCOUNT) {
  const sa = require(path.resolve(SERVICE_ACCOUNT));
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: PROJECT_ID });
} else {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

// --- Shared classification (mirrors functions/index.js + script.js) ------
function isEbookItem(item) {
  const productId = (item?.productId || item?.id || '').toString().toLowerCase();
  const name = (item?.name || '').toString().toLowerCase();
  const fulfillment = (item?.fulfillmentType || '').toString().toLowerCase();
  return productId === 'ebook' || name.includes('ebook') || fulfillment === 'digital';
}
function deriveOrderType(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return 'physical';
  const hasDigital = items.some(isEbookItem);
  const hasPhysical = items.some((i) => !isEbookItem(i));
  if (hasDigital && hasPhysical) return 'mixed';
  if (hasDigital) return 'digital';
  return 'physical';
}
function isPaidStatus(status) {
  return ['paid', 'complete', 'completed', 'success'].includes((status || '').toString().toLowerCase());
}

// Physical-shipping statuses that should NEVER appear on a digital-only order.
const PHYSICAL_ONLY_STATUSES = ['out for delivery', 'arriving soon', 'arriving', 'in transit'];

// --- Plan one order ------------------------------------------------------
function planUpdatesForOrder(docId, order) {
  const update = {};
  const reasons = [];

  // 1. Per-item fulfillmentType backfill.
  const items = Array.isArray(order.items) ? order.items : [];
  let itemsChanged = false;
  const newItems = items.map((raw) => {
    const item = Object.assign({}, raw || {});
    if (!item.fulfillmentType) {
      item.fulfillmentType = isEbookItem(item) ? 'digital' : 'physical';
      itemsChanged = true;
    }
    return item;
  });
  if (itemsChanged) {
    update.items = newItems;
    reasons.push('items.fulfillmentType backfilled');
  }

  // Use the post-backfill items for classification.
  const classified = Object.assign({}, order, { items: newItems });
  const computedType = deriveOrderType(classified);
  const computedHasEbook = newItems.some(isEbookItem);

  // 2. orderType backfill.
  if (order.orderType !== computedType) {
    update.orderType = computedType;
    reasons.push(`orderType: ${order.orderType || 'missing'} -> ${computedType}`);
  }

  // 3. hasEbookItem backfill.
  if (order.hasEbookItem !== computedHasEbook) {
    update.hasEbookItem = computedHasEbook;
    reasons.push(`hasEbookItem: ${order.hasEbookItem ?? 'missing'} -> ${computedHasEbook}`);
  }

  // 4. Legacy digital status drift fix.
  // Digital-only + paid orders should be "Delivered (Digital)" — never the
  // shipping-style statuses. Only rewrite if the current status is shipping-style;
  // never overwrite "Cancelled", "Refunded", etc.
  const isDigitalOnly = computedType === 'digital';
  const paid = isPaidStatus(order.paymentStatus);
  const currentStatus = (order.status || '').toLowerCase();
  const isShippingStatus = PHYSICAL_ONLY_STATUSES.some((s) => currentStatus.includes(s));
  if (isDigitalOnly && paid && (isShippingStatus || currentStatus === 'order placed')) {
    if (order.status !== 'Delivered (Digital)') {
      update.status = 'Delivered (Digital)';
      update.statusKey = 'delivered_digital';
      update.statusIcon = '\u{1F4D6}';
      update.statusMessage = 'Your eBook is ready and permanently saved to your profile. Sign in any time to download it.';
      reasons.push(`status: "${order.status || ''}" -> "Delivered (Digital)" (digital-only paid order)`);
    }
  }

  // 5. Strip shipping ETA fields for digital-only orders if present.
  if (isDigitalOnly) {
    if (order.trackingNumber) {
      update.trackingNumber = null;
      reasons.push('trackingNumber cleared (digital order)');
    }
    if (order.estimatedDelivery) {
      update.estimatedDelivery = null;
      reasons.push('estimatedDelivery cleared (digital order)');
    }
    if (order.estimatedArrivalText) {
      update.estimatedArrivalText = null;
      reasons.push('estimatedArrivalText cleared (digital order)');
    }
  }

  return { update, reasons, computedType, computedHasEbook, paid, isDigitalOnly };
}

// --- Entitlement plan ----------------------------------------------------
async function ensureEntitlement(userId, orderId) {
  // Check whether the entitlement already exists; if so, skip.
  const ref = db.collection('ebookEntitlements').doc(userId).collection('items').doc(orderId || 'unknown');
  const snap = await ref.get();
  if (snap.exists) return { granted: false, reason: 'already exists' };

  if (APPLY) {
    await ref.set({
      productId: 'ebook',
      orderId: orderId || null,
      grantedAt: FieldValue.serverTimestamp(),
      source: 'migration-b5'
    }, { merge: true });
    await db.collection('ebookEntitlements').doc(userId).set({
      hasEbook: true,
      lastGrantedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  return { granted: true, reason: 'created' };
}

// --- Main ----------------------------------------------------------------
async function main() {
  console.log('====================================================================');
  console.log(' Disciplined Disciples — Orders Migration (B5 + B6)');
  console.log(` Project: ${PROJECT_ID}`);
  console.log(` Mode:    ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (no writes)'}`);
  if (LIMIT) console.log(` Limit:   first ${LIMIT} orders`);
  if (ONLY_ORDER) console.log(` Order:   ${ONLY_ORDER} only`);
  console.log('====================================================================\n');

  const ordersRef = db.collection('artifacts').doc('default-app-id').collection('orders');

  let query = ordersRef;
  if (ONLY_ORDER) {
    const doc = await ordersRef.doc(ONLY_ORDER).get();
    if (!doc.exists) {
      console.error(`Order ${ONLY_ORDER} not found.`);
      process.exit(2);
    }
    await processOne(doc);
  } else {
    const snap = LIMIT ? await query.limit(LIMIT).get() : await query.get();
    console.log(`Found ${snap.size} order(s) to inspect.\n`);
    let processed = 0;
    for (const doc of snap.docs) {
      await processOne(doc);
      processed += 1;
    }
    console.log(`\nInspected ${processed} order(s).`);
  }

  console.log('\n--- Summary ---');
  console.log(`Orders needing update : ${stats.changed}`);
  console.log(`Orders already correct: ${stats.skipped}`);
  console.log(`Entitlements created  : ${stats.entitlementsGranted}`);
  console.log(`Entitlements skipped  : ${stats.entitlementsSkipped}`);
  if (DRY_RUN) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to commit.');
  } else {
    console.log('\nAPPLY — changes were written to Firestore.');
  }
}

const stats = { changed: 0, skipped: 0, entitlementsGranted: 0, entitlementsSkipped: 0 };

async function processOne(doc) {
  const order = doc.data() || {};
  const orderId = order.orderId || doc.id;
  const { update, reasons, computedHasEbook, paid, isDigitalOnly } = planUpdatesForOrder(doc.id, order);

  const hasOrderUpdates = Object.keys(update).length > 0;
  const userId = order.userId;
  const shouldGrantEntitlement = Boolean(userId && paid && computedHasEbook);

  if (!hasOrderUpdates && !shouldGrantEntitlement) {
    stats.skipped += 1;
    return;
  }

  console.log(`Order ${orderId}  (doc ${doc.id})`);
  console.log(`  type=${deriveOrderType({ items: update.items || order.items })}  paid=${paid}  digitalOnly=${isDigitalOnly}`);
  reasons.forEach((r) => console.log(`   • ${r}`));

  if (hasOrderUpdates) {
    update.migrationAppliedAt = FieldValue.serverTimestamp();
    update.migrationVersion = 'b5-b6-v1';

    if (APPLY) {
      try {
        await doc.ref.update(update);
        console.log('   ✓ order updated');
      } catch (err) {
        console.error(`   ✗ FAILED to update ${doc.id}:`, err.message);
      }
    } else {
      console.log('   (dry run) would write:', summarizeUpdate(update));
    }
    stats.changed += 1;
  }

  if (shouldGrantEntitlement) {
    try {
      const result = await ensureEntitlement(userId, doc.id);
      if (result.granted) {
        stats.entitlementsGranted += 1;
        console.log(`   ${APPLY ? '✓' : '(dry run)'} entitlement ${APPLY ? 'granted' : 'would be granted'} for user ${userId}`);
      } else {
        stats.entitlementsSkipped += 1;
        console.log(`   - entitlement already exists for user ${userId}`);
      }
    } catch (err) {
      console.error(`   ✗ FAILED to grant entitlement for ${userId}:`, err.message);
    }
  }

  console.log('');
}

function summarizeUpdate(update) {
  // Avoid dumping the full items array in the log; just show counts.
  const out = {};
  for (const [k, v] of Object.entries(update)) {
    if (k === 'items' && Array.isArray(v)) out.items = `(${v.length} items, fulfillmentType backfilled)`;
    else if (k === 'migrationAppliedAt') continue;
    else out[k] = v;
  }
  return out;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
