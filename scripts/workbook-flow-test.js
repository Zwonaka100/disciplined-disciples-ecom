/*
 * End-to-end check of the DDA APC Candidate Workbook flow against the REAL functions code
 * (functions/index.js), with Firebase and the mail server replaced by in-memory fakes.
 *
 *   cd functions && npm ci && cd .. && node scripts/workbook-flow-test.js
 *
 * It simulates: a PayFast notification (ITN) for a workbook order, the entitlement being written,
 * the buyer's download link, a replayed notification, under-payment, a buyer who only owns the
 * eBook, a stranger, the eBook still working, the order emails, and the page/rules files.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.join(__dirname, '..');

// ---------------------------------------------------------------- in-memory Firestore
class Timestamp {
  constructor(ms) { this.ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}
const SERVER_TS = { __fv: 'serverTimestamp' };
const DELETE = { __fv: 'delete' };
const union = (...vals) => ({ __fv: 'arrayUnion', vals });
const store = new Map(); // path -> data
const clone = (v) => (v instanceof Timestamp ? v : Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);
function resolve(existing, incoming, merge) {
  const out = merge ? { ...(existing || {}) } : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v && v.__fv === 'serverTimestamp') out[k] = Timestamp.now();
    else if (v && v.__fv === 'delete') delete out[k];
    else if (v && v.__fv === 'arrayUnion') out[k] = [...(Array.isArray(out[k]) ? out[k] : []), ...v.vals];
    else if (merge && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && out[k] && typeof out[k] === 'object') out[k] = resolve(out[k], v, true);
    else out[k] = clone(v);
  }
  return out;
}
const snapOf = (p) => { const data = store.get(p); return { id: p.split('/').pop(), exists: data !== undefined, ref: docRef(p), data: () => (data === undefined ? undefined : clone(data)) }; };
function docRef(p) {
  return {
    id: p.split('/').pop(), path: p,
    collection: (name) => collRef(`${p}/${name}`),
    get: async () => snapOf(p),
    set: async (data, opts) => { store.set(p, resolve(store.get(p), data, Boolean(opts && opts.merge))); },
    update: async (data) => { if (!store.has(p)) throw new Error(`No document to update: ${p}`); store.set(p, resolve(store.get(p), data, true)); },
    delete: async () => { store.delete(p); },
  };
}
function collRef(p, filters = [], max = Infinity) {
  const q = {
    doc: (id) => docRef(`${p}/${id || crypto.randomUUID()}`),
    add: async (data) => { const id = crypto.randomUUID(); await docRef(`${p}/${id}`).set(data); return docRef(`${p}/${id}`); },
    where: (field, op, val) => collRef(p, [...filters, [field, op, val]], max),
    orderBy: () => q, limit: (n) => collRef(p, filters, n),
    get: async () => {
      const depth = p.split('/').length + 1;
      let docs = [...store.keys()].filter((k) => k.startsWith(`${p}/`) && k.split('/').length === depth).map(snapOf);
      for (const [f, op, v] of filters) {
        docs = docs.filter((d) => {
          const x = d.data()[f]; const a = x instanceof Timestamp ? x.toMillis() : x; const b = v instanceof Timestamp ? v.toMillis() : v;
          return op === '==' ? a === b : op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : op === '!=' ? a !== b : false;
        });
      }
      docs = docs.slice(0, max);
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
    },
  };
  return q;
}
const firestore = () => ({ collection: (name) => collRef(name), batch: () => ({ set() {}, update() {}, commit: async () => {} }), runTransaction: async (fn) => fn({ get: async (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d) }) });
firestore.FieldValue = { serverTimestamp: () => SERVER_TS, delete: () => DELETE, arrayUnion: union, increment: (n) => n };
firestore.Timestamp = Timestamp;

// ---------------------------------------------------------------- fake Storage and mail
const bucketFiles = new Map(); // name -> { metadata, content }
const fakeBucket = { name: 'disciplined-disciples-1.firebasestorage.app' };
const fileOf = (name) => ({
  name, bucket: fakeBucket,
  exists: async () => [bucketFiles.has(name)],
  getMetadata: async () => [bucketFiles.get(name).metadata],
  setMetadata: async (m) => { const f = bucketFiles.get(name); f.metadata = { ...f.metadata, ...m, metadata: { ...(f.metadata.metadata || {}), ...((m && m.metadata) || {}) } }; },
  save: async (buf, opts) => { bucketFiles.set(name, { metadata: { ...(opts && opts.metadata), updated: new Date().toISOString(), metadata: {} }, content: buf }); },
  getSignedUrl: async () => ['https://signed.example/' + name],
});
fakeBucket.file = (name) => fileOf(name);
fakeBucket.getFiles = async ({ prefix } = {}) => [[...bucketFiles.keys()].filter((n) => n.startsWith(prefix || '')).map((n) => ({ ...fileOf(n), metadata: bucketFiles.get(n).metadata }))];
const mails = [];

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'firebase-admin') {
    return { initializeApp() {}, firestore, auth: () => ({ getUser: async () => null, getUserByEmail: async () => null }), storage: () => ({ bucket: () => fakeBucket }) };
  }
  if (request === '@google-cloud/storage') return { Storage: class { bucket() { return fakeBucket; } } };
  if (request === 'nodemailer') return { createTransport: () => ({ sendMail: async (o) => { mails.push(o); return { messageId: 'm-' + mails.length }; }, verify: async () => true }) };
  return realLoad.apply(this, arguments);
};

// PayFast's server-side check: answer VALID for everything unless a test says otherwise.
let payfastAnswer = 'VALID';
global.fetch = async (url) => { if (String(url).includes('payfast.co.za')) return { text: async () => payfastAnswer }; throw new Error('Unexpected network call: ' + url); };

process.env.EMAIL_PASSWORD = 'test-password';
const fns = require(path.join(root, 'functions', 'index.js'));

// ---------------------------------------------------------------- helpers
let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log('ok   ', name); };
const ORDERS = 'artifacts/default-app-id/orders';
const PRICE = 149;
const WORKBOOK_FILE = 'workbook/DDA_APC_Candidate_Workbook.pdf';
bucketFiles.set(WORKBOOK_FILE, { metadata: { updated: '2026-11-12T10:00:00Z', metadata: {} }, content: Buffer.from('%PDF-1.7 workbook') });
bucketFiles.set('ebook/Relentlessly-Disciplined.pdf', { metadata: { updated: '2026-10-01T10:00:00Z', metadata: {} }, content: Buffer.from('%PDF-1.7 ebook') });

const workbookItem = (over = {}) => ({ productId: 'apc-workbook', name: 'DDA APC Candidate Workbook', price: PRICE, quantity: 1, size: 'Digital', fulfillmentType: 'digital', ...over });
const ebookItem = () => ({ productId: 'ebook', name: 'Relentlessly Disciplined eBook', price: 119, quantity: 1, size: 'Digital', fulfillmentType: 'digital' });
const tee = () => ({ productId: 'tee-1', name: 'Tee', price: 300, quantity: 1, size: 'M', fulfillmentType: 'physical' });
store.set('products/tee-1', { name: 'Tee', price: 300 }); // sample catalogue entry so the server can price the parcel item
async function placeOrder(id, userId, items, over = {}) {
  const subtotal = items.reduce((t, i) => t + i.price * i.quantity, 0);
  await docRef(`${ORDERS}/${id}`).set({ orderId: id, userId, customerEmail: `${userId}@example.com`, customerName: 'Test Buyer', items, orderType: 'digital', deliveryMethodKey: 'digital', deliveryMethod: 'Digital Download', deliveryAddress: { type: 'digital', name: 'Test Buyer', city: 'Online' }, subtotal, vat: 0, shipping: 0, totalAmount: subtotal, orderDate: Timestamp.now(), paymentStatus: 'Pending', status: 'Awaiting Payment', ...over });
  await docRef(`artifacts/default-app-id/users/${userId}`).set({ name: 'Test Buyer', email: `${userId}@example.com` });
}
async function itn(orderId, amount, over = {}) {
  const fields = { m_payment_id: orderId, pf_payment_id: String(1000000 + Math.floor(Math.random() * 99999)), payment_status: 'COMPLETE', item_name: 'Order', amount_gross: amount.toFixed(2), merchant_id: '15069294', custom_str1: orderId, ...over };
  const params = Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const signature = crypto.createHash('md5').update(params).digest('hex');
  const res = { code: null, body: null, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; } };
  await fns.verifyPayfastPayment({ method: 'POST', rawBody: Buffer.from(`${params}&signature=${signature}`), headers: {}, body: fields }, res);
  return res;
}
const download = (fn, uid) => fns[fn].run({}, uid ? { auth: { uid } } : {});
const denied = async (promise, code) => { try { await promise; } catch (e) { assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return; } assert.fail(`expected ${code} but it succeeded`); };
const entitlementItems = (collection, uid) => [...store.keys()].filter((k) => k.startsWith(`${collection}/${uid}/items/`));

(async () => {
  // ---- before any purchase --------------------------------------------------------------------------------
  await ok('the download is refused for someone who is not signed in', () => denied(download('getWorkbookDownloadLink', null), 'unauthenticated'));
  await ok('a signed-in person who has not bought it is refused', () => denied(download('getWorkbookDownloadLink', 'stranger'), 'permission-denied'));

  await placeOrder('DD-unpaid', 'buyer0', [workbookItem()]);
  await ok('a workbook order that is not paid yet does not unlock it', () => denied(download('getWorkbookDownloadLink', 'buyer0'), 'permission-denied'));

  // ---- a real purchase through the PayFast notification ----------------------------------------------------------
  await placeOrder('DD-wb1', 'buyer1', [workbookItem()]);
  await ok('PayFast confirms payment: the order is paid and the workbook is added to the buyer\'s library', async () => {
    const res = await itn('DD-wb1', 149);
    assert.equal(res.code, 200);
    const order = store.get(`${ORDERS}/DD-wb1`);
    assert.equal(order.paymentStatus, 'Paid');
    assert.equal(order.orderType, 'digital', 'counted as a digital order (no shipping)');
    assert.deepEqual(entitlementItems('workbookEntitlements', 'buyer1'), ['workbookEntitlements/buyer1/items/DD-wb1']);
    assert.equal(store.get('workbookEntitlements/buyer1').hasWorkbook, true);
    assert.equal(store.get('workbookEntitlements/buyer1/items/DD-wb1').productId, 'apc-workbook');
    assert.equal(entitlementItems('ebookEntitlements', 'buyer1').length, 0, 'it did not unlock the eBook');
    assert.equal(store.has('journalAccess/buyer1'), false, 'or the Journal');
  });
  await ok('the buyer gets a short-lived link to the WORKBOOK file (not the eBook), and can download again later', async () => {
    const first = await download('getWorkbookDownloadLink', 'buyer1');
    assert.equal(first.expiresIn, 600);
    assert.equal(first.file, WORKBOOK_FILE);
    assert.match(first.url, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/disciplined-disciples-1\.firebasestorage\.app\/o\/workbook%2FDDA_APC_Candidate_Workbook\.pdf\?alt=media&token=[0-9a-f-]{36}$/);
    assert.ok(!/ebook/i.test(first.url), 'the eBook file is never served');
    const token = /token=([0-9a-f-]+)/.exec(first.url)[1];
    const record = store.get(`ebookDownloadTokens/${token}`);
    assert.equal(record.uid, 'buyer1'); assert.equal(record.file, WORKBOOK_FILE);
    assert.ok(record.expiresAt.toMillis() - Date.now() <= 600 * 1000 && record.expiresAt.toMillis() > Date.now(), 'the link expires in 10 minutes');
    assert.ok(bucketFiles.get(WORKBOOK_FILE).metadata.metadata.firebaseStorageDownloadTokens.includes(token), 'the token is the one Firebase Storage honours');
    const again = await download('getWorkbookDownloadLink', 'buyer1'); // "after they log back in": the entitlement is stored, not the session
    assert.equal(again.file, WORKBOOK_FILE);
    assert.equal(store.get('artifacts/default-app-id/workbookDownloads/buyer1').totalCount, 2);
  });
  await ok('someone else (signed in, no purchase) still cannot get it', () => denied(download('getWorkbookDownloadLink', 'stranger'), 'permission-denied'));

  // ---- PayFast retries and tampering -------------------------------------------------------------------------------
  await ok('a repeated notification does not create a second library entry', async () => {
    const res = await itn('DD-wb1', 149);
    assert.equal(res.code, 200);
    assert.equal(entitlementItems('workbookEntitlements', 'buyer1').length, 1);
  });
  await placeOrder('DD-wb2', 'buyer2', [workbookItem({ price: 1 })], { subtotal: 1, totalAmount: 1 });
  await ok('a browser that sends a R1 price is not trusted: payment goes to review and nothing is unlocked', async () => {
    await itn('DD-wb2', 1);
    assert.notEqual(store.get(`${ORDERS}/DD-wb2`).paymentStatus, 'Paid');
    assert.equal(entitlementItems('workbookEntitlements', 'buyer2').length, 0);
    await denied(download('getWorkbookDownloadLink', 'buyer2'), 'permission-denied');
  });
  await placeOrder('DD-wb3', 'buyer3', [workbookItem()]);
  await ok('a notification PayFast does not confirm unlocks nothing', async () => {
    payfastAnswer = 'INVALID';
    const res = await itn('DD-wb3', 149);
    payfastAnswer = 'VALID';
    assert.equal(res.code, 400);
    assert.equal(entitlementItems('workbookEntitlements', 'buyer3').length, 0);
  });
  await ok('a wrong merchant id unlocks nothing', async () => {
    const res = await itn('DD-wb3', 149, { merchant_id: '99999999' });
    assert.equal(res.code, 400);
    assert.equal(entitlementItems('workbookEntitlements', 'buyer3').length, 0);
  });

  // ---- the eBook is unaffected, and the two products do not unlock each other -----------------------------------------
  await placeOrder('DD-eb1', 'reader1', [ebookItem()]);
  await ok('the eBook still works exactly as before (R119, own entitlement, own file)', async () => {
    await itn('DD-eb1', 119);
    assert.equal(store.get('ebookEntitlements/reader1').hasEbook, true);
    assert.equal(entitlementItems('workbookEntitlements', 'reader1').length, 0, 'the eBook does not unlock the workbook');
    const link = await download('getEbookDownloadLink', 'reader1');
    assert.equal(link.file, 'ebook/Relentlessly-Disciplined.pdf', 'the eBook link serves the eBook, even though a newer PDF sits in workbook/');
    await denied(download('getWorkbookDownloadLink', 'reader1'), 'permission-denied');
    await denied(download('getEbookDownloadLink', 'buyer1'), 'permission-denied'); // and the workbook does not unlock the eBook
  });
  await placeOrder('DD-mix1', 'both1', [workbookItem(), ebookItem()]);
  await ok('one order with both digital products unlocks both', async () => {
    await itn('DD-mix1', 149 + 119);
    assert.equal((await download('getWorkbookDownloadLink', 'both1')).file, WORKBOOK_FILE);
    assert.equal((await download('getEbookDownloadLink', 'both1')).file, 'ebook/Relentlessly-Disciplined.pdf');
  });
  await placeOrder('DD-phys1', 'shopper1', [tee()], { orderType: 'physical', deliveryMethodKey: 'collection_sandton', deliveryMethod: 'Collection', shipping: 0 });
  await ok('an ordinary physical order does not unlock the workbook', async () => {
    await itn('DD-phys1', 300);
    assert.equal(entitlementItems('workbookEntitlements', 'shopper1').length, 0);
  });
  await placeOrder('DD-mixed2', 'shopper2', [workbookItem(), tee()], { orderType: 'mixed', deliveryMethodKey: 'collection_sandton', deliveryMethod: 'Collection', shipping: 0 });
  await ok('a parcel order that also contains the workbook is priced correctly and unlocks it', async () => {
    await itn('DD-mixed2', 149 + 300);
    assert.equal(store.get(`${ORDERS}/DD-mixed2`).orderType, 'mixed');
    assert.equal((await download('getWorkbookDownloadLink', 'shopper2')).file, WORKBOOK_FILE);
  });

  // ---- a missed grant self-heals from the paid order ------------------------------------------------------------------
  await placeOrder('DD-heal', 'healed1', [workbookItem()], { paymentStatus: 'Paid' });
  await ok('a paid workbook order whose grant was missed is recognised when the buyer downloads', async () => {
    assert.equal(entitlementItems('workbookEntitlements', 'healed1').length, 0);
    assert.equal((await download('getWorkbookDownloadLink', 'healed1')).file, WORKBOOK_FILE);
    assert.equal(entitlementItems('workbookEntitlements', 'healed1').length, 1);
  });

  // ---- throttling ---------------------------------------------------------------------------------------------------------
  await ok('downloads are limited to 25 a day per buyer', async () => {
    for (let i = 0; i < 23; i += 1) await download('getWorkbookDownloadLink', 'healed1'); // 24 so far
    await download('getWorkbookDownloadLink', 'healed1'); // the 25th
    await denied(download('getWorkbookDownloadLink', 'healed1'), 'resource-exhausted');
  });

  // ---- the order emails ----------------------------------------------------------------------------------------------------
  await ok('the buyer is emailed the workbook message with a link to their profile; an invoice is stored privately', async () => {
    mails.length = 0;
    await placeOrder('DD-mail1', 'mailbuyer', [workbookItem()], { paymentStatus: 'Paid', status: 'Order Placed', statusKey: 'order_placed' });
    const snap = snapOf(`${ORDERS}/DD-mail1`);
    await fns.sendOrderConfirmation.run(snap, { params: { orderId: 'DD-mail1' } });
    const toBuyer = mails.find((m) => String(m.to).includes('mailbuyer@example.com'));
    assert.ok(toBuyer, 'an email went to the buyer');
    assert.match(toBuyer.subject, /Your DDA APC Candidate Workbook is ready/);
    assert.match(toBuyer.html, /profile\.html/);
    assert.match(toBuyer.html, /108 pages/);
    assert.match(toBuyer.html, /independent of SAICA/i);
    assert.ok(!/Your eBook is/.test(toBuyer.html), 'it does not call the workbook an eBook');
    assert.ok(!/workbook(%2F|\/)|Candidate_Workbook/i.test((toBuyer.html.match(/href="[^"]*"/g) || []).join(' ')), 'no link to the workbook file is ever emailed (only the profile page and the invoice)');
    assert.ok([...bucketFiles.keys()].some((n) => n === 'invoices/mailbuyer/DD-mail1.pdf'), 'the invoice is saved under invoices/{user}/');
    assert.equal(entitlementItems('workbookEntitlements', 'mailbuyer').length, 1, 'and the order email path also grants, without duplicating');
    const owner = mails.find((m) => /New Workbook Order/.test(m.html || ''));
    assert.ok(owner, 'the owner is told it is a workbook order, no fulfilment needed');
  });

  // ---- rules and pages ------------------------------------------------------------------------------------------------------
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  await ok('Storage: the workbook folder is admin-only, never public', () => {
    const rules = read('storage.rules');
    const block = /match \/workbook\/\{allPaths=\*\*\} \{([^}]*)\}/.exec(rules);
    assert.ok(block, 'a workbook rule exists');
    assert.match(block[1], /allow read: if isAdmin\(\);/);
    assert.ok(!/if true/.test(block[1]));
    assert.ok(rules.indexOf('match /workbook/') < rules.indexOf('match /{allPaths=**}'), 'and it sits above the default-deny rule');
  });
  await ok('Firestore: a buyer can read their own workbook record but nobody can write it from the browser', () => {
    const rules = read('firestore.rules');
    const block = /match \/workbookEntitlements\/\{userId\} \{([\s\S]*?)\n    \}/.exec(rules);
    assert.ok(block);
    assert.match(block[1], /allow read: if isUserSelf\(userId\) \|\| isAdmin\(\);/);
    assert.equal((block[1].match(/allow write: if isAdmin\(\);/g) || []).length, 2);
  });
  await ok('Academy page: card, price, six parts, button, SAICA line and the reworded copy', () => {
    const html = read('public/academy.html');
    assert.match(html, /<h3>DDA APC Candidate Workbook<\/h3>/);
    assert.match(html, /<p class="pkg-price">R149<\/p>/);
    for (const part of ['Candidate Manual', 'Trigger identification', 'Three-layer research', 'The research method', 'The writing masterclass', 'The prompt suite']) assert.ok(html.includes(part), part);
    assert.match(html, /href="checkout\.html\?product=apc-workbook"[^>]*>Buy the workbook<\/a>/);
    assert.ok(html.includes('Independent of SAICA. No guarantee of exam results. For preparation only.'));
    assert.ok(!/Available exclusively to programme candidates/.test(html), 'the contradicting line is gone');
    assert.match(html, /programme adds personal mentoring, feedback and the Discovery Call process on top/);
    assert.ok(html.includes('Free copy of the eBook') && html.includes('Free eBook + Disciplined Disciples tee'), 'the free eBook wording is untouched');
    assert.ok(!/class="pkg-cta"[^>]*href/.test(html), 'the booking buttons were not changed into links');
  });
  await ok('Checkout and server agree on the price (R149) and the product id', () => {
    const checkout = read('public/checkout.html');
    const server = read('functions/index.js');
    assert.match(checkout, /'apc-workbook': 149\.00/);
    assert.match(server, /const WORKBOOK_PRICE = 149;/);
    assert.match(checkout, /productType === 'apc-workbook'/);
    assert.match(checkout, /productId: 'apc-workbook'[\s\S]*?fulfillmentType: 'digital'/);
    assert.ok(!/public\/.*\.pdf/.test(fs.readdirSync(path.join(root, 'public')).join('\n')), 'no PDF sits in the public folder');
    assert.equal(fs.readdirSync(path.join(root, 'public'), { recursive: true }).filter((f) => /\.pdf$/i.test(String(f))).length, 0, 'no PDF anywhere under public/');
  });

  console.log(`\n${passed} checks passed`);
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
