# Firebase Setup and Deployment Script for Disciplined Disciples

## Prerequisites
Before running this script, make sure you have:
1. Node.js installed (version 14 or higher)
2. Firebase CLI installed: `npm install -g firebase-tools`
3. A Firebase project created at https://console.firebase.google.com/

## Step 1: Login to Firebase
```powershell
firebase login
```

## Step 2: Initialize Firebase Project (if not already done)
```powershell
firebase init
```
Select the following options:
- [x] Firestore: Configure security rules and indexes files
- [x] Functions: Configure a Cloud Functions directory and its files  
- [x] Hosting: Configure files for Firebase Hosting and (optionally) GitHub Action deploys
- [x] Storage: Configure a security rules file for Cloud Storage

## Step 3: Configure Authentication in Firebase Console
1. Go to https://console.firebase.google.com/
2. Select your project: `disciplined-disciples-1`
3. Go to Authentication > Sign-in method
4. Enable **Email/Password** authentication
5. Optional: Enable **Google** sign-in for easier user experience

## Step 4: Configure Firestore Database
1. In Firebase Console, go to Firestore Database
2. Create database in **production mode**
3. Choose your preferred region (us-central1 recommended)

## Step 5: Deploy Firestore Rules and Indexes
```powershell
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

## Step 6: Deploy Cloud Functions (for email and payments)
```powershell
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Step 7: Set up Cloud Functions Environment Variables
```powershell
# Set email password for Gmail SMTP
firebase functions:config:set email.password="YOUR_GMAIL_APP_PASSWORD"

# Deploy functions again after setting config
firebase deploy --only functions
```

## Step 8: Deploy Hosting
```powershell
firebase deploy --only hosting
```

## Step 9: Deploy Everything at Once (Production)
```powershell
firebase deploy
```

## Troubleshooting Authentication Issues

### Common Issues and Solutions:

1. **"Firebase: Error (auth/invalid-value-(email))" Error**
   - Solution: Check that email format is valid
   - Ensure no special characters or spaces in email field
   - Make sure Firebase Authentication is properly enabled

2. **Profile page redirects back to login immediately**
   - Solution: Check Firestore security rules are deployed
   - Verify user document structure matches expected format
   - Check browser console for authentication state changes

3. **"Permission denied" errors in Firestore**
   - Solution: Deploy Firestore rules: `firebase deploy --only firestore:rules`
   - Check that user is properly authenticated before making requests

4. **Email notifications not working**
   - Solution: Set up Gmail App Password for Cloud Functions
   - Deploy functions with proper environment variables

## Testing Commands

### Test locally with Firebase Emulators:
```powershell
firebase emulators:start
```

### Test authentication flow:
```powershell
# Open browser to http://localhost:5000
# Try signup/login functionality
# Check browser console for errors
```

### Test Firestore connectivity:
```powershell
# Go to http://localhost:5000/test-dashboard.html
# Run database connectivity tests
```

## Environment Variables for Production

Set these in Firebase Functions configuration:
```powershell
firebase functions:config:set email.password="your-gmail-app-password"
firebase functions:config:set payfast.merchant_id="your-payfast-merchant-id"
firebase functions:config:set payfast.merchant_key="your-payfast-merchant-key"
```

## Security Checklist

- [x] Firestore security rules deployed
- [x] Authentication enabled for Email/Password
- [x] HTTPS enforced (automatic with Firebase Hosting)
- [x] Environment variables secured in Firebase Functions
- [x] API keys restricted in Firebase Console (optional but recommended)

## Support

If you encounter issues:
1. Check Firebase Console for error logs
2. Review browser console for JavaScript errors  
3. Verify all deployment steps completed successfully
4. Test with Firebase Emulators first before deploying to production