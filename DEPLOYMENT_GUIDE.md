# Disciplined Disciples - Enterprise Profile System Setup Guide

## Overview
This guide will help you deploy the complete enterprise-level profile system with advanced order management, invoice generation, email communications, and PayFast integration.

## Prerequisites
- Firebase CLI installed (`npm install -g firebase-tools`)
- Node.js 18+ installed
- Google Cloud account (for Functions and Storage)
- Gmail account configured for app passwords
- PayFast merchant account

## 1. Firebase Functions Setup

### Install Dependencies
```bash
cd functions
npm install
```

### Configure Environment Variables
```bash
firebase functions:config:set email.password="your-gmail-app-password"
```

### Deploy Functions
```bash
firebase deploy --only functions
```

## 2. Firebase Configuration

### Enable Required Services
1. **Authentication**: Email/Password provider
2. **Firestore**: Native mode
3. **Storage**: Default bucket
4. **Functions**: Blaze plan required

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /artifacts/default-app-id/users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read/write their own orders
    match /artifacts/default-app-id/orders/{orderId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.userId || 
         request.auth.uid == request.resource.data.userId);
    }
    
    // Users can create support requests
    match /artifacts/default-app-id/support-requests/{requestId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

### Storage Security Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /invoices/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3. Email Configuration

### Gmail App Password Setup
1. Enable 2-Factor Authentication on your Gmail account
2. Generate an App Password:
   - Google Account → Security → 2-Step Verification → App passwords
   - Select "Mail" and your device
   - Copy the generated password
3. Set the Firebase config:
   ```bash
   firebase functions:config:set email.password="your-16-character-app-password"
   ```

## 4. PayFast Integration

### Test Configuration (Sandbox)
- Merchant ID: `10004002`
- Merchant Key: `q1cd2rdny4a53`
- Test URL: `https://sandbox.payfast.co.za/eng/process`

### Production Configuration
1. Sign up for PayFast merchant account
2. Get your production credentials
3. Update `script.js` with your merchant details:
   ```javascript
   const payfastParams = {
       merchant_id: 'YOUR_MERCHANT_ID',
       merchant_key: 'YOUR_MERCHANT_KEY',
       // ... other params
   };
   ```
4. Change PayFast URL to production:
   ```javascript
   payfastForm.action = 'https://www.payfast.co.za/eng/process';
   ```

## 5. Database Structure

### Collections Structure
```
artifacts/
  └── default-app-id/
      ├── users/
      │   └── {userId}/
      │       ├── name: string
      │       ├── email: string
      │       ├── phone: string
      │       ├── address: object
      │       ├── createdAt: timestamp
      │       └── updatedAt: timestamp
      │
      ├── orders/
      │   └── {orderId}/
      │       ├── userId: string
      │       ├── items: array
      │       ├── totalAmount: number
      │       ├── status: string
      │       ├── orderDate: timestamp
      │       ├── deliveryAddress: object
      │       ├── paymentId: string
      │       ├── trackingNumber: string
      │       ├── invoiceUrl: string
      │       └── estimatedDelivery: timestamp
      │
      └── support-requests/
          └── {requestId}/
              ├── userId: string
              ├── userEmail: string
              ├── userName: string
              ├── subject: string
              ├── message: string
              ├── status: string
              └── createdAt: timestamp
```

## 6. Testing the System

### Test User Journey
1. **Sign Up**: Create account with name and email
2. **Browse Products**: Add items to cart
3. **Checkout**: Complete delivery address
4. **Payment**: Process PayFast payment (use test cards)
5. **Profile**: View order history and invoice
6. **Email**: Check for confirmation emails
7. **Support**: Submit support request

### Test Payment Cards (Sandbox)
- **Visa**: `4000000000000002`
- **Mastercard**: `5200000000000015`
- Use any future expiry date and any 3-digit CVV

## 7. Production Deployment

### Environment Variables
```bash
# Set production PayFast credentials
firebase functions:config:set payfast.merchant_id="YOUR_MERCHANT_ID"
firebase functions:config:set payfast.merchant_key="YOUR_MERCHANT_KEY"

# Set production email settings
firebase functions:config:set email.user="nomaqhizazolile@gmail.com"
firebase functions:config:set email.password="YOUR_APP_PASSWORD"
```

### Deploy All Services
```bash
# Deploy everything
firebase deploy

# Or deploy individually
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## 8. Monitoring and Maintenance

### Firebase Console Monitoring
- **Functions**: Monitor execution, errors, and performance
- **Firestore**: Track document reads/writes
- **Storage**: Monitor file uploads and bandwidth
- **Authentication**: Track user registrations and logins

### Email Deliverability
- Monitor Gmail sending limits (500 emails/day for free accounts)
- Consider upgrading to Google Workspace for higher limits
- Set up SPF, DKIM, and DMARC records for better deliverability

### PayFast Integration Monitoring
- Monitor payment success rates
- Check ITN (Instant Transaction Notification) logs
- Handle failed payments and refunds

## 9. Support and Troubleshooting

### Common Issues

#### Email Not Sending
```javascript
// Check function logs
firebase functions:log

// Verify email configuration
firebase functions:config:get
```

#### PayFast Integration Issues
- Verify merchant credentials
- Check return URL accessibility
- Ensure HTTPS for production

#### Profile Not Loading
- Check Firestore security rules
- Verify user authentication state
- Check browser console for JavaScript errors

### Performance Optimization
- Use Firestore pagination for large order lists
- Implement caching for frequently accessed data
- Optimize images and assets
- Use CDN for static content

## 10. Backup and Security

### Data Backup
- Enable Firestore automatic backups
- Export user data regularly
- Store backups in multiple locations

### Security Best Practices
- Regularly update dependencies
- Monitor for security vulnerabilities
- Use HTTPS everywhere
- Implement rate limiting
- Regular security audits

## 11. Scaling Considerations

### High Traffic Handling
- Upgrade to Blaze plan for unlimited functions
- Implement caching strategies
- Use Cloud Load Balancer
- Consider multi-region deployment

### Customer Support Integration
- Integrate with helpdesk systems (Zendesk, Freshdesk)
- Add live chat functionality
- Implement ticket management system
- Set up escalation procedures

## Support Contact
For technical support and questions:
- Email: nomaqhizazolile@gmail.com
- Phone: +27 69 206 0618

## Next Steps
1. Test the complete system in development
2. Configure production environments
3. Deploy to Firebase hosting
4. Test with real PayFast payments
5. Launch and monitor