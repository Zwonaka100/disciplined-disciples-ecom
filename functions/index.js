const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const querystring = require('querystring');
const path = require('path');

// Initialize Firebase Admin SDK explicitly for this project.
admin.initializeApp({
  projectId: 'disciplined-disciples-1',
  storageBucket: 'disciplined-disciples-1.firebasestorage.app'
});

// === EMAIL IDENTITY (single source of truth) ===
// All outbound mail comes from Zolile (Founder). Reply-to also goes to him.
// functions.config() is deprecated; the password now comes from the EMAIL_PASSWORD secret.
let emailConfig = {};
try {
  emailConfig = functions.config().email || {};
} catch (err) {
  emailConfig = {};
}
const SENDER_EMAIL = (emailConfig.user || 'nomaqhizazolile@gmail.com').toString();
const SENDER_PASSWORD = (process.env.EMAIL_PASSWORD || emailConfig.password || '').toString();

// Bind EMAIL_PASSWORD secret (Secret Manager) to every function builder below.
// Falls back to functions.config().email.password for any function that doesn't include this binding.
const withSecrets = functions.runWith({ secrets: ['EMAIL_PASSWORD'] });
const SENDER_NAME = 'Zolile Nomaqhiza \u00B7 Disciplined Disciples';
const FROM_HEADER = `"${SENDER_NAME}" <${SENDER_EMAIL}>`;
const REPLY_TO = SENDER_EMAIL;
const OWNER_EMAIL = SENDER_EMAIL;
const ADMIN_NOTIFY_EMAILS = [SENDER_EMAIL]; // Notifications go ONLY to Zolile
const SUPPORT_PHONE = '+27 69 206 0618';
const SITE_URL = 'https://disciplineddisciples.co.za';

// === Commerce constants: the server's source of truth when checking payments ===
// Keep these in step with the prices shown in checkout.html / academy.html.
const PAYFAST_MERCHANT_ID = '15069294';
const PAYFAST_VALIDATE_URL = 'https://www.payfast.co.za/eng/query/validate';
// Optional: if a passphrase is set on the PayFast account, add PAYFAST_PASSPHRASE to
// functions/.env so signatures are enforced. Without it, PayFast's server-side
// confirmation (query/validate) is still required for every payment.
const PAYFAST_PASSPHRASE = (process.env.PAYFAST_PASSPHRASE || '').toString().trim();
const FIXED_PRICES = { ebook: 119, 'book-physical': 249 };
const DELIVERY_PRICES = { paxi_standard: 59.95, paxi_express: 109.95, collection_sandton: 0, collection_benoni: 0 };
const ACADEMY_PACKAGE_PRICES = { discovery: 0, single: 249, focus: 799, transformation: 1499 };
const ACADEMY_PACKAGE_NAMES = {
  discovery: 'Discovery Call',
  single: 'Single Session',
  focus: 'Focus Pack',
  transformation: 'Transformation Path',
  'apc-programme': 'APC Programme'
};
const JOURNAL_PRODUCT_ID = 'journal';
// Standalone journal price unless an admin sets another in Admin > Book (siteContent/journal).
// Keep in step with JOURNAL_DEFAULT_PRICE in public/script.js.
const JOURNAL_DEFAULT_PRICE = 99;
const FOUNDER_SIGNATURE = `
  <p style="margin: 22px 0 6px 0; color: #1f2937; font-weight: 600;">Warm regards,</p>
  <p style="margin: 0; color: #4f46e5; font-weight: 700;">Zolile Nomaqhiza</p>
  <p style="margin: 2px 0 0 0; color: #6b7280; font-size: 13px;">Founder \u00B7 Disciplined Disciples</p>
`;

// Unified branded footer auto-appended to every outgoing email by sendMailReliable.
// Marker comment lets us guard against double-injection.
const EMAIL_FOOTER = `
<!--DD_EMAIL_FOOTER-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf7f2;color:#1f2937;font-family:Arial,Helvetica,sans-serif;margin-top:0;border-top:1px solid #e5e0d6;">
  <tr><td align="center" style="padding:28px 20px 20px 20px;">
    <a href="${SITE_URL}" style="text-decoration:none;color:#0f172a;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="${SITE_URL}/Assets/45.png" alt="Disciplined Disciples" width="48" height="48" style="display:block;border:0;outline:none;">
          </td>
          <td style="vertical-align:middle;text-align:left;">
            <div style="font-size:17px;font-weight:700;color:#0f172a;letter-spacing:0.3px;">Disciplined Disciples</div>
            <div style="font-size:11px;color:#6b7280;letter-spacing:1.5px;text-transform:uppercase;">Discipline &middot; Loyalty &middot; Relentless</div>
          </td>
        </tr>
      </table>
    </a>
    <p style="margin:18px 0 6px 0;font-size:12px;color:#374151;">
      <a href="${SITE_URL}/shop.html" style="color:#374151;text-decoration:none;margin:0 8px;font-weight:600;">Shop</a>&middot;
      <a href="${SITE_URL}/mentorship.html" style="color:#374151;text-decoration:none;margin:0 8px;font-weight:600;">Mentorship</a>&middot;
      <a href="${SITE_URL}/blog.html" style="color:#374151;text-decoration:none;margin:0 8px;font-weight:600;">Blog</a>&middot;
      <a href="${SITE_URL}/contact.html" style="color:#374151;text-decoration:none;margin:0 8px;font-weight:600;">Contact</a>
    </p>
    <p style="margin:6px 0 4px 0;font-size:11px;color:#6b7280;">WhatsApp ${SUPPORT_PHONE}</p>
    <p style="margin:6px 0 0 0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Disciplined Disciples &middot; Johannesburg, South Africa</p>
  </td></tr>
</table>
`;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_PASSWORD
  }
});

// Cloud Storage for storing invoices and ebook (private)
const storage = new Storage();
const bucket = storage.bucket('disciplined-disciples-1.firebasestorage.app');

// === Helpers ===
function isPaidStatus(status) {
  const normalized = (status || '').toString().toLowerCase();
  return ['paid', 'complete', 'completed', 'success'].includes(normalized);
}

// The eBook check is deliberately strict (product id or name), so other digital
// products such as the 30-Day Journal never unlock the eBook by accident.
function isEbookItem(item) {
  const productId = (item?.productId || item?.id || '').toString().toLowerCase();
  const name = (item?.name || '').toString().toLowerCase();
  return productId === 'ebook' || name.includes('ebook');
}

function isJournalItem(item) {
  const productId = (item?.productId || item?.id || '').toString().toLowerCase();
  return productId === JOURNAL_PRODUCT_ID;
}

function isDigitalItem(item) {
  const fulfillment = (item?.fulfillmentType || '').toString().toLowerCase();
  return fulfillment === 'digital' || isEbookItem(item) || isJournalItem(item);
}

function isPhysicalItem(item) {
  return !isDigitalItem(item);
}

function orderContainsEbook(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some(isEbookItem);
}

function orderContainsJournal(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.some(isJournalItem);
}

function deriveOrderType(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) return 'physical';
  const hasDigital = items.some(isDigitalItem);
  const hasPhysical = items.some(isPhysicalItem);
  if (hasDigital && hasPhysical) return 'mixed';
  if (hasDigital) return 'digital';
  return 'physical';
}

function isDigitalOnlyOrder(order) {
  return deriveOrderType(order) === 'digital';
}

// Retry-with-backoff for transient SMTP errors (Gmail occasionally 421/4xx).
// SECURITY: from/replyTo are HARD LOCKED to the Founder identity. Any caller-supplied
// from/replyTo/sender values are dropped before send so no code path can spoof the
// "From" address (which would also break Gmail SPF/DKIM and risk spam folder).
async function sendMailReliable(mailOptions, meta = {}) {
  const safeOptions = Object.assign({}, mailOptions);
  if (safeOptions.from && safeOptions.from !== FROM_HEADER) {
    console.warn('[sendMailReliable] Overriding caller-supplied from header to enforce identity lock. Was:', safeOptions.from);
  }
  delete safeOptions.from;
  delete safeOptions.replyTo;
  delete safeOptions.sender;
  // Auto-append unified branded footer to every HTML email (skipped for plain-text-only or already-footered messages).
  if (typeof safeOptions.html === 'string' && safeOptions.html && !safeOptions.html.includes('DD_EMAIL_FOOTER')) {
    const html = safeOptions.html;
    const closeBody = html.toLowerCase().lastIndexOf('</body>');
    if (closeBody !== -1) {
      safeOptions.html = html.slice(0, closeBody) + EMAIL_FOOTER + html.slice(closeBody);
    } else {
      safeOptions.html = html + EMAIL_FOOTER;
    }
  }
  const enriched = Object.assign(safeOptions, {
    from: FROM_HEADER,
    replyTo: REPLY_TO,
    sender: SENDER_EMAIL
  });
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail(enriched);
      await logEmail({ ...meta, to: enriched.to, subject: enriched.subject, success: true, messageId: info?.messageId || null, attempt });
      return info;
    } catch (err) {
      lastError = err;
      console.error(`sendMail attempt ${attempt}/${maxAttempts} failed for ${enriched.to}:`, err.message);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  await logEmail({ ...meta, to: enriched.to, subject: enriched.subject, success: false, error: lastError?.message || 'unknown', attempt: maxAttempts });
  throw lastError;
}

async function logEmail(entry) {
  try {
    await admin.firestore().collection('emailLogs').add({
      to: entry.to || null,
      subject: entry.subject || null,
      type: entry.type || 'transactional',
      orderId: entry.orderId || null,
      userId: entry.userId || null,
      success: !!entry.success,
      error: entry.error || null,
      messageId: entry.messageId || null,
      attempt: entry.attempt || null,
      sentAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('Failed to write emailLogs entry:', e.message);
  }
}

// Resolve the latest ebook PDF in Storage under the ebook/ prefix.
// This self-heals when the file is replaced/renamed.
async function resolveEbookFile() {
  const [files] = await bucket.getFiles({ prefix: 'ebook/' });
  const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (!pdfs.length) {
    throw new functions.https.HttpsError('not-found', 'No ebook PDF found in storage under the ebook/ prefix.');
  }
  pdfs.sort((a, b) => {
    const ta = new Date(a.metadata?.updated || a.metadata?.timeCreated || 0).getTime();
    const tb = new Date(b.metadata?.updated || b.metadata?.timeCreated || 0).getTime();
    return tb - ta;
  });
  return pdfs[0];
}

async function getSignedReadUrl(file, expirySeconds) {
  // Prefer Firebase download tokens (no signBlob IAM needed). Falls back to V4 signed URL.
  let tokenErr = null;
  try {
    const [metadata] = await file.getMetadata();
    let token = null;
    const existing = metadata && metadata.metadata && metadata.metadata.firebaseStorageDownloadTokens;
    if (existing) {
      token = existing.split(',')[0];
    } else {
      token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      await file.setMetadata({
        metadata: { firebaseStorageDownloadTokens: token }
      });
    }
    const bucketName = file.bucket.name;
    const encodedPath = encodeURIComponent(file.name);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
  } catch (err) {
    tokenErr = err;
    console.error(`[getSignedReadUrl] firebaseStorageDownloadTokens path failed for ${file.name}:`, err.message);
  }

  try {
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expirySeconds * 1000
    });
    return url;
  } catch (signErr) {
    console.error(`[getSignedReadUrl] V4 getSignedUrl fallback also failed for ${file.name}:`, signErr.message);
    throw new functions.https.HttpsError(
      'internal',
      `Could not generate a download link (token error: ${tokenErr ? tokenErr.message : 'n/a'}; sign error: ${signErr.message}).`
    );
  }
}

