const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { Storage } = require('@google-cloud/storage');
const crypto = require('crypto');
const querystring = require('querystring');

admin.initializeApp();

// Email configuration
const emailConfig = functions.config().email || {};
const SENDER_EMAIL = emailConfig.user || 'nomaqhizazolile@gmail.com';
const OWNER_EMAIL = emailConfig.owner || SENDER_EMAIL;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SENDER_EMAIL,
    pass: emailConfig.password // Set this in Firebase Functions config
  }
});

// Cloud Storage for storing invoices
const storage = new Storage();
const bucket = storage.bucket('disciplined-disciples-1.appspot.com');

// Generate Invoice PDF
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

        // Header
        doc.fontSize(20).text('DISCIPLINED DISCIPLES', 50, 50);
        doc.fontSize(10)
           .text('Premium South African Streetwear', 50, 75)
           .text(`Email: ${SENDER_EMAIL}`, 50, 90)
           .text('Phone: +27 69 206 0618', 50, 105)
           .text('Johannesburg, South Africa', 50, 120);

        // Invoice Title
        doc.fontSize(24).text('INVOICE', 400, 50);
        
        // Invoice Details
        doc.fontSize(12)
        .text(`Invoice #: ${safeOrderId.substring(0, 12)}`, 400, 80)
        .text(`Date: ${orderDateValue.toLocaleDateString('en-ZA')}`, 400, 100)
        .text(`Status: ${order.status || 'Order Placed'}`, 400, 120);

        // Customer Details
        doc.fontSize(14).text('Bill To:', 50, 160);
        doc.fontSize(12)
           .text(userProfile.name || 'Customer', 50, 180)
           .text(userProfile.email, 50, 195);

        if (order.deliveryAddress) {
            doc.text(order.deliveryAddress.line1 || '', 50, 210);
            if (order.deliveryAddress.line2) {
                doc.text(order.deliveryAddress.line2, 50, 225);
            }
            doc.text(`${order.deliveryAddress.city || ''}, ${order.deliveryAddress.province || ''} ${order.deliveryAddress.postalCode || ''}`, 50, 240);
        }

        // Items Table
        let yPosition = 280;
        doc.fontSize(12).text('Item', 50, yPosition);
        doc.text('Size', 200, yPosition);
        doc.text('Color', 250, yPosition);
        doc.text('Qty', 300, yPosition);
        doc.text('Price', 350, yPosition);
        doc.text('Total', 450, yPosition);

        // Draw line
        doc.moveTo(50, yPosition + 15).lineTo(550, yPosition + 15).stroke();

        yPosition += 25;

    items.forEach(item => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      doc.text(item.name || 'Item', 50, yPosition);
      doc.text(item.size || 'N/A', 200, yPosition);
      doc.text(item.color || 'N/A', 250, yPosition);
      doc.text(quantity.toString(), 300, yPosition);
      doc.text(`R${price.toFixed(2)}`, 350, yPosition);
      doc.text(`R${(price * quantity).toFixed(2)}`, 450, yPosition);
            yPosition += 20;
        });

        // Totals
        yPosition += 20;
    const subtotal = items.reduce((sum, item) => {
      const price = Number(item.price) || 0;
      const quantity = Number(item.quantity) || 1;
      return sum + price * quantity;
    }, 0);
    const vat = subtotal * 0.15;
    const shipping = Number(order.shipping || order.shippingFee || order.shippingCost || 0);
        const total = subtotal + vat + shipping;

        doc.text('Subtotal:', 350, yPosition);
        doc.text(`R${subtotal.toFixed(2)}`, 450, yPosition);
        yPosition += 15;

        doc.text('VAT (15%):', 350, yPosition);
        doc.text(`R${vat.toFixed(2)}`, 450, yPosition);
        yPosition += 15;

        doc.text('Shipping:', 350, yPosition);
        doc.text(`R${shipping.toFixed(2)}`, 450, yPosition);
        yPosition += 15;

        // Draw line
        doc.moveTo(350, yPosition + 5).lineTo(550, yPosition + 5).stroke();
        yPosition += 15;

        doc.fontSize(14).text('Total:', 350, yPosition);
        doc.text(`R${total.toFixed(2)}`, 450, yPosition);

        // Footer
        yPosition += 50;
        doc.fontSize(10)
           .text('Thank you for your business!', 50, yPosition)
           .text(`For support, contact us at ${SENDER_EMAIL}`, 50, yPosition + 15);

        doc.end();
    });
}