async function grantEbookEntitlement(userId, orderId, source = 'order') {
  if (!userId) return;
  const db = admin.firestore();
  const ref = db.collection('ebookEntitlements').doc(userId)
    .collection('items').doc(orderId || 'unknown');
  await ref.set({
    productId: 'ebook',
    orderId: orderId || null,
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
    source
  }, { merge: true });
  // Top-level marker for quick lookups
  await db.collection('ebookEntitlements').doc(userId).set({
    hasEbook: true,
    lastGrantedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// eBook links are short-lived. Firebase download tokens never expire on their own,
// so each request mints a fresh token, records when it expires, and rewrites the
// file's token list to only the still-valid ones. That drops any older or leaked
// link. Buyers are unaffected: they always download through My Library.
const EBOOK_TOKENS = 'ebookDownloadTokens';

async function activeEbookTokens(fileName, extraToken) {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const snap = await db.collection(EBOOK_TOKENS).where('expiresAt', '>', now).get();
  const active = new Set(extraToken ? [extraToken] : []);
  snap.forEach((doc) => {
    if (doc.data()?.file === fileName) active.add(doc.id);
  });
  return Array.from(active);
}

async function writeEbookTokens(file, tokens) {
  await file.setMetadata({
    metadata: { firebaseStorageDownloadTokens: tokens.length ? tokens.join(',') : null }
  });
}

async function issueEbookDownloadUrl(file, userId, expirySeconds) {
  const db = admin.firestore();
  const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  await db.collection(EBOOK_TOKENS).doc(token).set({
    uid: userId || null,
    file: file.name,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + expirySeconds * 1000)
  });
  const tokens = await activeEbookTokens(file.name, token);
  await writeEbookTokens(file, tokens);
  const encodedPath = encodeURIComponent(file.name);
  return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
}

// === 30-Day Journal access ===
// journalAccess/{uid} is written only by the server (or an admin). Paid Academy
// packages and journal purchases both unlock it.
async function grantJournalAccess(uid, source, ref) {
  if (!uid) return;
  const db = admin.firestore();
  const docRef = db.collection('journalAccess').doc(uid);
  const existing = await docRef.get();
  const update = {
    granted: true,
    sources: admin.firestore.FieldValue.arrayUnion({ source, ref: ref || null, at: new Date().toISOString() }),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (!existing.exists || !existing.data()?.grantedAt) {
    update.grantedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await docRef.set(update, { merge: true });
}

async function grantJournalAccessByEmail(email, source, ref) {
  const normalized = (email || '').toString().trim().toLowerCase();
  if (!normalized) return false;
  try {
    const user = await admin.auth().getUserByEmail(normalized);
    await grantJournalAccess(user.uid, source, ref);
    return true;
  } catch (err) {
    // No account yet: access is claimed automatically when they sign up with this email.
    if (err && err.code === 'auth/user-not-found') return false;
    throw err;
  }
}

async function getJournalSettings() {
  try {
    const snap = await admin.firestore().collection('siteContent').doc('journal').get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const price = Number(data.price);
    return {
      price: Number.isFinite(price) && price > 0 ? price : JOURNAL_DEFAULT_PRICE,
      active: data.active !== false
    };
  } catch (err) {
    console.error('[journal settings] read failed:', err.message);
    return { price: JOURNAL_DEFAULT_PRICE, active: true };
  }
}

async function getAcademyPackagePrice(packageKey) {
  const key = (packageKey || '').toString().trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ACADEMY_PACKAGE_PRICES, key)) {
    return ACADEMY_PACKAGE_PRICES[key];
  }
  if (key === 'apc-programme') {
    const snap = await admin.firestore().collection('siteContent').doc('academy').get();
    const price = Number(snap.exists ? snap.data()?.apcProgrammePrice : NaN);
    return Number.isFinite(price) && price > 0 ? price : null;
  }
  return null;
}

// === Server-side order pricing ===
// Customers' carts live in the browser, so the server re-prices every order from the
// real catalogue before it is treated as paid.
let manifestCache = { at: 0, prices: null };
async function getManifestPrice(productId) {
  const stale = Date.now() - manifestCache.at > 10 * 60 * 1000;
  if (!manifestCache.prices || stale) {
    try {
      const res = await fetch(`${SITE_URL}/products-manifest.json`);
      const list = res.ok ? await res.json() : [];
      const prices = {};
      (Array.isArray(list) ? list : (list.products || [])).forEach((p) => {
        if (p && p.id != null && Number.isFinite(Number(p.price))) prices[String(p.id)] = Number(p.price);
      });
      manifestCache = { at: Date.now(), prices };
    } catch (err) {
      console.error('[pricing] manifest fetch failed:', err.message);
      if (!manifestCache.prices) manifestCache = { at: Date.now(), prices: {} };
    }
  }
  const price = manifestCache.prices[String(productId)];
  return Number.isFinite(price) ? price : null;
}

function expectedShipping(order) {
  if (deriveOrderType(order) === 'digital') return { amount: 0 };
  const key = (order.deliveryMethodKey || '').toString();
  if (Object.prototype.hasOwnProperty.call(DELIVERY_PRICES, key)) return { amount: DELIVERY_PRICES[key] };
  // Orders placed before deliveryMethodKey existed: read the stored label.
  const label = `${order.deliveryMethod || ''} ${order.deliveryAddress?.type || ''}`.toLowerCase();
  if (label.includes('collection')) return { amount: 0 };
  if (label.includes('express')) return { amount: DELIVERY_PRICES.paxi_express };
  if (label.includes('paxi')) return { amount: DELIVERY_PRICES.paxi_standard };
  return { amount: null, problem: 'Unknown delivery method' };
}

async function priceOrderServerSide(order) {
  const db = admin.firestore();
  const items = Array.isArray(order?.items) ? order.items : [];
  const problems = [];
  let subtotal = 0;
  let journalSettings = null;
  for (const item of items) {
    const quantity = Math.max(1, parseInt(item?.quantity, 10) || 1);
    const productId = (item?.productId || item?.id || '').toString().trim();
    let unit = null;
    if (isEbookItem(item)) {
      unit = FIXED_PRICES.ebook;
    } else if (productId === 'book-physical') {
      unit = FIXED_PRICES['book-physical'];
    } else if (isJournalItem(item)) {
      journalSettings = journalSettings || await getJournalSettings();
      unit = journalSettings.price;
    } else if (productId) {
      const snap = await db.collection('products').doc(productId).get();
      const firestorePrice = snap.exists ? Number(snap.data()?.price) : NaN;
      unit = Number.isFinite(firestorePrice) ? firestorePrice : await getManifestPrice(productId);
    }
    if (unit == null) {
      problems.push(`No catalogue price for "${item?.name || productId || 'item'}"`);
      continue;
    }
    subtotal += unit * quantity;
  }
  if (!items.length) problems.push('Order has no items');
  const shipping = expectedShipping(order || {});
  if (shipping.problem) problems.push(shipping.problem);
  const expected = Math.round((subtotal + (shipping.amount || 0)) * 100) / 100;
  return { expected, subtotal, shipping: shipping.amount || 0, problems };
}

// === PayFast ITN verification ===
// PayFast signs the exact key=value pairs it posted, in order, up to "signature".
function payfastParamString(rawBody) {
  const parts = [];
  for (const segment of String(rawBody || '').split('&')) {
    if (!segment) continue;
    if (segment.split('=')[0] === 'signature') break;
    parts.push(segment);
  }
  return parts.join('&');
}

function phpUrlEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function checkPayfastSignature(paramString, signature) {
  if (!signature) return { checked: false, valid: false };
  const base = PAYFAST_PASSPHRASE ? `${paramString}&passphrase=${phpUrlEncode(PAYFAST_PASSPHRASE)}` : paramString;
  const expected = crypto.createHash('md5').update(base).digest('hex');
  return { checked: true, valid: expected === String(signature).toLowerCase() };
}

async function confirmWithPayfast(paramString) {
  const res = await fetch(PAYFAST_VALIDATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: paramString
  });
  const text = (await res.text()).trim().toUpperCase();
  return text.startsWith('VALID');
}

async function logPaymentNotification(entry) {
  try {
    await admin.firestore().collection('paymentNotifications').add(Object.assign({
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    }, entry));
  } catch (err) {
    console.error('[payfast] failed to write paymentNotifications log:', err.message);
  }
}

async function alertOwnerPaymentReview(kind, ref, details) {
  try {
    const rows = Object.entries(details || {})
      .map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;color:#64748b;">${escapeHtmlForBroadcast(k)}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtmlForBroadcast(Array.isArray(v) ? v.join('; ') : v)}</td></tr>`)
      .join('');
    await sendMailReliable({
      to: OWNER_EMAIL,
      subject: `⚠️ Payment needs review — ${kind} ${String(ref).substring(0, 12)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#b45309;">A payment needs your review</h2>
          <p style="color:#475569;">PayFast confirmed a payment, but it did not match what the ${kind} should cost, so nothing has been fulfilled yet. Check the PayFast dashboard, then either mark it paid in admin or refund the customer.</p>
          <table style="font-size:14px;">${rows}</table>
          <p><a href="${SITE_URL}/${kind === 'order' ? 'admin-orders.html' : 'admin-mentorship.html'}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open admin</a></p>
        </div>`
    }, { type: 'payment_review', orderId: ref });
  } catch (err) {
    console.error('[payfast] review alert email failed:', err.message);
  }
}

async function userHasEbookEntitlement(userId) {
  if (!userId) return false;
  const db = admin.firestore();
  const top = await db.collection('ebookEntitlements').doc(userId).get();
  if (top.exists && top.data()?.hasEbook === true) return true;
  const items = await db.collection('ebookEntitlements').doc(userId).collection('items').limit(1).get();
  return !items.empty;
}

// === SECURE EBOOK DOWNLOAD FUNCTION ===
// Customer keeps lifetime access from their profile. Each download generates a fresh signed URL.
exports.getEbookDownloadLink = withSecrets.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to download the ebook.');
  }
  const userId = context.auth.uid;
  const MAX_DOWNLOADS_PER_DAY = 25; // Generous but bounded to deter sharing
  const LINK_EXPIRY_SECONDS = 600; // 10 minutes is plenty to start the download

  const db = admin.firestore();

  // 1) Fast path: explicit entitlement record
  let entitled = await userHasEbookEntitlement(userId);

  // 2) Fallback: scan orders (covers legacy purchases before entitlements existed)
  let backfillOrderId = null;
  if (!entitled) {
    const ordersRef = db.collection('artifacts').doc('default-app-id').collection('orders');
    const ordersSnap = await ordersRef.where('userId', '==', userId).get();
    ordersSnap.forEach((doc) => {
      const order = doc.data();
      if (isPaidStatus(order?.paymentStatus) && orderContainsEbook(order)) {
        entitled = true;
        backfillOrderId = doc.id;
      }
    });
    if (entitled) {
      // Self-heal: grant entitlement for next time
      try { await grantEbookEntitlement(userId, backfillOrderId, 'backfill'); } catch (_) { /* non-fatal */ }
    }
  }

  if (!entitled) {
    throw new functions.https.HttpsError('permission-denied', 'You have not purchased the ebook.');
  }

  // Throttle downloads per 24h window
  const logRef = db.collection('artifacts').doc('default-app-id').collection('ebookDownloads').doc(userId);
  const logSnap = await logRef.get();
  const logData = logSnap.exists ? logSnap.data() : {};
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const lastResetMs = logData.windowStart && logData.windowStart.toMillis ? logData.windowStart.toMillis() : 0;
  const inWindow = now - lastResetMs < dayMs;
  const currentCount = inWindow ? (logData.windowCount || 0) : 0;
  if (currentCount >= MAX_DOWNLOADS_PER_DAY) {
    throw new functions.https.HttpsError('resource-exhausted', 'Daily download limit reached. Please try again tomorrow or contact support.');
  }

  const file = await resolveEbookFile();
  const url = await issueEbookDownloadUrl(file, userId, LINK_EXPIRY_SECONDS);

  await logRef.set({
    windowStart: inWindow ? logData.windowStart : admin.firestore.FieldValue.serverTimestamp(),
    windowCount: currentCount + 1,
    totalCount: (logData.totalCount || 0) + 1,
    lastDownload: admin.firestore.FieldValue.serverTimestamp(),
    lastFile: file.name
  }, { merge: true });

  return { url, expiresIn: LINK_EXPIRY_SECONDS, file: file.name };
});

const BRAND_PURPLE = '#4f46e5';
const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');

// Generate Invoice PDF (omits shipping section for digital-only orders)
// Total/VAT are always derived from the order's actual totalAmount - never recomputed,
// so this can never drift from what was really charged (the business is not VAT registered).
async function generateInvoicePDF(orderId, order, userProfile) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

    const safeOrderId = (orderId || order.orderId || '').toString();
    const rawDate = order && order.orderDate;
    const orderDateValue = rawDate && typeof rawDate.toDate === 'function'
      ? rawDate.toDate()
      : new Date(rawDate || Date.now());
    const items = Array.isArray(order.items) ? order.items : [];
    const digitalOnly = isDigitalOnlyOrder(order);

        // Header - clean white background so the logo shows properly, thin brand-purple rule beneath.
        try {
            doc.image(LOGO_PATH, 50, 42, { width: 54 });
        } catch (imgErr) {
            console.warn('[generateInvoicePDF] Failed to embed logo:', imgErr.message);
        }
        doc.fillColor('#1f2937').fontSize(17).text('DISCIPLINED DISCIPLES', 118, 46);
        doc.fontSize(9).fillColor('#6b7280')
           .text('Premium South African Streetwear & Books', 118, 67)
           .text(`${SENDER_EMAIL}  \u00b7  ${SUPPORT_PHONE}`, 118, 80)
           .text('Johannesburg, South Africa', 118, 93);

        doc.fillColor('#1f2937').fontSize(20).text('INVOICE', 400, 46);
        doc.fontSize(9).fillColor('#6b7280')
        .text(`Invoice #: ${safeOrderId.substring(0, 12)}`, 400, 72)
        .text(`Date: ${orderDateValue.toLocaleDateString('en-ZA')}`, 400, 85)
        .text(`Status: ${digitalOnly ? 'Delivered (Digital)' : (order.status || 'Order Placed')}`, 400, 98);

        doc.moveTo(50, 115).lineTo(550, 115).lineWidth(1.5).strokeColor(BRAND_PURPLE).stroke();
        doc.strokeColor('#000000').lineWidth(1);

        // Customer Details
        let y = 140;
        doc.fillColor('#1f2937').fontSize(12).text('Bill To:', 50, y);
        y += 18;
        doc.fontSize(10).fillColor('#4b5563')
           .text(userProfile.name || order.customerName || 'Customer', 50, y);
        y += 14;
        doc.text(userProfile.email || order.customerEmail || '', 50, y);
        y += 14;

        if (!digitalOnly && order.deliveryAddress) {
            doc.text(order.deliveryAddress.line1 || '', 50, y);
            y += 14;
            if (order.deliveryAddress.line2) {
                doc.text(order.deliveryAddress.line2, 50, y);
                y += 14;
            }
            doc.text(`${order.deliveryAddress.city || ''}, ${order.deliveryAddress.province || ''} ${order.deliveryAddress.postalCode || ''}`, 50, y);
            y += 14;
        } else if (digitalOnly) {
            doc.fillColor(BRAND_PURPLE).fontSize(9).text('Digital delivery \u2014 download anytime from your profile', 50, y);
            y += 14;
        }

        // Items Table
        let yPosition = Math.max(y + 20, 260);
        doc.rect(50, yPosition - 6, 500, 20).fillColor('#eef2ff').fill();
        doc.fillColor('#3730a3').fontSize(9);
        doc.text('Item', 56, yPosition);
        doc.text('Size', 220, yPosition);
        doc.text('Color', 270, yPosition);
        doc.text('Qty', 330, yPosition);
        doc.text('Price', 380, yPosition);
        doc.text('Total', 470, yPosition);
        yPosition += 24;

        doc.fillColor('#1f2937').fontSize(10);
        items.forEach(item => {
          const price = Number(item.price) || 0;
          const quantity = Number(item.quantity) || 1;
          doc.text(item.name || 'Item', 56, yPosition, { width: 155 });
          doc.text(item.size || (isDigitalItem(item) ? 'Digital' : 'N/A'), 220, yPosition);
          doc.text(item.color || (isEbookItem(item) ? 'PDF' : (isJournalItem(item) ? 'Online' : 'N/A')), 270, yPosition);
          doc.text(quantity.toString(), 330, yPosition);
          doc.text(`R${price.toFixed(2)}`, 380, yPosition);
          doc.text(`R${(price * quantity).toFixed(2)}`, 470, yPosition);
          yPosition += 20;
        });

        // Totals - always the order's real totalAmount, never independently recomputed.
        yPosition += 15;
    const subtotal = items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      return sum + price * quantity;
    }, 0);
    const shipping = digitalOnly ? 0 : Number(order.shipping || order.shippingFee || order.shippingCost || 0);
    const total = Number(order.totalAmount) || (subtotal + shipping);

        doc.fillColor('#4b5563').fontSize(10);
        doc.text('Subtotal:', 380, yPosition);
        doc.text(`R${subtotal.toFixed(2)}`, 470, yPosition);
        yPosition += 15;

        doc.text('VAT (0% \u2014 not VAT registered):', 380, yPosition, { width: 130 });
        doc.text('R0.00', 470, yPosition);
        yPosition += 15;

        if (!digitalOnly) {
            doc.text('Shipping:', 380, yPosition);
            doc.text(`R${shipping.toFixed(2)}`, 470, yPosition);
            yPosition += 15;
        }

        doc.moveTo(380, yPosition + 4).lineTo(550, yPosition + 4).strokeColor(BRAND_PURPLE).stroke();
        doc.strokeColor('#000000');
        yPosition += 16;

        doc.fillColor('#1f2937').fontSize(13).text('Total:', 380, yPosition);
        doc.text(`R${total.toFixed(2)}`, 470, yPosition);

        yPosition += 45;
        doc.fontSize(9).fillColor('#6b7280')
           .text('Thank you for choosing discipline.', 50, yPosition)
           .text(`For support, contact ${SENDER_EMAIL} \u00b7 ${SUPPORT_PHONE}`, 50, yPosition + 14);

        doc.end();
    });
}