async function sendOrderPlacedEmails(orderId, order, docRef) {
    const db = admin.firestore();
    const usersRef = db.collection('artifacts').doc('default-app-id').collection('users');

    const userSnapshot = order.userId ? await usersRef.doc(order.userId).get() : null;
    const userProfile = userSnapshot && userSnapshot.exists ? userSnapshot.data() : {};

    const invoiceBuffer = await generateInvoicePDF(orderId, order, userProfile);
    const trimmedOrderId = orderId.substring(0, 12);
    const fileName = `invoices/${trimmedOrderId}.pdf`;
    const file = bucket.file(fileName);
    await file.save(invoiceBuffer, {
        metadata: {
            contentType: 'application/pdf'
        }
    });

    await file.makePublic();
    const invoiceUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    if (docRef) {
        await docRef.update({ invoiceUrl });
    }

    const orderDateRaw = order && order.orderDate;
    const orderDateValue = orderDateRaw && typeof orderDateRaw.toDate === 'function'
        ? orderDateRaw.toDate()
        : new Date(orderDateRaw || Date.now());
    const orderDateLabel = orderDateValue.toLocaleDateString('en-ZA');
    const customerName = order.customerName || userProfile.name || 'Customer';
    const customerEmail = order.customerEmail || order.email || userProfile.email;
    const statusMessage = order.statusMessage || order.lastCustomerMessage || 'Your order has been confirmed and is being prepared with care!';
    const totalAmount = Number(order.totalAmount) || 0;
    const itemsList = Array.isArray(order.items) ? order.items : [];

    const styledItems = itemsList.map(item => `
        <div style="border-bottom: 1px solid #eee; padding: 10px 0;">
            <p style="margin: 5px 0; font-weight: bold;">${item.name || 'Item'}</p>
            <p style="margin: 5px 0; color: #666;">Size: ${item.size || 'N/A'} | Qty: ${item.quantity || 1}</p>
            <p style="margin: 5px 0; color: #667eea; font-weight: bold;">R${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</p>
        </div>
    `).join('');

    const addressBlock = order.deliveryAddress ? `
        ${order.deliveryAddress.line1 || ''}<br>
        ${order.deliveryAddress.line2 ? order.deliveryAddress.line2 + '<br>' : ''}
        ${order.deliveryAddress.city || ''}, ${order.deliveryAddress.province || ''} ${order.deliveryAddress.postalCode || ''}
    ` : 'Delivery details to be confirmed with our team.';

    const customerEmailOptions = {
        from: SENDER_EMAIL,
        to: customerEmail,
        subject: `Order Confirmation - ${trimmedOrderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">Thank you, ${customerName.split(' ')[0] || 'friend'}! 🎉</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px;">Your Disciplined Disciples order is confirmed.</p>
            </div>
            <div style="padding: 30px; background: #f8f9fa;">
              <h2 style="color: #333; margin-bottom: 10px;">Order ${trimmedOrderId}</h2>
              <p style="color: #555; margin-bottom: 20px; line-height: 1.6;">${statusMessage}</p>
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                <p style="margin: 5px 0; color: #666;">Date: ${orderDateLabel}</p>
                <p style="margin: 5px 0; color: #666;">Total: R${totalAmount.toFixed(2)}</p>
                <p style="margin: 5px 0; color: #666;">Status: ${order.status || 'Order Placed'}</p>
              </div>
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">Items in your parcel</h3>
                ${styledItems}
              </div>
              <div style="background: white; padding: 18px; border-radius: 8px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">Delivering to</h3>
                <p style="color: #666; line-height: 1.6;">${addressBlock}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${invoiceUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Download your invoice</a>
              </div>
              <p style="color: #666; line-height: 1.6;">
                We will share tracking updates as soon as your order is on the move. If you need anything, just reply to this email or contact us at ${SENDER_EMAIL}.
              </p>
            </div>
            <div style="background: #333; color: white; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">Disciplined Disciples - Premium South African Streetwear</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #ccc;">${SENDER_EMAIL} | +27 69 206 0618</p>
            </div>
          </div>
        `,
        attachments: [
            {
                filename: `Invoice-${trimmedOrderId}.pdf`,
                content: invoiceBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const businessEmailOptions = {
        from: SENDER_EMAIL,
        to: OWNER_EMAIL,
        subject: `New Order Received - ${trimmedOrderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">New order confirmed 🎉</h1>
            </div>
            <div style="padding: 20px;">
              <p><strong>Order ID:</strong> ${trimmedOrderId}</p>
              <p><strong>Customer:</strong> ${customerName} (${customerEmail || 'no email'})</p>
              <p><strong>Total:</strong> R${totalAmount.toFixed(2)}</p>
              <p><strong>Date:</strong> ${orderDateLabel}</p>
              <p><strong>Message sent to customer:</strong><br>${statusMessage}</p>
              <h3>Items</h3>
              <ul>
                ${itemsList.map(item => `<li>${item.name || 'Item'} x${item.quantity || 1} - R${((Number(item.price) || 0) * (Number(item.quantity) || 1)).toFixed(2)}</li>`).join('')}
              </ul>
              <h3>Delivery address</h3>
              <p>${addressBlock}</p>
              <p><a href="${invoiceUrl}">Download Invoice</a></p>
            </div>
          </div>
        `,
        attachments: [
            {
                filename: `Invoice-${trimmedOrderId}.pdf`,
                content: invoiceBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const emailPromises = [];
    if (customerEmail) {
        emailPromises.push(transporter.sendMail(customerEmailOptions));
    }
    emailPromises.push(transporter.sendMail(businessEmailOptions));

    await Promise.all(emailPromises);
  console.log(`Order confirmation emails dispatched for ${orderId}`);
}

// Send Order Confirmation Email with Invoice
exports.sendOrderConfirmation = functions.firestore
  .document('artifacts/default-app-id/orders/{orderId}')
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const orderId = context.params.orderId;

    if (!order) {
      return null;
    }

    const paid = (order.paymentStatus || '').toLowerCase() === 'paid';
    const placed = ((order.statusKey || order.status || '')).toLowerCase().includes('order_placed') || (order.status || '').toLowerCase() === 'order placed';

    if (!paid || !placed) {
      console.log(`Skipping confirmation email for order ${orderId} - status ${order.status} payment ${order.paymentStatus}`);
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
exports.sendOrderStatusUpdate = functions.firestore
  .document('artifacts/default-app-id/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const orderId = context.params.orderId;

    // Only send email if status changed
    if (!afterData) {
        return null;
    }

    const statusChanged = (beforeData.status || '') !== (afterData.status || '');
    const messageChanged = (beforeData.statusMessage || '') !== (afterData.statusMessage || '');

    if (!statusChanged && !messageChanged) {
        return null;
    }

    const paid = (afterData.paymentStatus || '').toLowerCase() === 'paid';
    const statusKey = (afterData.statusKey || '').toLowerCase();

    if (statusKey === 'order_placed' && paid) {
        try {
            await sendOrderPlacedEmails(orderId, afterData, change.after.ref);
        } catch (error) {
            console.error('Error sending order placed emails on update:', error);
        }
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
                from: SENDER_EMAIL,
                to: customerEmail,
                subject: `Order Update - ${trimmedOrderId}`,
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
                        <a href="https://disciplined-disciples-1.web.app/profile.html#orders" style="background: ${statusColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View my order</a>
                      </div>
                      <p style="color: #666; line-height: 1.6;">
                        Need a hand? Reply to this email or reach us at ${SENDER_EMAIL}.
                      </p>
                      <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">${SENDER_EMAIL} | +27 69 206 0618</p>
                    </div>
                  </div>
                `
            };

            await transporter.sendMail(customerEmailOptions);
        }

        if (normalizedStatus.includes('delivered')) {
            await transporter.sendMail({
                from: SENDER_EMAIL,
                to: OWNER_EMAIL,
                subject: `Delivery completed - ${trimmedOrderId}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
                    <h2 style="color: #28a745;">Order delivered ✅</h2>
                    <p><strong>Order:</strong> ${trimmedOrderId}</p>
                    <p><strong>Customer:</strong> ${customerName} (${customerEmail || 'no email'})</p>
                    <p><strong>Message shared:</strong> ${statusMessage}</p>
                  </div>
                `
            });
        }

        console.log(`Status update email processed for order ${orderId}`);

    } catch (error) {
        console.error('Error sending status update email:', error);
    }

    return null;
  });

// PayFast Payment Verification
exports.verifyPayfastPayment = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const contentType = (req.get('content-type') || '').toLowerCase();
    let payload = {};

    if (contentType.includes('application/json')) {
      payload = typeof req.body === 'object' && req.body !== null ? req.body : {};
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const rawBody = (req.rawBody || Buffer.from('')).toString('utf8');
      payload = querystring.parse(rawBody);
    } else {
      payload = typeof req.body === 'object' && req.body !== null ? req.body : {};
    }

    const orderId = (payload.orderId || payload.custom_str1 || payload.m_payment_id || '').toString().trim();
    const rawStatus = (payload.paymentStatus || payload.payment_status || payload.status || '').toString().toLowerCase();
    const payfastPaymentId = (payload.paymentId || payload.pf_payment_id || payload.token || '').toString().trim() || null;

    if (!orderId) {
      res.status(400).json({ success: false, message: 'Missing order identifier' });
      return;
    }

    const completeStatuses = ['complete', 'completed', 'success', 'paid'];
    const isComplete = completeStatuses.includes(rawStatus);

    if (!isComplete) {
      console.log(`PayFast webhook for ${orderId} ignored with status ${rawStatus}`);
      res.json({ success: false, message: `Payment status ${rawStatus || 'unknown'} not marked as complete`, orderId });
      return;
    }

    const ordersCollection = admin.firestore().collection('artifacts').doc('default-app-id').collection('orders');
    const orderRef = ordersCollection.doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      res.status(404).json({ success: false, message: `Order ${orderId} not found` });
      return;
    }

    const orderData = orderSnap.data() || {};
    const FieldValue = admin.firestore.FieldValue;
    const existingPaymentStatus = (orderData.paymentStatus || '').toLowerCase();

    if (existingPaymentStatus === 'paid') {
      console.log(`Order ${orderId} already marked as paid. Skipping duplicate update.`);
      res.json({ success: true, message: 'Order already processed', orderId });
      return;
    }

    const customerName = orderData.customerName || orderData.deliveryAddress?.name || 'friend';
    const firstName = customerName.trim().split(' ')[0] || 'friend';
    const statusMessage = `🎉 Thank you, ${firstName}! Your Disciplined Disciples order is officially locked in.`;

    const historyEntry = {
      statusKey: 'order_placed',
      status: 'Order Placed',
      label: 'Order placed',
      message: statusMessage,
      icon: '🎉',
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
      statusIcon: '🎉',
      statusMessage,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusUpdatedBy: 'payfast-webhook',
      lastCustomerMessage: statusMessage,
      paymentStatus: 'Paid',
      paymentGateway: 'PayFast',
      paymentReference: payfastPaymentId || null,
      paymentCompletedAt: FieldValue.serverTimestamp(),
      payfastTxnId: payfastPaymentId || orderData.payfastTxnId || null,
      webhookReceivedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion(historyEntry),
      notes: FieldValue.arrayUnion(statusNote)
    }, { merge: true });

    res.json({ success: true, message: 'Payment verified and order updated', orderId });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Support Request Email
exports.sendSupportRequest = functions.firestore
  .document('artifacts/default-app-id/support-requests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    const requestId = context.params.requestId;

    try {
      // Email to business
      const businessEmailOptions = {
        from: SENDER_EMAIL,
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
        from: SENDER_EMAIL,
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
        transporter.sendMail(businessEmailOptions),
        transporter.sendMail(customerEmailOptions)
      ]);

      console.log(`Support request emails sent for request ${requestId}`);
      
    } catch (error) {
      console.error('Error sending support request emails:', error);
    }
  });