async function sendOrderPlacedEmails(orderId, order, docRef) {
    const db = admin.firestore();
    const usersRef = db.collection('artifacts').doc('default-app-id').collection('users');

    const userSnapshot = order.userId ? await usersRef.doc(order.userId).get() : null;
    const userProfile = userSnapshot && userSnapshot.exists ? userSnapshot.data() : {};

    const orderType = deriveOrderType(order);
    const digitalOnly = orderType === 'digital';
    const hasEbookItem = orderContainsEbook(order);

    // Build invoice and save PRIVATELY under invoices/{userId}/{orderId}.pdf
    const invoiceBuffer = await generateInvoicePDF(orderId, order, userProfile);
    const trimmedOrderId = orderId.substring(0, 12);
    const ownerScope = order.userId || 'guest';
    const invoicePath = `invoices/${ownerScope}/${orderId}.pdf`;
    const invoiceFile = bucket.file(invoicePath);
    await invoiceFile.save(invoiceBuffer, {
        metadata: { contentType: 'application/pdf' },
        resumable: false
    });
    // Signed URL good for 24 hours; profile page can request a fresh one anytime
    const invoiceUrl = await getSignedReadUrl(invoiceFile, 24 * 60 * 60);

    // Grant digital access (idempotent)
    if (hasEbookItem && order.userId) {
        try { await grantEbookEntitlement(order.userId, orderId, 'order'); }
        catch (e) { console.error('grantEbookEntitlement failed:', e.message); }
    }
    const hasJournalItem = orderContainsJournal(order);
    if (hasJournalItem && order.userId) {
        try { await grantJournalAccess(order.userId, 'order', orderId); }
        catch (e) { console.error('grantJournalAccess failed:', e.message); }
    }
    const journalOnly = digitalOnly && hasJournalItem && !hasEbookItem;

    const orderDateRaw = order && order.orderDate;
    const orderDateValue = orderDateRaw && typeof orderDateRaw.toDate === 'function'
        ? orderDateRaw.toDate()
        : new Date(orderDateRaw || Date.now());
    const orderDateLabel = orderDateValue.toLocaleDateString('en-ZA');
    const customerName = order.customerName || userProfile.name || 'friend';
    const firstName = (customerName || 'friend').toString().trim().split(' ')[0] || 'friend';
    const customerEmail = order.customerEmail || order.email || userProfile.email;
    // For digital-only orders, ignore any shipping-flavoured status/message on the doc.
    const displayStatus = digitalOnly
        ? 'Delivered (Digital)'
        : (order.status || 'Order Placed');
    const statusMessage = digitalOnly
        ? (journalOnly
            ? 'Your 30-Day Journal is unlocked and saved to your account. Sign in any time to write today’s entry.'
            : 'Your eBook is ready and permanently saved to your profile. Sign in any time to download it.')
        : (order.statusMessage || order.lastCustomerMessage || 'Your order is confirmed and being prepared with care!');
    const totalAmount = Number(order.totalAmount) || 0;
    const itemsList = Array.isArray(order.items) ? order.items : [];

    const styledItems = itemsList.map(item => {
        const meta = isEbookItem(item)
            ? 'Format: Digital PDF (lifetime access)'
            : (isJournalItem(item)
                ? 'Format: Online journal + printable version (lifetime access)'
                : `Size: ${item.size || 'N/A'} | Qty: ${item.quantity || 1}`);
        return `
        <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
            <p style="margin: 5px 0; font-weight: bold;">${item.name || 'Item'}</p>
            <p style="margin: 5px 0; color: #666;">${meta}</p>
            <p style="margin: 5px 0; color: #667eea; font-weight: bold;">R${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</p>
        </div>`;
    }).join('');

    const addressBlock = (!digitalOnly && order.deliveryAddress) ? `
        ${order.deliveryAddress.line1 || ''}<br>
        ${order.deliveryAddress.line2 ? order.deliveryAddress.line2 + '<br>' : ''}
        ${order.deliveryAddress.city || ''}, ${order.deliveryAddress.province || ''} ${order.deliveryAddress.postalCode || ''}
    ` : null;

    const ebookSection = hasEbookItem ? `
      <div style="background: linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%); padding: 22px; border-radius: 10px; margin-bottom: 22px; border-left: 4px solid #4f46e5;">
        <h3 style="margin: 0 0 10px 0; color: #1f2937;">\u{1F4D6} Your eBook is ready</h3>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">
          <strong>Relentlessly Disciplined</strong> is now permanently saved to your profile. Sign in any time to download it \u2014 your access never expires.
        </p>
        <p style="margin: 14px 0 0 0;">
          <a href="${SITE_URL}/profile.html" style="background:#4f46e5;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open My Profile & Download</a>
        </p>
      </div>
    ` : '';

    const journalSection = hasJournalItem ? `
      <div style="background: linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%); padding: 22px; border-radius: 10px; margin-bottom: 22px; border-left: 4px solid #7c3aed;">
        <h3 style="margin: 0 0 10px 0; color: #1f2937;">\u{1F4D3} Your 30-Day Journal is unlocked</h3>
        <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">
          Start with Day 0 tonight: five honest questions and the smallest version of each practice. Your entries are private to you, and you can print a copy any time.
        </p>
        <p style="margin: 14px 0 0 0;">
          <a href="${SITE_URL}/journal.html" style="background:#7c3aed;color:white;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open My Journal</a>
        </p>
      </div>
    ` : '';

    const shippingSection = addressBlock ? `
      <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 10px 0; color: #333;">Delivering to</h3>
        <p style="color: #666; line-height: 1.6;">${addressBlock}</p>
        <p style="color: #888; font-size: 13px; margin-top: 10px;">We'll send a tracking update the moment your parcel ships.</p>
      </div>
    ` : '';

    const founderNote = journalOnly
      ? `<p style="color: #4b5563; line-height: 1.7;">${firstName}, the aim isn't perfection \u2014 it's formation. Keep the commitments small enough to survive difficult days, and when you miss one, return. Don't turn one missed day into a collapsed identity.</p>`
      : digitalOnly
      ? `<p style="color: #4b5563; line-height: 1.7;">${firstName}, this isn't just a PDF \u2014 it's a promise to yourself. Read it slowly. Underline what convicts you. Come back to the chapters that hurt. Discipline is built one quiet decision at a time, and you just made one of them.</p>`
      : (orderType === 'mixed'
          ? `<p style="color: #4b5563; line-height: 1.7;">${firstName}, you grabbed something to wear <em>and</em> something to read \u2014 outer and inner discipline. That's the whole point. The physical pieces are on their way, and your eBook is already waiting in your profile.</p>`
          : `<p style="color: #4b5563; line-height: 1.7;">${firstName}, every piece in your parcel is a quiet reminder: discipline is a uniform you choose to put on every day. Wear it with intention. I'm grateful you chose to walk this road with us.</p>`);

    const upsellSection = digitalOnly ? `
      <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px; border: 1px dashed #e5e7eb;">
        <h3 style="margin: 0 0 8px 0; color: #111827;">Take it further</h3>
        <p style="margin: 0 0 10px 0; color: #6b7280;">Pair the book with pieces that remind you daily.</p>
        <p style="margin: 0;">
          <a href="${SITE_URL}/book.html" style="color: #4f46e5; font-weight: 600; margin-right: 14px;">Get the printed copy \u2192</a>
          <a href="${SITE_URL}/shop.html" style="color: #4f46e5; font-weight: 600;">Shop the apparel \u2192</a>
        </p>
      </div>` : `
      <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px; border: 1px dashed #e5e7eb;">
        <h3 style="margin: 0 0 8px 0; color: #111827;">Continue your journey</h3>
        <p style="margin: 0 0 10px 0; color: #6b7280;">If you haven't yet, the book pairs perfectly with what you just bought.</p>
        <p style="margin: 0;"><a href="${SITE_URL}/book.html" style="color: #4f46e5; font-weight: 600;">Read \u201CRelentlessly Disciplined\u201D \u2192</a></p>
      </div>`;

    const subjectPrefix = journalOnly
      ? '\u{1F4D3} Your 30-Day Journal is unlocked'
      : digitalOnly ? '\u{1F4D6} Your eBook is ready' : (orderType === 'mixed' ? '\u{1F4E6} Order confirmed (parcel + digital)' : '\u{1F4E6} Order confirmed');

    const customerHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">Thank you, ${firstName}!</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">${journalOnly ? 'Your journal is unlocked and saved to your account.' : (digitalOnly ? 'Your eBook is locked in and saved to your profile.' : 'Your Disciplined Disciples order is confirmed.')}</p>
            </div>
            <div style="padding: 30px; background: #f8f9fa;">
              <h2 style="color: #333; margin-bottom: 10px;">Order ${trimmedOrderId}</h2>
              <p style="color: #555; margin-bottom: 20px; line-height: 1.6;">${statusMessage}</p>
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                <p style="margin: 5px 0; color: #666;">Date: ${orderDateLabel}</p>
                <p style="margin: 5px 0; color: #666;">Total: <strong>R${totalAmount.toFixed(2)}</strong></p>
                <p style="margin: 5px 0; color: #666;">Status: ${displayStatus}</p>
                <p style="margin: 5px 0; color: #666;">Type: ${orderType === 'digital' ? 'Digital delivery' : orderType === 'mixed' ? 'Physical + Digital' : 'Physical delivery'}</p>
              </div>
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${digitalOnly ? 'In your order' : 'Items in your parcel'}</h3>
                ${styledItems}
              </div>
              ${shippingSection}
              ${ebookSection}
              ${journalSection}
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #111827;">A note from the founder</h3>
                ${founderNote}
                ${FOUNDER_SIGNATURE}
              </div>
              ${upsellSection}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${invoiceUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Download your invoice</a>
              </div>
              <p style="color: #666; line-height: 1.6;">
                If anything looks off, simply reply to this email \u2014 it comes straight to me. ${SENDER_EMAIL} \u00B7 ${SUPPORT_PHONE}
              </p>
            </div>
            <div style="background: #1a202c; color: white; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">Disciplined Disciples \u2014 Built on discipline, worn with intention.</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #ccc;">${SENDER_EMAIL} | ${SUPPORT_PHONE}</p>
            </div>
          </div>
        `;

    const customerEmailOptions = {
        to: customerEmail,
        subject: `${subjectPrefix} \u2014 ${trimmedOrderId}`,
        html: customerHtml,
        attachments: [
            { filename: `Invoice-${trimmedOrderId}.pdf`, content: invoiceBuffer, contentType: 'application/pdf' }
        ]
    };

    // Admin notification (Zolile only)
    const adminEmailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #28a745; color: white; padding: 26px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">\u{1F389} New ${journalOnly ? 'Journal' : orderType === 'digital' ? 'eBook' : orderType === 'mixed' ? 'Mixed' : 'Physical'} Order</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">${digitalOnly ? 'No fulfilment needed \u2014 customer already has access.' : 'Action: prepare and ship.'}</p>
            </div>
            <div style="padding: 25px; background: #f8f9fa;">
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                <h2 style="margin: 0 0 15px 0; color: #333;">Order Details</h2>
                <p style="margin: 8px 0;"><strong>Order ID:</strong> ${trimmedOrderId}</p>
                <p style="margin: 8px 0;"><strong>Type:</strong> ${orderType}</p>
                <p style="margin: 8px 0;"><strong>Customer:</strong> ${customerName}</p>
                <p style="margin: 8px 0;"><strong>Email:</strong> ${customerEmail || 'No email provided'}</p>
                <p style="margin: 8px 0;"><strong>Total:</strong> <span style="color:#28a745;font-size:18px;font-weight:bold;">R${totalAmount.toFixed(2)}</span></p>
                <p style="margin: 8px 0;"><strong>Date:</strong> ${orderDateLabel}</p>
              </div>
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 12px 0; color: #333;">Items</h3>
                <ul style="margin: 0; padding-left: 20px;">
                  ${itemsList.map(item => `<li style="margin: 6px 0;">${item.name || 'Item'} x${item.quantity || 1} \u2014 <strong>R${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</strong>${isDigitalItem(item) ? ' <span style="color:#4f46e5;">(digital)</span>' : ''}</li>`).join('')}
                </ul>
              </div>
              ${addressBlock ? `<div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;"><h3 style="margin:0 0 12px 0;color:#333;">Delivery Address</h3><p style="margin:0;line-height:1.6;color:#555;">${addressBlock}</p></div>` : ''}
              <div style="text-align: center; margin: 25px 0;">
                <a href="${SITE_URL}/admin-dashboard.html" style="background:#28a745;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">Open Admin Dashboard</a>
              </div>
            </div>
            <div style="background: #333; color: white; padding: 16px; text-align: center; font-size: 12px;">
              Disciplined Disciples Admin Notification \u00B7 ${SENDER_EMAIL}
            </div>
          </div>
        `;

    const emailJobs = [];
    if (customerEmail) {
        emailJobs.push(sendMailReliable(customerEmailOptions, { type: 'order_placed_customer', orderId, userId: order.userId }));
    }
    ADMIN_NOTIFY_EMAILS.forEach((adminEmail) => {
        emailJobs.push(sendMailReliable({
            to: adminEmail,
            subject: `\u{1F514} New ${orderType} order #${trimmedOrderId}`,
            html: adminEmailHtml,
            attachments: [{ filename: `Invoice-${trimmedOrderId}.pdf`, content: invoiceBuffer, contentType: 'application/pdf' }]
        }, { type: 'order_placed_admin', orderId, userId: order.userId }));
    });

    await Promise.allSettled(emailJobs);

    if (docRef) {
        const docUpdate = {
            invoicePath,
            invoiceUrl, // signed URL (24h); profile re-issues fresh ones as needed
            invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            confirmationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
            hasEbookItem,
            hasJournalItem,
            orderType
        };
        // Normalise status/message for digital-only so admin views & future emails are consistent.
        if (digitalOnly) {
            docUpdate.status = 'Delivered (Digital)';
            docUpdate.statusKey = 'delivered_digital';
            docUpdate.statusMessage = statusMessage;
            docUpdate.statusIcon = '\u{1F4D6}';
        }
        await docRef.set(docUpdate, { merge: true });
    }

  console.log(`Order confirmation emails dispatched for ${orderId} (type=${orderType})`);
}

// Mentorship purchases have no order document, so they get their own invoice email,
// reusing the same generateInvoicePDF() template/branding as ebook/book orders.
async function sendMentorshipInvoiceEmail(applicationId, appData, amount) {
    const orderLike = {
        orderId: applicationId,
        orderDate: new Date(),
        items: [{
            name: `Academy — ${appData.packageName || ACADEMY_PACKAGE_NAMES[appData.package] || appData.package || 'Programme'}`,
            price: Number(amount) || 0,
            quantity: 1,
            fulfillmentType: 'service'
        }],
        totalAmount: Number(amount) || 0,
        status: 'Paid'
    };
    const userProfile = { name: appData.name, email: appData.email };

    const invoiceBuffer = await generateInvoicePDF(applicationId, orderLike, userProfile);
    const ownerScope = appData.userId || 'guest';
    const invoicePath = `invoices/${ownerScope}/mentorship-${applicationId}.pdf`;
    const invoiceFile = bucket.file(invoicePath);
    await invoiceFile.save(invoiceBuffer, { metadata: { contentType: 'application/pdf' }, resumable: false });

    if (appData.email) {
        const firstName = (appData.name || 'friend').toString().trim().split(' ')[0] || 'friend';
        const trimmedId = applicationId.substring(0, 12);
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <div style="background: #ffffff; border-bottom: 3px solid #4f46e5; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; color: #1f2937;">Payment received, ${firstName}!</h1>
              <p style="margin: 10px 0 0 0; font-size: 15px; color: #4b5563;">Your Disciplined Disciples Academy spot is confirmed.</p>
            </div>
            <div style="padding: 28px; background: #f9fafb;">
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4f46e5;">
                <p style="margin: 5px 0; color: #4b5563;">Programme: <strong>${escapeHtmlForBroadcast(appData.packageName || ACADEMY_PACKAGE_NAMES[appData.package] || appData.package || 'Academy')}</strong></p>
                <p style="margin: 5px 0; color: #4b5563;">Amount: <strong>R${(Number(amount) || 0).toFixed(2)}</strong></p>
                <p style="margin: 5px 0; color: #4b5563;">Reference: ${trimmedId}</p>
              </div>
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #111827;">A note from Zolile</h3>
                <p style="color: #4b5563; line-height: 1.7;">${escapeHtmlForBroadcast(firstName)}, thank you for trusting me with this season of your journey. I'll be reaching out personally within 5–7 business days to schedule your first session. This isn't a course — it's a relationship built on discipline.</p>
                ${FOUNDER_SIGNATURE}
              </div>
              <div style="background: linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%); padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #7c3aed;">
                <h3 style="margin: 0 0 8px 0; color: #1f2937;">\u{1F4D3} Your 30-Day Journal is included</h3>
                <p style="margin: 0 0 12px 0; color: #4b5563; line-height: 1.6;">Start it before our first session. Sign in with <strong>${escapeHtmlForBroadcast(appData.email || 'the email you applied with')}</strong> and open your journal.</p>
                <a href="${SITE_URL}/journal.html" style="background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open My Journal</a>
              </div>
              <p style="color: #6b7280; font-size: 13px;">Questions in the meantime? Reply to this email or WhatsApp ${SUPPORT_PHONE}.</p>
            </div>
          </div>
        `;
        await sendMailReliable({
            to: appData.email,
            subject: `✅ Academy payment confirmed — ${trimmedId}`,
            html,
            attachments: [{ filename: `Invoice-Mentorship-${trimmedId}.pdf`, content: invoiceBuffer, contentType: 'application/pdf' }]
        }, { type: 'mentorship_invoice_customer', applicationId, userId: appData.userId || null });
    }

    return { invoicePath };
}

// Send Order Confirmation Email with Invoice
exports.sendOrderConfirmation = withSecrets.firestore
  .document('artifacts/default-app-id/orders/{orderId}')
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    if (!order) {
      return null;
    }

    const paid = isPaidStatus(order.paymentStatus);
    const placed = ((order.statusKey || order.status || '')).toLowerCase().includes('order_placed') || (order.status || '').toLowerCase() === 'order placed';

    if (!paid || !placed) {
      console.log(`Skipping confirmation email for order ${orderId} - status ${order.status} payment ${order.paymentStatus}`);
      return null;
    }

    if (order.confirmationEmailSentAt) {
      console.log(`Order confirmation already sent for ${orderId}.`);
      return null;
    }

    try {
      await sendOrderPlacedEmails(orderId, order, snap.ref);
    } catch (error) {
      console.error('Error sending order confirmation:', error);
    }

    return null;
  });

// Send Order Status Update Email
exports.sendOrderStatusUpdate = withSecrets.firestore
  .document('artifacts/default-app-id/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const orderId = context.params.orderId;

    // Only send email if status changed
    if (!afterData) {
        return null;
    }

    const paidAfter = isPaidStatus(afterData.paymentStatus);
    const statusKeyAfter = (afterData.statusKey || '').toLowerCase();
    const shouldSendOrderPlaced = paidAfter && statusKeyAfter === 'order_placed' && !afterData.confirmationEmailSentAt;

    if (shouldSendOrderPlaced) {
        try {
            await sendOrderPlacedEmails(orderId, afterData, change.after.ref);
        } catch (error) {
            console.error('Error sending order placed emails on update:', error);
        }
        return null;
    }

    const statusChanged = (beforeData.status || '') !== (afterData.status || '');
    const messageChanged = (beforeData.statusMessage || '') !== (afterData.statusMessage || '');

    if (!statusChanged && !messageChanged) {
      return null;
    }

    // Skip if this update is the same write that stamped confirmationEmailSentAt
    // (i.e. our digital-order normalisation). Avoids a duplicate status email
    // immediately after the order-placed email.
    const confirmationJustSet = !beforeData.confirmationEmailSentAt && !!afterData.confirmationEmailSentAt;
    if (confirmationJustSet) {
      console.log(`Skipping status update email for ${orderId} - confirmation email just dispatched.`);
      return null;
    }

    try {
        const db = admin.firestore();
        const userSnapshot = afterData.userId
            ? await db.collection('artifacts').doc('default-app-id').collection('users').doc(afterData.userId).get()
            : null;
        const userProfile = userSnapshot && userSnapshot.exists ? userSnapshot.data() : {};

        const statusMessage = afterData.statusMessage || afterData.lastCustomerMessage || `Your order status has been updated to: ${afterData.status}`;
        const statusIcon = afterData.statusIcon || '✨';
        const statusColourMap = {
            delivered: '#28a745',
            'out for delivery': '#007bff',
            arriving: '#17a2b8',
            awaiting: '#ffc107',
            pending: '#ffc107',
            cancelled: '#dc3545'
        };

        const normalizedStatus = (afterData.status || '').toLowerCase();
        const statusColor = Object.entries(statusColourMap).find(([keyword]) => normalizedStatus.includes(keyword))?.[1] || '#667eea';

        const trimmedOrderId = orderId.substring(0, 12);
        const customerEmail = afterData.customerEmail || afterData.email || userProfile.email;
        const customerName = userProfile.name || afterData.customerName || 'Customer';
        const orderDateRaw = afterData.orderDate;
        const orderDateValue = orderDateRaw && typeof orderDateRaw.toDate === 'function'
            ? orderDateRaw.toDate()
            : new Date(orderDateRaw || Date.now());
        const orderDateLabel = orderDateValue.toLocaleDateString('en-ZA');

        if (customerEmail) {
            const customerEmailOptions = {
                to: customerEmail,
                subject: `Order Update \u2014 ${trimmedOrderId}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: ${statusColor}; color: white; padding: 30px; text-align: center;">
                      <h1 style="margin: 0; font-size: 26px;">${statusIcon} Order update</h1>
                      <p style="margin: 10px 0 0 0; font-size: 16px;">Order ${trimmedOrderId}</p>
                    </div>
                    <div style="padding: 28px; background: #f8f9fa;">
                      <h2 style="color: #333; margin-bottom: 15px;">Hello ${customerName.split(' ')[0] || 'friend'},</h2>
                      <p style="color: #555; line-height: 1.6; font-size: 15px;">${statusMessage}</p>
                      <div style="background: white; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColor};">
                        <p style="margin: 6px 0; color: #666;"><strong>Status:</strong> ${afterData.status}</p>
                        <p style="margin: 6px 0; color: #666;"><strong>Date:</strong> ${orderDateLabel}</p>
                        ${afterData.trackingNumber ? `<p style="margin: 6px 0; color: #666;"><strong>Tracking number:</strong> ${afterData.trackingNumber}</p>` : ''}
                        ${afterData.estimatedArrivalText ? `<p style="margin: 6px 0; color: #666;"><strong>ETA:</strong> ${afterData.estimatedArrivalText}</p>` : ''}
                      </div>
                      <div style="text-align: center; margin: 25px 0;">
                        <a href="${SITE_URL}/profile.html#orders" style="background: ${statusColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View my order</a>
                      </div>
                      ${FOUNDER_SIGNATURE}
                      <p style="margin-top: 18px; color: #999; font-size: 12px;">${SENDER_EMAIL} | ${SUPPORT_PHONE}</p>
                    </div>
                  </div>
                `
            };

            await sendMailReliable(customerEmailOptions, { type: 'order_status_customer', orderId, userId: afterData.userId });
        }

        if (normalizedStatus.includes('delivered')) {
            await sendMailReliable({
                to: OWNER_EMAIL,
                subject: `Delivery completed \u2014 ${trimmedOrderId}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
                    <h2 style="color: #28a745;">Order delivered \u2705</h2>
                    <p><strong>Order:</strong> ${trimmedOrderId}</p>
                    <p><strong>Customer:</strong> ${customerName} (${customerEmail || 'no email'})</p>
                    <p><strong>Message shared:</strong> ${statusMessage}</p>
                  </div>
                `
            }, { type: 'order_delivered_admin', orderId, userId: afterData.userId });
        }

        console.log(`Status update email processed for order ${orderId}`);

    } catch (error) {
        console.error('Error sending status update email:', error);
    }

    return null;
  });

// PayFast Payment Verification (ITN)
// An order or Academy booking is only marked paid when all of these hold:
//   1. merchant_id is ours
//   2. the signature matches (enforced when PAYFAST_PASSPHRASE is configured)
//   3. PayFast's own server confirms the notification (query/validate -> VALID)
//   4. payment_status is COMPLETE
//   5. the amount paid covers what the server prices the order/package at
// Anything that fails 5 is held as "Under Review" for the owner instead of being fulfilled.
exports.verifyPayfastPayment = withSecrets.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const rawBody = (req.rawBody || Buffer.from('')).toString('utf8');
  const payload = querystring.parse(rawBody);
  const paramString = payfastParamString(rawBody);
  const ref = (payload.custom_str1 || payload.m_payment_id || '').toString().trim();
  const scope = (payload.custom_str3 || '').toString().toLowerCase() === 'mentorship' ? 'academy' : 'order';
  const payfastPaymentId = (payload.pf_payment_id || '').toString().trim() || null;
  const paymentStatus = (payload.payment_status || '').toString().toUpperCase();
  const amountGross = Number(payload.amount_gross);
  const baseLog = { ref: ref || null, scope, payfastPaymentId, paymentStatus, amountGross: Number.isFinite(amountGross) ? amountGross : null };

  try {
    if (!ref) {
      await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['Missing reference'] }, baseLog));
      res.status(400).send('Missing reference');
      return;
    }

    if (String(payload.merchant_id || '') !== PAYFAST_MERCHANT_ID) {
      await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['Merchant id mismatch'] }, baseLog));
      res.status(400).send('Invalid merchant');
      return;
    }

    const signature = checkPayfastSignature(paramString, payload.signature);
    if (PAYFAST_PASSPHRASE && !signature.valid) {
      await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['Signature mismatch'] }, baseLog));
      res.status(400).send('Invalid signature');
      return;
    }
    if (signature.checked && !signature.valid) {
      console.warn(`[payfast] signature for ${ref} did not match without a passphrase; relying on server confirmation.`);
    }

    let confirmed = false;
    try {
      confirmed = await confirmWithPayfast(paramString);
    } catch (err) {
      // Could not reach PayFast: answer with an error so PayFast retries the notification.
      console.error('[payfast] validate call failed:', err.message);
      await logPaymentNotification(Object.assign({ outcome: 'retry', reasons: ['PayFast validate unreachable: ' + err.message] }, baseLog));
      res.status(500).send('Validation unavailable');
      return;
    }
    if (!confirmed) {
      await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['PayFast did not confirm this notification'] }, baseLog));
      res.status(400).send('Not confirmed by PayFast');
      return;
    }

    if (paymentStatus !== 'COMPLETE') {
      await logPaymentNotification(Object.assign({ outcome: 'ignored', reasons: [`Status ${paymentStatus || 'unknown'}`] }, baseLog));
      res.status(200).send('OK');
      return;
    }

    const verification = {
      method: 'payfast-itn',
      serverConfirmed: true,
      signatureChecked: signature.checked,
      signatureValid: signature.valid,
      amountGross,
      verifiedAt: new Date().toISOString()
    };

    if (scope === 'academy') {
      await handleAcademyPayment(ref, payload, payfastPaymentId, amountGross, verification, baseLog);
    } else {
      await handleOrderPayment(ref, payload, payfastPaymentId, amountGross, verification, baseLog);
    }
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error verifying payment:', error);
    await logPaymentNotification(Object.assign({ outcome: 'error', reasons: [error.message] }, baseLog));
    res.status(500).send('Error');
  }
});

async function handleAcademyPayment(applicationId, payload, payfastPaymentId, amountGross, verification, baseLog) {
  const appRef = admin.firestore().collection('mentorshipApplications').doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) {
    await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['Academy application not found'] }, baseLog));
    return;
  }
  const appData = appSnap.data() || {};
  if (isPaidStatus(appData.paymentStatus)) {
    await logPaymentNotification(Object.assign({ outcome: 'duplicate' }, baseLog));
    return;
  }

  const expectedPrice = await getAcademyPackagePrice(appData.package);
  const reasons = [];
  if (expectedPrice == null) reasons.push(`No server price for package "${appData.package || 'unknown'}"`);
  else if (!(amountGross + 0.009 >= expectedPrice)) reasons.push(`Paid R${amountGross.toFixed(2)} but the package costs R${expectedPrice.toFixed(2)}`);

  if (reasons.length) {
    await appRef.set({
      paymentStatus: 'Under Review',
      paymentGateway: 'PayFast',
      paymentReference: payfastPaymentId || null,
      paymentReview: { reasons, expected: expectedPrice, received: amountGross, at: new Date().toISOString() },
      paymentVerification: verification,
      webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await logPaymentNotification(Object.assign({ outcome: 'review', reasons }, baseLog));
    await alertOwnerPaymentReview('Academy booking', applicationId, {
      Applicant: `${appData.name || ''} (${appData.email || 'no email'})`,
      Package: appData.packageName || appData.package || 'unknown',
      'Amount received': `R${amountGross.toFixed(2)}`,
      'Expected': expectedPrice == null ? 'unknown' : `R${expectedPrice.toFixed(2)}`,
      Reasons: reasons
    });
    return;
  }

  const amount = amountGross;
  await appRef.set({
    paymentStatus: 'Paid',
    paymentGateway: 'PayFast',
    paymentReference: payfastPaymentId || null,
    paymentCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
    amountPaid: amount,
    paymentVerification: verification,
    status: appData.status === 'new' || !appData.status ? 'paid' : appData.status,
    webhookReceivedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  await logPaymentNotification(Object.assign({ outcome: 'paid' }, baseLog));

  // Every paid Academy package includes the 30-Day Journal.
  try {
    if (appData.userId) await grantJournalAccess(appData.userId, 'academy', applicationId);
    else await grantJournalAccessByEmail(appData.email, 'academy', applicationId);
  } catch (e) {
    console.error('[academy-paid] journal access grant failed:', e.message);
  }

  // Notify owner of the paid booking
  try {
    await sendMailReliable({
      to: OWNER_EMAIL,
      subject: `\u{1F4B8} Academy payment received — ${appData.name || 'Applicant'} · R${amount}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#1a202c;">Academy Booking Paid</h2>
          <p><strong>Applicant:</strong> ${escapeHtmlForBroadcast(appData.name || '(unknown)')}<br>
             <strong>Email:</strong> ${escapeHtmlForBroadcast(appData.email || '(none)')}<br>
             <strong>Package:</strong> ${escapeHtmlForBroadcast(appData.packageName || appData.package || '(unspecified)')}<br>
             <strong>Amount:</strong> R${Number(amount).toFixed(2)}<br>
             <strong>Application ID:</strong> <code>${escapeHtmlForBroadcast(applicationId)}</code></p>
          <p style="color:#475569;">Their 30-Day Journal has been unlocked automatically.</p>
          <p><a href="${SITE_URL}/admin-mentorship.html" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open Academy admin</a></p>
        </div>`
    }, { type: 'mentorship_paid', applicationId });
  } catch (e) {
    console.error('[academy-paid email] failed:', e.message);
  }

  // Customer-facing invoice email (separate from the owner notification above).
  try {
    const { invoicePath } = await sendMentorshipInvoiceEmail(applicationId, appData, amount);
    await appRef.set({
      invoicePath,
      invoiceGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
      paymentConfirmationSentAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error('[academy invoice email] failed:', e.message);
  }
}

async function handleOrderPayment(orderId, payload, payfastPaymentId, amountGross, verification, baseLog) {
  const orderRef = admin.firestore().collection('artifacts').doc('default-app-id').collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    await logPaymentNotification(Object.assign({ outcome: 'rejected', reasons: ['Order not found'] }, baseLog));
    return;
  }

  const orderData = orderSnap.data() || {};
  const FieldValue = admin.firestore.FieldValue;
  if (isPaidStatus(orderData.paymentStatus)) {
    console.log(`Order ${orderId} already marked as paid. Skipping duplicate update.`);
    await logPaymentNotification(Object.assign({ outcome: 'duplicate' }, baseLog));
    return;
  }

  const pricing = await priceOrderServerSide(orderData);
  const reasons = pricing.problems.slice();
  if (!(amountGross + 0.009 >= pricing.expected)) {
    reasons.push(`Paid R${amountGross.toFixed(2)} but the items cost R${pricing.expected.toFixed(2)}`);
  }
  verification.expectedAmount = pricing.expected;

  if (reasons.length) {
    const reviewMessage = 'We received your payment and are double-checking it. We will update you shortly — no action needed from you.';
    const reviewEntry = {
      statusKey: 'payment_review',
      status: 'Payment Under Review',
      label: 'Payment under review',
      message: reviewMessage,
      icon: '\u{1F50E}',
      createdAt: new Date().toISOString(),
      updatedBy: 'payfast-webhook'
    };
    await orderRef.set({
      paymentStatus: 'Under Review',
      paymentGateway: 'PayFast',
      paymentReference: payfastPaymentId || null,
      payfastTxnId: payfastPaymentId || orderData.payfastTxnId || null,
      paymentReview: { reasons, expected: pricing.expected, received: amountGross, at: new Date().toISOString() },
      paymentVerification: verification,
      statusKey: 'payment_review',
      status: 'Payment Under Review',
      statusLabel: 'Payment under review',
      statusIcon: '\u{1F50E}',
      statusMessage: reviewMessage,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: 'payfast-webhook',
      webhookReceivedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion(reviewEntry),
      notes: FieldValue.arrayUnion(Object.assign({ type: 'status' }, reviewEntry))
    }, { merge: true });
    await logPaymentNotification(Object.assign({ outcome: 'review', reasons, expected: pricing.expected }, baseLog));
    await alertOwnerPaymentReview('order', orderId, {
      Customer: `${orderData.customerName || ''} (${orderData.customerEmail || 'no email'})`,
      'Amount received': `R${amountGross.toFixed(2)}`,
      'Catalogue price': `R${pricing.expected.toFixed(2)}`,
      'Order total shown to customer': `R${(Number(orderData.totalAmount) || 0).toFixed(2)}`,
      Reasons: reasons
    });
    return;
  }

  const customerName = orderData.customerName || orderData.deliveryAddress?.name || 'friend';
  const firstName = customerName.trim().split(' ')[0] || 'friend';
  const statusMessage = `\u{1F389} Thank you, ${firstName}! Your Disciplined Disciples order is officially locked in.`;

  const historyEntry = {
    statusKey: 'order_placed',
    status: 'Order Placed',
    label: 'Order placed',
    message: statusMessage,
    icon: '\u{1F389}',
    createdAt: new Date().toISOString(),
    updatedBy: 'payfast-webhook',
    meta: {
      source: 'payfast',
      paymentReference: payfastPaymentId || null
    }
  };

  const statusNote = Object.assign({ type: 'status' }, historyEntry);

  await orderRef.set({
    statusKey: 'order_placed',
    status: 'Order Placed',
    statusLabel: 'Order placed',
    statusIcon: '\u{1F389}',
    statusMessage,
    statusUpdatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: 'payfast-webhook',
    lastCustomerMessage: statusMessage,
    paymentStatus: 'Paid',
    paymentGateway: 'PayFast',
    paymentReference: payfastPaymentId || null,
    paymentCompletedAt: FieldValue.serverTimestamp(),
    payfastTxnId: payfastPaymentId || orderData.payfastTxnId || null,
    amountPaid: amountGross,
    paymentVerification: verification,
    webhookReceivedAt: FieldValue.serverTimestamp(),
    orderType: deriveOrderType(orderData),
    statusHistory: FieldValue.arrayUnion(historyEntry),
    notes: FieldValue.arrayUnion(statusNote)
  }, { merge: true });
  await logPaymentNotification(Object.assign({ outcome: 'paid', expected: pricing.expected }, baseLog));

  // Grant digital access immediately on payment confirmation (idempotent).
  // The owner of the order is always the account that created it.
  if (orderData.userId && orderContainsEbook(orderData)) {
    try {
      await grantEbookEntitlement(orderData.userId, orderId, 'payfast');
    } catch (e) {
      console.error('Failed to grant ebook entitlement from webhook:', e.message);
    }
  }
  if (orderData.userId && orderContainsJournal(orderData)) {
    try {
      await grantJournalAccess(orderData.userId, 'order', orderId);
    } catch (e) {
      console.error('Failed to grant journal access from webhook:', e.message);
    }
  }
}

// Support Request Email
exports.sendSupportRequest = withSecrets.firestore
  .document('artifacts/default-app-id/support-requests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    const requestId = context.params.requestId;

    try {
      // Email to business
      const businessEmailOptions = {
        to: OWNER_EMAIL,
        subject: `New Support Request - ${request.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">New Support Request</h1>
            </div>
            
            <div style="padding: 20px;">
              <p><strong>Request ID:</strong> ${requestId}</p>
              <p><strong>Customer:</strong> ${request.userName || 'N/A'} (${request.userEmail})</p>
              <p><strong>Subject:</strong> ${request.subject}</p>
              <p><strong>Date:</strong> ${new Date(request.createdAt.toDate()).toLocaleDateString('en-ZA')}</p>
              
              <h3>Message:</h3>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 3px solid #dc3545;">
                ${request.message.replace(/\n/g, '<br>')}
              </div>
              
              <p style="margin-top: 20px;">
                <a href="mailto:${request.userEmail}?subject=Re: ${request.subject}">Reply to Customer</a>
              </p>
            </div>
          </div>
        `
      };

      // Auto-reply to customer
      const customerEmailOptions = {
        to: request.userEmail,
        subject: `Support Request Received - ${request.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #667eea; color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">Support Request Received</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">We'll get back to you soon!</p>
            </div>
            
            <div style="padding: 30px; background: #f8f9fa;">
              <h2 style="color: #333; margin-bottom: 20px;">Hello ${request.userName || 'Customer'},</h2>
              
              <p style="color: #666; line-height: 1.6;">
                Thank you for contacting us! We've received your support request and our team will review it shortly.
              </p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
                <p style="margin: 0 0 10px 0; font-weight: bold; color: #333;">Your Request:</p>
                <p style="margin: 5px 0; color: #666;"><strong>Subject:</strong> ${request.subject}</p>
                <p style="margin: 5px 0; color: #666;"><strong>Request ID:</strong> ${requestId}</p>
                <div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                  ${request.message.replace(/\n/g, '<br>')}
                </div>
              </div>
              
              <p style="color: #666; line-height: 1.6;">
                We typically respond within 24 hours during business days. If this is urgent, you can also reach us directly at ${SENDER_EMAIL} or +27 69 206 0618.
              </p>
            </div>
            
            <div style="background: #333; color: white; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">Disciplined Disciples - Premium South African Streetwear</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #ccc;">${SENDER_EMAIL} | +27 69 206 0618</p>
            </div>
          </div>
        `
      };

      // Send both emails
      await Promise.all([
        sendMailReliable(businessEmailOptions, { type: 'support_admin', userId: request.userId }),
        sendMailReliable(customerEmailOptions, { type: 'support_customer_ack', userId: request.userId })
      ]);

      console.log(`Support request emails sent for request ${requestId}`);
      
    } catch (error) {
      console.error('Error sending support request emails:', error);
    }
  });

// Mentorship Application Notification
exports.onMentorshipApplicationCreated = withSecrets.firestore
  .document('mentorshipApplications/{applicationId}')
  .onCreate(async (snap, context) => {
    const app = snap.data();
    const applicationId = context.params.applicationId;
    if (!app) return null;

    const esc = escapeHtmlForBroadcast;
    const applicantName = app.name || 'Applicant';
    const applicantEmail = app.email || '';
    const applicantGoal = app.goal || '';
    const applicantTrack = app.track || '';
    const packageLabel = app.packageName || ACADEMY_PACKAGE_NAMES[app.package] || app.package || '';
    const firstName = applicantName.split(' ')[0] || 'friend';
    const submittedAt = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    try {
      // Notify owner
      await sendMailReliable({
        to: OWNER_EMAIL,
        subject: `\u{1F393} New Academy Application — ${applicantName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 580px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 28px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 22px;">New Academy Application</h1>
              <p style="margin: 8px 0 0; opacity: 0.85; font-size: 14px;">${submittedAt}</p>
            </div>
            <div style="background: #f8f9fa; padding: 24px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; font-weight: 600; color: #555; width: 130px;">Name</td><td style="padding: 8px 0; color: #1a202c;">${esc(applicantName)}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: 600; color: #555;">Email</td><td style="padding: 8px 0;"><a href="mailto:${esc(applicantEmail)}" style="color: #667eea;">${esc(applicantEmail)}</a></td></tr>
                ${packageLabel ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #555;">Package</td><td style="padding: 8px 0; color: #1a202c;">${esc(packageLabel)}</td></tr>` : ''}
                ${applicantTrack ? `<tr><td style="padding: 8px 0; font-weight: 600; color: #555;">Stage</td><td style="padding: 8px 0; color: #1a202c;">${esc(applicantTrack)}</td></tr>` : ''}
                <tr><td style="padding: 8px 0; font-weight: 600; color: #555; vertical-align: top;">Goal</td><td style="padding: 8px 0; color: #4a5568; line-height: 1.6;">${esc(applicantGoal) || '(not provided)'}</td></tr>
              </table>
              <div style="margin-top: 20px; padding: 14px; background: white; border-radius: 8px; border-left: 4px solid #667eea;">
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Application ID: <code>${esc(applicationId)}</code></p>
              </div>
              <p style="margin: 20px 0 0; font-size: 13px; color: #9ca3af;">Review in <a href="${SITE_URL}/admin-mentorship.html" style="color: #667eea;">Academy Admin</a>.</p>
            </div>
            <div style="background: #1a202c; color: rgba(255,255,255,0.6); padding: 16px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px;">
              Disciplined Disciples Admin Notification | ${SENDER_EMAIL}
            </div>
          </div>
        `
      });

      // Acknowledgement to applicant
      if (applicantEmail) {
        await sendMailReliable({
          to: applicantEmail,
          subject: `We received your Academy application, ${firstName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 22px;">Application Received ✓</h1>
                <p style="margin: 8px 0 0; opacity: 0.85; font-size: 14px;">Disciplined Disciples Academy</p>
              </div>
              <div style="padding: 28px; background: white;">
                <p style="font-size: 16px; color: #1a202c; font-weight: 600;">Hi ${esc(firstName)},</p>
                <p style="color: #4a5568; line-height: 1.7;">Thank you for applying to the Disciplined Disciples Academy. Your application has been received and will be reviewed personally by Zolile.</p>
                <p style="color: #4a5568; line-height: 1.7;">You can expect to hear back within <strong>5–7 business days</strong>. If you have any questions in the meantime, reply to this email or reach out on WhatsApp.</p>
                <div style="margin: 24px 0; padding: 16px; background: #f5f3ff; border-radius: 8px; border-left: 4px solid #7c3aed;">
                  <p style="margin: 0; font-size: 14px; color: #5b21b6; font-style: italic;">"Discipline is the DNA of success. The fact that you applied means it is already in you."</p>
                  <p style="margin: 8px 0 0; font-size: 12px; color: #7c3aed; font-weight: 600;">— Zolile Nomaqhiza</p>
                </div>
                <p style="color: #4a5568; line-height: 1.7;">While you wait, try the first days of the <a href="${SITE_URL}/journal.html" style="color: #667eea; font-weight: 600;">30-Day Discipline Journal</a> free.</p>
                <p style="color: #6b7280; font-size: 13px;">WhatsApp: <a href="https://wa.me/27692060618" style="color: #667eea;">+27 69 206 0618</a></p>
              </div>
              <div style="background: #1a202c; color: rgba(255,255,255,0.6); padding: 16px; text-align: center; font-size: 12px; border-radius: 0 0 8px 8px;">
                Disciplined Disciples Academy | disciplineddisciples.co.za
              </div>
            </div>
          `
        });
      }

      console.log(`Academy application emails sent for ${applicationId}`);
    } catch (error) {
      console.error('Error sending academy application emails:', error);
    }
    return null;
  });


// ============================================================
// PHASE A ADDITIONS: invoice signed-URL refresh, recovery, welcome
// ============================================================

// Issue a fresh 15-min signed URL for the invoice belonging to the caller.
exports.getInvoiceDownloadLink = withSecrets.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Please sign in.');
  }
  const orderId = (data && data.orderId || '').toString().trim();
  if (!orderId) {
    throw new functions.https.HttpsError('invalid-argument', 'orderId is required.');
  }
  const callerUid = context.auth.uid;
  const isAdminCaller = ADMIN_NOTIFY_EMAILS.includes((context.auth.token.email || '').toLowerCase())
    || (context.auth.token.email || '').toLowerCase() === 'zmabege@gmail.com'
    || (context.auth.token.email || '').toLowerCase() === SENDER_EMAIL.toLowerCase();

  const db = admin.firestore();
  const orderSnap = await db.collection('artifacts').doc('default-app-id').collection('orders').doc(orderId).get();
  if (!orderSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Order not found.');
  }
  const order = orderSnap.data() || {};
  if (order.userId !== callerUid && !isAdminCaller) {
    throw new functions.https.HttpsError('permission-denied', 'You can only download your own invoices.');
  }
  const ownerScope = order.userId || 'guest';
  const path = order.invoicePath || `invoices/${ownerScope}/${orderId}.pdf`;
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice file not yet generated.');
  }
  const url = await getSignedReadUrl(file, 15 * 60);
  return { url, expiresIn: 15 * 60 };
});

// Admin-only recovery: re-run sendOrderPlacedEmails for one paid order that missed confirmation.
// Triggered by writing to recoveryRequests/{auto} with { orderId, requestedBy }.
exports.processRecoveryRequest = withSecrets.firestore
  .document('recoveryRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const req = snap.data() || {};
    const orderId = (req.orderId || '').toString().trim();
    if (!orderId) {
      await snap.ref.set({ status: 'failed', error: 'missing orderId', processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return null;
    }
    try {
      const db = admin.firestore();
      const orderRef = db.collection('artifacts').doc('default-app-id').collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        await snap.ref.set({ status: 'failed', error: 'order not found', processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return null;
      }
      const order = orderSnap.data() || {};
      if (!isPaidStatus(order.paymentStatus)) {
        await snap.ref.set({ status: 'skipped', reason: 'not paid', processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return null;
      }
      // Force re-send by clearing the stamp; sendOrderPlacedEmails will re-stamp.
      await orderRef.update({ confirmationEmailSentAt: admin.firestore.FieldValue.delete() });
      await sendOrderPlacedEmails(orderId, order, orderRef);
      await snap.ref.set({
        status: 'sent',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        customerEmail: order.customerEmail || order.email || null,
        hasEbook: orderContainsEbook(order)
      }, { merge: true });
    } catch (err) {
      console.error('Recovery failed for', orderId, err);
      await snap.ref.set({ status: 'failed', error: err.message, processedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    return null;
  });

// Personal welcome email from the founder on every new signup.
exports.sendCustomerWelcome = withSecrets.auth.user().onCreate(async (user) => {
  if (!user || !user.email) return null;
  const email = user.email;
  const displayName = user.displayName || '';
  const firstName = (displayName || email.split('@')[0] || 'friend').toString().split(' ')[0];
  try {
    await sendMailReliable({
      to: email,
      subject: `Welcome to Disciplined Disciples, ${firstName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#ffffff;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px; text-align: center;">
            <h1 style="margin: 0; font-size: 26px;">Welcome, ${firstName}.</h1>
            <p style="margin: 10px 0 0; font-size: 15px; opacity: 0.9;">You just joined a movement built on discipline.</p>
          </div>
          <div style="padding: 30px; background:#f8f9fa;">
            <p style="color:#1f2937; font-size: 16px; line-height: 1.7;">
              I'm Zolile, the founder. I built Disciplined Disciples because I believe that <strong>discipline is the DNA of every life worth living</strong> &mdash;
              and the people who choose it deserve to be reminded of it daily, in what they wear and what they read.
            </p>
            <p style="color:#4b5563; line-height: 1.7;">
              Your account is ready. Here's what you can do next:
            </p>
            <ul style="color:#4b5563; line-height: 1.9;">
              <li><a href="${SITE_URL}/book.html" style="color:#4f46e5; font-weight:600;">Read &ldquo;Relentlessly Disciplined&rdquo;</a> &mdash; my book on building the inner game.</li>
              <li><a href="${SITE_URL}/journal.html" style="color:#4f46e5; font-weight:600;">Start the 30-Day Discipline Journal</a> &mdash; the first days are free.</li>
              <li><a href="${SITE_URL}/academy.html" style="color:#4f46e5; font-weight:600;">Explore the Academy</a> &mdash; mentorship for every stage of the CA journey and beyond.</li>
              <li><a href="${SITE_URL}/shop.html" style="color:#4f46e5; font-weight:600;">Explore the apparel</a> &mdash; pieces designed to make you unmistakable.</li>
              <li><a href="${SITE_URL}/profile.html" style="color:#4f46e5; font-weight:600;">Open your profile</a> &mdash; track orders, downloads, and entitlements.</li>
            </ul>
            <div style="margin: 24px 0; padding: 18px; background:#f5f3ff; border-left:4px solid #7c3aed; border-radius:8px;">
              <p style="margin:0; color:#5b21b6; font-style:italic; line-height:1.6;">"The version of you that you want to become is built one disciplined decision at a time. Start small. Start today. Start again."</p>
            </div>
            ${FOUNDER_SIGNATURE}
            <p style="color:#9ca3af; font-size:12px; margin-top:24px;">If this wasn't you, simply ignore this email and the account will sit dormant.</p>
          </div>
          <div style="background:#1a202c; color:#cbd5e1; padding:18px; text-align:center; font-size:12px;">
            ${SENDER_EMAIL} &middot; ${SUPPORT_PHONE} &middot; ${SITE_URL}
          </div>
        </div>
      `
    }, { type: 'welcome', userId: user.uid });
    await admin.firestore().collection('emailLogs').doc(`welcome_${user.uid}`).set({
      welcomeSentAt: admin.firestore.FieldValue.serverTimestamp(),
      email
    }, { merge: true });
  } catch (e) {
    console.error('Welcome email failed for', email, e.message);
  }
  return null;
});

// === Broadcast emails (C2) ===
const BROADCAST_ADMIN_EMAILS = new Set(['zmabege@gmail.com', 'nomaqhizazolile@gmail.com']);

function escapeHtmlForBroadcast(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderBroadcastEmail(job, recipient) {
  const firstName = (recipient.firstName || (recipient.email || '').split('@')[0] || 'friend').toString();
  const personalize = (s) => String(s || '')
    .replace(/\{\{\s*firstName\s*\}\}/gi, escapeHtmlForBroadcast(firstName))
    .replace(/\{\{\s*email\s*\}\}/gi, escapeHtmlForBroadcast(recipient.email || ''));
  const bodyHtml = personalize(job.bodyHtml);
  const subject = personalize(job.subject);
  const preheader = personalize(job.preheader || '');
  const preheaderHtml = preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeHtmlForBroadcast(preheader)}</div>` : '';
  const unsubLine = `<p style="color:#9ca3af;font-size:12px;margin-top:24px;text-align:center;">You're receiving this because you have an account or have engaged with Disciplined Disciples. Reply to this email if you'd prefer not to hear from us.</p>`;

  let header = '';
  let inner = '';
  let footer = `<div style="background:#1a202c;color:#cbd5e1;padding:18px;text-align:center;font-size:12px;">${SENDER_EMAIL} &middot; ${SUPPORT_PHONE} &middot; ${SITE_URL}</div>`;

  if (job.templateKey === 'announcement') {
    header = `<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:32px;text-align:center;"><h1 style="margin:0;font-size:24px;">${escapeHtmlForBroadcast(subject)}</h1></div>`;
    inner = `<div style="padding:30px;background:#f8f9fa;"><div style="color:#1f2937;font-size:16px;line-height:1.7;">${bodyHtml}</div>${FOUNDER_SIGNATURE}${unsubLine}</div>`;
  } else if (job.templateKey === 'promotion') {
    const ctaLabel = escapeHtmlForBroadcast(job.cta?.label || 'Shop now');
    const ctaUrl = job.cta?.url || SITE_URL;
    header = `<div style="background:#111827;color:white;padding:32px;text-align:center;"><h1 style="margin:0;font-size:24px;letter-spacing:0.5px;">${escapeHtmlForBroadcast(subject)}</h1></div>`;
    inner = `<div style="padding:30px;background:#ffffff;"><div style="color:#1f2937;font-size:16px;line-height:1.7;">${bodyHtml}</div><div style="text-align:center;margin:30px 0 10px;"><a href="${escapeHtmlForBroadcast(ctaUrl)}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:600;font-size:15px;">${ctaLabel}</a></div>${unsubLine}</div>`;
  } else if (job.templateKey === 'newsletter') {
    header = `<div style="background:#ffffff;border-bottom:3px solid #4f46e5;padding:24px 32px;"><p style="margin:0;color:#6b7280;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Disciplined Disciples Newsletter</p><h1 style="margin:6px 0 0;color:#111827;font-size:22px;">${escapeHtmlForBroadcast(subject)}</h1></div>`;
    inner = `<div style="padding:30px;background:#ffffff;"><div style="color:#1f2937;font-size:15px;line-height:1.7;">${bodyHtml}</div>${FOUNDER_SIGNATURE}${unsubLine}</div>`;
  } else {
    // plain
    inner = `<div style="padding:24px;background:#ffffff;color:#1f2937;font-size:15px;line-height:1.7;">${bodyHtml}${unsubLine}</div>`;
  }

  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#ffffff;">${preheaderHtml}${header}${inner}${footer}</div>`;
  return { subject, html };
}

exports.onBroadcastJobCreated = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .firestore
  .document('broadcastJobs/{jobId}')
  .onCreate(async (snap, context) => {
    const jobId = context.params.jobId;
    const job = snap.data() || {};
    const ref = snap.ref;

    // Authorization: only allow jobs created by an admin email.
    const createdByEmail = String(job?.createdBy?.email || '').toLowerCase();
    if (!BROADCAST_ADMIN_EMAILS.has(createdByEmail)) {
      console.warn(`[broadcast ${jobId}] rejected: createdBy ${createdByEmail} is not an admin`);
      await ref.update({ status: 'failed', error: 'Unauthorized sender', completedAt: admin.firestore.FieldValue.serverTimestamp() });
      return null;
    }

    const recipients = Array.isArray(job.recipients) ? job.recipients.filter(r => r && r.email) : [];
    if (!recipients.length) {
      await ref.update({ status: 'failed', error: 'No recipients', completedAt: admin.firestore.FieldValue.serverTimestamp() });
      return null;
    }

    await ref.update({ status: 'processing', startedAt: admin.firestore.FieldValue.serverTimestamp() });

    let sent = 0;
    let failed = 0;
    const failedEmails = [];
    const BATCH = 8;
    const PAUSE_MS = 250;

    for (let i = 0; i < recipients.length; i += BATCH) {
      const slice = recipients.slice(i, i + BATCH);
      await Promise.all(slice.map(async (r) => {
        try {
          const { subject, html } = renderBroadcastEmail(job, r);
          await sendMailReliable({ to: r.email, subject, html }, { type: 'broadcast', userId: r.uid || null, orderId: jobId });
          sent += 1;
        } catch (err) {
          failed += 1;
          failedEmails.push(r.email);
          console.error(`[broadcast ${jobId}] send failed for ${r.email}:`, err.message);
        }
      }));
      // Progress checkpoint every batch.
      try {
        await ref.update({ sent, failed, failedEmails: failedEmails.slice(0, 100), progressUpdatedAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch (e) {
        console.error(`[broadcast ${jobId}] progress update failed:`, e.message);
      }
      if (i + BATCH < recipients.length) {
        await new Promise(res => setTimeout(res, PAUSE_MS));
      }
    }

    await ref.update({
      status: failed > 0 && sent === 0 ? 'failed' : 'completed',
      sent,
      failed,
      failedEmails: failedEmails.slice(0, 200),
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[broadcast ${jobId}] done: sent=${sent} failed=${failed} total=${recipients.length}`);
    return null;
  });

// =====================================================================
// DAILY OWNER DIGEST  (D2)
// Runs every morning at 07:00 Africa/Johannesburg (SAST).
// Emails Zolile a single-page snapshot of yesterday so she can see the
// state of the business without opening the admin panel.
// =====================================================================
function formatRandRange(amount) {
  const n = Number(amount || 0);
  return 'R' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtmlDigest(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchYesterdayDigestData() {
  const db = admin.firestore();
  // SAST window: previous day 00:00 to 23:59:59 in Africa/Johannesburg.
  // Africa/Johannesburg is UTC+2 (no DST).
  const nowSastMs = Date.now() + 2 * 60 * 60 * 1000;
  const nowSast = new Date(nowSastMs);
  const yStart = new Date(Date.UTC(nowSast.getUTCFullYear(), nowSast.getUTCMonth(), nowSast.getUTCDate() - 1, 0, 0, 0));
  const yEnd = new Date(yStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  // Convert back to actual UTC instants for Firestore comparisons.
  const startUtc = new Date(yStart.getTime() - 2 * 60 * 60 * 1000);
  const endUtc = new Date(yEnd.getTime() - 2 * 60 * 60 * 1000);

  const ordersRef = db.collection('artifacts').doc('default-app-id').collection('orders');
  const supportRef = db.collection('artifacts').doc('default-app-id').collection('support-requests');
  const messagesRef = db.collection('contactMessages');
  const mentorshipRef = db.collection('mentorshipApplications');

  // Pull recent docs; we filter client-side to handle missing/varied timestamp fields.
  // Orders are stamped with orderDate (not createdAt) by checkout.
  const [ordersSnap, supportSnap, msgsSnap, mentorshipSnap] = await Promise.all([
    ordersRef.orderBy('orderDate', 'desc').limit(300).get().catch(() => ({ docs: [] })),
    supportRef.orderBy('createdAt', 'desc').limit(50).get().catch(() => ({ docs: [] })),
    messagesRef.orderBy('createdAt', 'desc').limit(50).get().catch(() => ({ docs: [] })),
    mentorshipRef.orderBy('createdAt', 'desc').limit(50).get().catch(() => ({ docs: [] }))
  ]);

  const toDate = (raw) => {
    if (!raw) return null;
    if (raw.toDate) try { return raw.toDate(); } catch (e) { return null; }
    if (raw._seconds) return new Date(raw._seconds * 1000);
    if (typeof raw === 'string' || typeof raw === 'number') {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const inWindow = (d) => d && d >= startUtc && d <= endUtc;

  const yesterdayOrders = [];
  let lifetimeRevenuePaid = 0;
  let yesterdayPaidRevenue = 0;
  let yesterdayPaidCount = 0;

  let paymentsUnderReview = 0;
  ordersSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const created = toDate(data.orderDate || data.createdAt);
    const status = (data.paymentStatus || data.status || '').toLowerCase();
    const total = Number(data.totalAmount || data.total || 0);
    if (isPaidStatus(status)) lifetimeRevenuePaid += total;
    if (status === 'under review') paymentsUnderReview += 1;
    if (inWindow(created)) {
      yesterdayOrders.push({
        id: doc.id,
        total,
        status: data.status || 'unknown',
        paymentStatus: data.paymentStatus || 'pending',
        customer: data.customerName || data.shippingAddress?.fullName || data.customerEmail || data.userEmail || 'Customer',
        email: data.customerEmail || data.userEmail || data.shippingAddress?.email || ''
      });
      if (isPaidStatus(status)) {
        yesterdayPaidRevenue += total;
        yesterdayPaidCount += 1;
      }
    }
  });

  const newSupport = supportSnap.docs.filter((d) => inWindow(toDate(d.data()?.createdAt)));
  const newMessages = msgsSnap.docs.filter((d) => inWindow(toDate(d.data()?.createdAt)));
  const openMessages = msgsSnap.docs.filter((d) => (d.data()?.status || 'unread') === 'unread');
  const newMentorship = mentorshipSnap.docs.filter((d) => inWindow(toDate(d.data()?.createdAt)));

  return {
    windowStartSast: yStart,
    windowEndSast: yEnd,
    yesterdayOrders,
    yesterdayPaidRevenue,
    yesterdayPaidCount,
    lifetimeRevenuePaid,
    paymentsUnderReview,
    newSupportCount: newSupport.length,
    newMessagesCount: newMessages.length,
    openMessagesCount: openMessages.length,
    newMentorshipCount: newMentorship.length,
    newMentorship: newMentorship.slice(0, 5).map((d) => {
      const data = d.data() || {};
      return {
        name: data.fullName || data.name || 'Applicant',
        focus: data.focus || data.goal || data.message || ''
      };
    })
  };
}

function renderDigestHtml(data) {
  const dateLabel = data.windowStartSast.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const orderRows = data.yesterdayOrders.length
    ? data.yesterdayOrders.slice(0, 10).map((o) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px;color:#475569;">${escapeHtmlDigest(o.id.slice(-10))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#1e293b;">${escapeHtmlDigest(o.customer)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;">${formatRandRange(o.total)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#475569;text-transform:capitalize;">${escapeHtmlDigest(o.status)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;color:${isPaidStatus(o.paymentStatus) ? '#059669' : '#dc2626'};text-transform:capitalize;">${escapeHtmlDigest(o.paymentStatus)}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" style="padding:14px;text-align:center;color:#94a3b8;font-size:13px;">No new orders yesterday.</td></tr>`;

  const mentorshipList = data.newMentorship.length
    ? '<ul style="margin:8px 0 0;padding-left:18px;color:#334155;font-size:13px;">' +
        data.newMentorship.map((m) => `<li style="margin:4px 0;"><strong>${escapeHtmlDigest(m.name)}</strong>${m.focus ? ' &mdash; ' + escapeHtmlDigest(m.focus).slice(0, 120) : ''}</li>`).join('') +
      '</ul>'
    : '';

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,0.06);">
      <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:24px 28px;color:#ffffff;">
        <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Daily Digest &middot; ${dateLabel}</p>
        <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Good morning, Zolile</h1>
        <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">Here is what happened in the store yesterday.</p>
      </div>

      <div style="padding:24px 28px;">
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;">
          <div style="flex:1;min-width:160px;background:#eef2ff;border-radius:10px;padding:14px 16px;">
            <p style="margin:0;font-size:12px;color:#4f46e5;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Paid revenue</p>
            <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#1e1b4b;">${formatRandRange(data.yesterdayPaidRevenue)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6366f1;">${data.yesterdayPaidCount} paid order${data.yesterdayPaidCount === 1 ? '' : 's'}</p>
          </div>
          <div style="flex:1;min-width:160px;background:#ecfeff;border-radius:10px;padding:14px 16px;">
            <p style="margin:0;font-size:12px;color:#0e7490;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">New orders</p>
            <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#083344;">${data.yesterdayOrders.length}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#0891b2;">includes pending &amp; cancelled</p>
          </div>
          <div style="flex:1;min-width:160px;background:#fef3c7;border-radius:10px;padding:14px 16px;">
            <p style="margin:0;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Open messages</p>
            <p style="margin:6px 0 0;font-size:22px;font-weight:700;color:#78350f;">${data.openMessagesCount}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#b45309;">${data.newMessagesCount} new yesterday</p>
          </div>
        </div>

        <h2 style="margin:18px 0 10px;font-size:15px;font-weight:600;color:#0f172a;">Yesterday's orders</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f8fafc;color:#64748b;text-align:left;">
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Order</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Customer</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
              <th style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">Payment</th>
            </tr>
          </thead>
          <tbody>${orderRows}</tbody>
        </table>
        ${data.yesterdayOrders.length > 10 ? `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Showing the first 10 of ${data.yesterdayOrders.length}.</p>` : ''}

        <div style="margin-top:22px;padding:14px 16px;background:#f8fafc;border-radius:10px;border-left:4px solid #4f46e5;">
          <p style="margin:0;font-size:13px;color:#334155;">
            ${data.paymentsUnderReview ? '<strong style="color:#b45309;">Payments needing review:</strong> ' + data.paymentsUnderReview + ' (see Orders in admin).<br>' : ''}
            <strong style="color:#1e1b4b;">Academy applications:</strong> ${data.newMentorshipCount} new yesterday.
            ${data.newSupportCount ? '<br><strong style="color:#1e1b4b;">Support requests:</strong> ' + data.newSupportCount + ' new yesterday.' : ''}
          </p>
          ${mentorshipList}
        </div>

        <div style="margin-top:24px;text-align:center;">
          <a href="${SITE_URL}/admin-dashboard.html" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px;">Open Admin Dashboard</a>
        </div>

        <p style="margin:24px 0 0;text-align:center;font-size:11px;color:#94a3b8;">
          Lifetime paid revenue (all time): <strong style="color:#475569;">${formatRandRange(data.lifetimeRevenuePaid)}</strong>
        </p>
      </div>
    </div>
  </div>`;
}

exports.dailyOwnerDigest = functions
  .runWith({ memory: '256MB', timeoutSeconds: 120 })
  .pubsub.schedule('0 7 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async (context) => {
    try {
      const data = await fetchYesterdayDigestData();
      const dateLabel = data.windowStartSast.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
      const subject = `Daily digest \u00B7 ${dateLabel} \u00B7 ${formatRandRange(data.yesterdayPaidRevenue)} paid \u00B7 ${data.yesterdayOrders.length} orders`;
      const html = renderDigestHtml(data);
      const text = `Good morning, Zolile.\n\nYesterday: ${formatRandRange(data.yesterdayPaidRevenue)} paid revenue across ${data.yesterdayPaidCount} paid orders (${data.yesterdayOrders.length} total).\nOpen messages: ${data.openMessagesCount} (${data.newMessagesCount} new).\nNew Academy applications: ${data.newMentorshipCount}.${data.paymentsUnderReview ? `\nPayments needing review: ${data.paymentsUnderReview}.` : ''}\n\nOpen the dashboard: ${SITE_URL}/admin-dashboard.html`;
      await sendMailReliable({
        to: OWNER_EMAIL,
        subject,
        text,
        html
      }, { type: 'daily_digest' });
      console.log('[dailyOwnerDigest] sent to', OWNER_EMAIL);
    } catch (err) {
      console.error('[dailyOwnerDigest] failed:', err);
    }
    return null;
  });


// =====================================================================
// COMMUNICATIONS INBOX  (D3)
// Unified `inboxThreads/{threadId}` document store. Every customer-initiated
// touchpoint (contact form, mentorship, collaboration, community story) is
// mirrored into a thread so Zolile sees everything in one place.
// =====================================================================

const INBOX_THREADS = 'inboxThreads';
const INBOX_SOURCES = {
  CONTACT: 'contact',
  MENTORSHIP: 'mentorship',
  COLLABORATION: 'collaboration',
  COMMUNITY: 'community',
  SPEAKING: 'speaking',
  CHAPTER: 'chapter'
};

function shortSummary(text, max = 220) {
  const s = (text || '').toString().replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '\u2026';
}

async function createInboxThread({
  source,
  sourceDocPath,
  sourceDocId,
  participantName,
  participantEmail,
  participantPhone,
  subject,
  body,
  metadata
}) {
  const db = admin.firestore();
  const threadId = `${source}_${sourceDocId || db.collection('_').doc().id}`;
  const ref = db.collection(INBOX_THREADS).doc(threadId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const summary = shortSummary(body || subject || '');
  try {
    await ref.set({
      source,
      sourceDocPath: sourceDocPath || null,
      sourceDocId: sourceDocId || null,
      participantName: (participantName || 'Unknown').toString().slice(0, 140),
      participantEmail: (participantEmail || '').toString().toLowerCase().slice(0, 200),
      participantPhone: (participantPhone || '').toString().slice(0, 40),
      subject: (subject || '(no subject)').toString().slice(0, 200),
      summary,
      status: 'open',
      unread: true,
      messageCount: 1,
      metadata: metadata || {},
      createdAt: now,
      lastActivityAt: now,
      lastInboundAt: now
    }, { merge: false });
    await ref.collection('messages').add({
      direction: 'inbound',
      authorName: participantName || 'Unknown',
      authorEmail: participantEmail || '',
      body: (body || '').toString(),
      createdAt: now
    });
    console.log(`[inbox] thread created ${threadId} (source=${source})`);
  } catch (err) {
    console.error('[inbox] failed to create thread:', err);
  }
  return threadId;
}

exports.onContactMessageCreatedInbox = withSecrets.firestore
  .document('contactMessages/{messageId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    await createInboxThread({
      source: INBOX_SOURCES.CONTACT,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.messageId,
      participantName: data.name,
      participantEmail: data.email,
      participantPhone: data.phone,
      subject: data.subject || 'Contact form submission',
      body: data.message,
      metadata: { ip: data.ip || null, source: 'contact_form' }
    });
    return null;
  });

exports.onCollaborationLeadCreatedInbox = withSecrets.firestore
  .document('collaborationLeads/{leadId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    await createInboxThread({
      source: INBOX_SOURCES.COLLABORATION,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.leadId,
      participantName: data.contactName || data.name || data.brand || 'Partner',
      participantEmail: data.email,
      participantPhone: data.phone,
      subject: data.brand ? `Collaboration \u2014 ${data.brand}` : 'New collaboration lead',
      body: data.message || data.notes || data.proposal || '',
      metadata: { brand: data.brand || null, status: data.status || 'new' }
    });
    return null;
  });

exports.onCommunityStoryCreatedInbox = withSecrets.firestore
  .document('communityStories/{storyId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    // Only create a thread when the story is submitted (not when an admin
    // creates an already-approved feature themselves).
    if (data.approved === true && !data.submittedByPublic) return null;
    await createInboxThread({
      source: INBOX_SOURCES.COMMUNITY,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.storyId,
      participantName: data.name,
      participantEmail: data.email,
      subject: data.title ? `Story \u2014 ${data.title}` : 'New community story',
      body: data.story || data.message || data.body || '',
      metadata: { approved: data.approved === true }
    });
    return null;
  });

exports.onMentorshipApplicationInbox = withSecrets.firestore
  .document('mentorshipApplications/{applicationId}')
  .onCreate(async (snap, context) => {
    const data = snap.data() || {};
    await createInboxThread({
      source: INBOX_SOURCES.MENTORSHIP,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.applicationId,
      participantName: data.name,
      participantEmail: data.email,
      participantPhone: data.phone,
      subject: `Academy \u2014 ${data.packageName || ACADEMY_PACKAGE_NAMES[data.package] || data.track || 'application'}`,
      body: data.goal || data.message || '',
      metadata: { track: data.track || null, package: data.package || null }
    });
    return null;
  });

// Admin reply: sends email from the LOCKED Founder identity, then appends
// the outbound message to the thread.
exports.replyToInboxThread = withSecrets.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }
  const callerEmail = (context.auth.token.email || '').toLowerCase();
  if (callerEmail !== 'zmabege@gmail.com' && callerEmail !== 'nomaqhizazolile@gmail.com') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only.');
  }
  const threadId = (data && data.threadId || '').toString().trim();
  const body = (data && data.body || '').toString().trim();
  const subjectOverride = (data && data.subject || '').toString().trim();
  if (!threadId) throw new functions.https.HttpsError('invalid-argument', 'threadId required.');
  if (!body || body.length < 2) throw new functions.https.HttpsError('invalid-argument', 'Reply body required.');
  if (body.length > 8000) throw new functions.https.HttpsError('invalid-argument', 'Reply too long (max 8000 chars).');

  const db = admin.firestore();
  const ref = db.collection(INBOX_THREADS).doc(threadId);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Thread not found.');
  const thread = snap.data();
  const to = (thread.participantEmail || '').toString().trim();
  if (!to) throw new functions.https.HttpsError('failed-precondition', 'Thread has no email address.');

  const subject = subjectOverride || `Re: ${thread.subject || 'Your message'}`;
  const safeBody = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
      <p style="font-size:15px;line-height:1.65;">${safeBody}</p>
      ${FOUNDER_SIGNATURE}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="font-size:11px;color:#9ca3af;text-align:center;">You are receiving this reply because you contacted Disciplined Disciples. WhatsApp: ${SUPPORT_PHONE}</p>
    </div>`;

  await sendMailReliable({
    to,
    subject,
    text: body,
    html
  }, { type: 'inbox_reply', threadId });

  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.collection('messages').add({
    direction: 'outbound',
    authorName: 'Zolile Nomaqhiza',
    authorEmail: SENDER_EMAIL,
    body,
    sentByUid: context.auth.uid,
    sentByEmail: callerEmail,
    createdAt: now
  });
  await ref.update({
    status: 'replied',
    unread: false,
    lastActivityAt: now,
    lastOutboundAt: now,
    messageCount: admin.firestore.FieldValue.increment(1),
    repliedBy: callerEmail
  });

  return { ok: true, threadId };
});

// =====================================================================
// SPEAKING ENQUIRIES
// Public form on speaking.html -> speakingEnquiries/{id}. Mirrored into the
// inbox, the owner is alerted, and the organiser gets an acknowledgement.
// =====================================================================
exports.onSpeakingEnquiryCreated = withSecrets.firestore
  .document('speakingEnquiries/{enquiryId}')
  .onCreate(async (snap, context) => {
    const d = snap.data() || {};
    const esc = escapeHtmlForBroadcast;
    const org = d.organisation || d.name || 'Organiser';
    const details = [
      ['Organisation', d.organisation],
      ['Contact', d.name],
      ['Email', d.email],
      ['Phone', d.phone],
      ['Event date', d.eventDate],
      ['Event type', d.eventType],
      ['Format', d.format],
      ['Location', d.location],
      ['Audience size', d.audienceSize],
      ['Topic', d.topic],
      ['Budget', d.budget]
    ].filter(([, v]) => v);
    const bodyText = details.map(([k, v]) => `${k}: ${v}`).join('\n') + (d.message ? `\n\n${d.message}` : '');

    await createInboxThread({
      source: INBOX_SOURCES.SPEAKING,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.enquiryId,
      participantName: d.name || org,
      participantEmail: d.email,
      participantPhone: d.phone,
      subject: `Speaking — ${org}${d.eventDate ? ' · ' + d.eventDate : ''}`,
      body: bodyText,
      metadata: {
        organisation: d.organisation || null,
        eventDate: d.eventDate || null,
        eventType: d.eventType || null,
        audienceSize: d.audienceSize || null,
        topic: d.topic || null
      }
    });

    try {
      await sendMailReliable({
        to: OWNER_EMAIL,
        subject: `\u{1F3A4} Speaking enquiry — ${org}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;">
            <h2 style="color:#1a202c;">New speaking enquiry</h2>
            <table style="font-size:14px;border-collapse:collapse;">
              ${details.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;color:#0f172a;">${esc(v)}</td></tr>`).join('')}
            </table>
            ${d.message ? `<div style="margin-top:14px;padding:12px;background:#f8fafc;border-left:4px solid #4f46e5;color:#334155;white-space:pre-wrap;">${esc(d.message)}</div>` : ''}
            <p style="margin-top:18px;"><a href="${SITE_URL}/admin-communications.html" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Reply from the inbox</a></p>
          </div>`
      }, { type: 'speaking_enquiry' });
    } catch (e) {
      console.error('[speaking] owner email failed:', e.message);
    }

    if (d.email) {
      try {
        await sendMailReliable({
          to: d.email,
          subject: 'Thank you for inviting Zolile to speak',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
              <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:28px;text-align:center;border-radius:8px 8px 0 0;">
                <h1 style="margin:0;font-size:22px;">Enquiry received ✓</h1>
              </div>
              <div style="padding:26px;background:white;">
                <p style="color:#1a202c;font-weight:600;">Hi ${esc((d.name || 'there').split(' ')[0])},</p>
                <p style="color:#4a5568;line-height:1.7;">Thank you for thinking of me for ${esc(d.organisation || 'your event')}${d.eventDate ? ' on ' + esc(d.eventDate) : ''}. I read every invitation personally and will come back to you within 3 business days to talk about your audience and what would serve them best.</p>
                ${FOUNDER_SIGNATURE}
              </div>
            </div>`
        }, { type: 'speaking_ack' });
      } catch (e) {
        console.error('[speaking] acknowledgement email failed:', e.message);
      }
    }
    return null;
  });

// Free Chapter 1 requests from the homepage land in the inbox so Zolile can
// reply with the chapter straight from admin.
exports.onChapterLeadCreated = withSecrets.firestore
  .document('chapterLeads/{leadId}')
  .onCreate(async (snap, context) => {
    const d = snap.data() || {};
    await createInboxThread({
      source: INBOX_SOURCES.CHAPTER,
      sourceDocPath: snap.ref.path,
      sourceDocId: context.params.leadId,
      participantName: d.email || 'Reader',
      participantEmail: d.email,
      subject: 'Free Chapter 1 request',
      body: `${d.email || 'A reader'} asked for Chapter 1 of Relentlessly Disciplined (${d.source || 'website'}).`,
      metadata: { source: d.source || null }
    });
    return null;
  });

// =====================================================================
// 30-DAY JOURNAL
// =====================================================================

// Called by journal.html when a signed-in user has no access record yet.
// Unlocks existing Academy mentees and journal buyers automatically, so nobody
// who already paid has to ask for access.
exports.claimJournalAccess = withSecrets.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Please sign in.');
  }
  const uid = context.auth.uid;
  const email = (context.auth.token.email || '').toString().trim().toLowerCase();
  const db = admin.firestore();

  const accessSnap = await db.collection('journalAccess').doc(uid).get();
  if (accessSnap.exists && accessSnap.data()?.granted === true) {
    return { granted: true, source: 'existing' };
  }

  // 1) Paid Academy (mentorship) applications, matched by account or email.
  const appQueries = [db.collection('mentorshipApplications').where('userId', '==', uid).get()];
  if (email) appQueries.push(db.collection('mentorshipApplications').where('email', '==', email).get());
  const appSnaps = await Promise.all(appQueries);
  for (const snap of appSnaps) {
    for (const doc of snap.docs) {
      const app = doc.data() || {};
      const paidAmount = Number(app.amountPaid || app.amount || 0);
      if (isPaidStatus(app.paymentStatus) && paidAmount > 0) {
        await grantJournalAccess(uid, 'academy', doc.id);
        return { granted: true, source: 'academy' };
      }
    }
  }

  // 2) Paid orders that include the journal.
  const ordersSnap = await db.collection('artifacts').doc('default-app-id').collection('orders')
    .where('userId', '==', uid).get();
  for (const doc of ordersSnap.docs) {
    const order = doc.data() || {};
    if (isPaidStatus(order.paymentStatus) && orderContainsJournal(order)) {
      await grantJournalAccess(uid, 'order', doc.id);
      return { granted: true, source: 'order' };
    }
  }

  return { granted: false };
});

const JOURNAL_DAY_THEMES = [
  ['Vision', 'Write the future you are willing to work for.'],
  ['Why', 'What makes this season of discipline worth the cost?'],
  ['Control', 'Separate what is within your control from what is not. Act on what is yours.'],
  ['Environment', 'What in your environment makes discipline harder? What can you change?'],
  ['Minimum', "What is the smallest version of today's practice that still counts?"],
  ['Identity', 'Who are you becoming through what you repeatedly do?'],
  ['Review', 'What did the first week teach you about yourself?'],
  ['Attention', 'What repeatedly captures your attention when you intended to focus?'],
  ['Meditation', 'Practise stillness. What became visible when the noise reduced?'],
  ['Exercise', 'Treat movement as stewardship rather than comparison.'],
  ['Reading', 'What idea challenged or expanded your current thinking?'],
  ['Writing', 'What does honest writing reveal about the direction of your life?'],
  ['Research', 'Before searching for an answer, define the problem and the question.'],
  ['Depth', 'Where are you tempted to accept a quick answer without sufficient context?'],
  ['Community', 'Who helps you remain accountable to what you said you would do?'],
  ['Setback', 'What recent failure can become information rather than identity?'],
  ['Return', 'If you missed yesterday, what does returning today look like?'],
  ['Devotion', 'Ask: why am I doing this, and for whom?'],
  ['Discipline', 'Where are you relying on motivation when you could design a better system?'],
  ['Focus', 'What deserves your deepest attention today?'],
  ['Courage', 'What difficult task are you avoiding that would move your work forward?'],
  ['Patience', 'What result are you demanding too quickly?'],
  ['Marginal gains', 'What small improvement can compound if repeated?'],
  ['Consistency', 'What does an ordinary, faithful day look like?'],
  ['Professional formation', 'What kind of professional are your current habits forming?'],
  ['Service', 'How will your development eventually benefit people beyond yourself?'],
  ['Legacy', "What are you building that could outlast today's exam or season?"],
  ['AI era', 'What human capacities do you need to deepen rather than outsource?'],
  ['Recommitment', 'What are you choosing to continue after these 30 days?'],
  ['Manifesto', 'Write the commitments you intend to carry into the next season.']
];

// YYYY-MM-DD in South African time (UTC+2, no DST).
function sastDateKey(date) {
  const d = new Date(date.getTime() + 2 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function journalDayNumber(startDateKey, todayKey) {
  const start = Date.parse(`${startDateKey}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(today)) return null;
  return Math.floor((today - start) / 86400000) + 1;
}

const JOURNAL_REMINDER_DAILY_CAP = 250; // keeps Gmail quota free for order emails
const JOURNAL_FREE_DAYS = 3;

exports.journalDailyReminder = functions
  .runWith({ secrets: ['EMAIL_PASSWORD'], timeoutSeconds: 300, memory: '256MB' })
  .pubsub.schedule('30 18 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    const db = admin.firestore();
    const today = sastDateKey(new Date());
    const snap = await db.collection('journals').where('reminders.enabled', '==', true).limit(2000).get();
    let sent = 0;
    let skipped = 0;
    for (const doc of snap.docs) {
      if (sent >= JOURNAL_REMINDER_DAILY_CAP) break;
      const journal = doc.data() || {};
      const uid = doc.id;
      if (!journal.startDate || journal.lastEntryDate === today) { skipped++; continue; }
      const dayNo = journalDayNumber(journal.startDate, today);
      if (!dayNo || dayNo < 1 || dayNo > 30) { skipped++; continue; }

      const accessSnap = await db.collection('journalAccess').doc(uid).get();
      const hasAccess = accessSnap.exists && accessSnap.data()?.granted === true;
      if (!hasAccess && dayNo > JOURNAL_FREE_DAYS) { skipped++; continue; }

      let user = null;
      try { user = await admin.auth().getUser(uid); } catch (e) { user = null; }
      if (!user || !user.email) { skipped++; continue; }

      const [theme, prompt] = JOURNAL_DAY_THEMES[dayNo - 1];
      const firstName = (user.displayName || user.email.split('@')[0] || 'friend').split(' ')[0];
      const unsubscribeUrl = `https://us-central1-disciplined-disciples-1.cloudfunctions.net/journalReminderUnsubscribe?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(journal.reminders?.token || '')}`;
      const missedYesterday = journal.lastEntryDate && journalDayNumber(journal.lastEntryDate, today) > 2;
      try {
        await sendMailReliable({
          to: user.email,
          subject: `Day ${dayNo} · ${theme} — your journal is waiting`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;">
              <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:26px;text-align:center;">
                <p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">30-Day Discipline Journal</p>
                <h1 style="margin:8px 0 0;font-size:24px;">Day ${dayNo} · ${escapeHtmlForBroadcast(theme)}</h1>
              </div>
              <div style="padding:26px;background:#f8f9fa;">
                <p style="color:#1f2937;font-size:16px;">Hi ${escapeHtmlForBroadcast(firstName)},</p>
                <p style="color:#4b5563;line-height:1.7;font-style:italic;">“${escapeHtmlForBroadcast(prompt)}”</p>
                <p style="color:#4b5563;line-height:1.7;">${missedYesterday
                  ? 'Missed a few days? Return, don’t retreat. The smallest entry still counts.'
                  : 'Five minutes is enough. Keep the commitment small enough to survive a difficult day.'}</p>
                <p style="text-align:center;margin:26px 0;">
                  <a href="${SITE_URL}/journal.html" style="background:#7c3aed;color:white;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Write today’s entry</a>
                </p>
                <p style="color:#9ca3af;font-size:12px;text-align:center;">You asked for a daily reminder. <a href="${unsubscribeUrl}" style="color:#9ca3af;">Turn off journal reminders</a></p>
              </div>
            </div>`
        }, { type: 'journal_reminder', userId: uid });
        sent++;
      } catch (e) {
        console.error(`[journal reminder] failed for ${uid}:`, e.message);
      }
    }
    console.log(`[journalDailyReminder] sent=${sent} skipped=${skipped} candidates=${snap.size}`);
    return null;
  });

// One-click opt-out link from reminder emails (POPIA: opting out must be easy).
exports.journalReminderUnsubscribe = functions.https.onRequest(async (req, res) => {
  const uid = (req.query.u || '').toString();
  const token = (req.query.t || '').toString();
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Arial,sans-serif;background:#f8f8f8;margin:0;padding:48px 16px;"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 10px 25px rgba(15,23,42,0.06);"><h1 style="font-size:22px;color:#222;margin:0 0 12px;">${title}</h1><p style="color:#4b5563;line-height:1.6;">${body}</p><p><a href="${SITE_URL}/journal.html" style="color:#4f46e5;font-weight:600;">Back to my journal</a></p></div></body></html>`;
  if (!uid || !token) {
    res.status(400).send(page('Link incomplete', 'This unsubscribe link is missing information. You can turn reminders off in your journal settings.'));
    return;
  }
  try {
    const ref = admin.firestore().collection('journals').doc(uid);
    const snap = await ref.get();
    if (!snap.exists || (snap.data()?.reminders?.token || '') !== token) {
      res.status(400).send(page('Link not recognised', 'We could not match this link. You can turn reminders off in your journal settings.'));
      return;
    }
    await ref.set({ reminders: { enabled: false, unsubscribedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    res.status(200).send(page('Reminders turned off', 'You will not receive daily journal reminders any more. Your journal and entries are untouched, and you can switch reminders back on in your journal settings at any time.'));
  } catch (e) {
    console.error('[journal unsubscribe] failed:', e.message);
    res.status(500).send(page('Something went wrong', 'Please try again, or turn reminders off in your journal settings.'));
  }
});

// Expired eBook links: drop their tokens from the file so the URLs stop working.
exports.cleanupEbookDownloadTokens = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const expired = await db.collection(EBOOK_TOKENS).where('expiresAt', '<=', now).limit(400).get();
    let file = null;
    try {
      file = await resolveEbookFile();
    } catch (e) {
      console.warn('[ebook tokens] no ebook file found:', e.message);
    }
    if (file) {
      const [metadata] = await file.getMetadata();
      const current = (metadata?.metadata?.firebaseStorageDownloadTokens || '').split(',').filter(Boolean);
      const active = await activeEbookTokens(file.name);
      const stale = current.filter((t) => !active.includes(t));
      if (stale.length) {
        await writeEbookTokens(file, active);
        console.log(`[ebook tokens] removed ${stale.length} expired/legacy token(s)`);
      }
    }
    if (!expired.empty) {
      const batch = db.batch();
      expired.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    return null;
  });
