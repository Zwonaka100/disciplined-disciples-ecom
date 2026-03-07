# Firebase Storage Setup Instructions

## Problem
Firebase Storage bucket doesn't exist yet - needs to be initialized in console first.

## Solution Steps

### Step 1: Initialize Storage in Firebase Console
1. Go to: https://console.firebase.google.com/project/disciplined-disciples-1/storage
2. Click "Get Started" button
3. Choose "Start in production mode"
4. Select location: `europe-west1` (Belgium - closest to South Africa)
5. Click "Done"
6. Wait 30-60 seconds for bucket creation

### Step 2: Configure CORS (Allow Custom Domain Uploads)
After bucket is created, run in terminal:
```powershell
cd "c:\Users\Zwonaka Mabege\OneDrive\Desktop\Zande Technologies\Disciplined\DisciplinedDisciples"
gsutil cors set cors.json gs://disciplined-disciples-1.appspot.com
```

### Step 3: Deploy Storage Rules
```powershell
firebase deploy --only storage
```

### Step 4: Test Upload
Go to admin-products page and try uploading an image from your computer.

## What This Fixes
- ✅ CORS policy blocking uploads from www.disciplineddisciples.co.za
- ✅ "Bucket does not exist" error
- ✅ File uploads will work from custom domain

## Current CORS Config (cors.json)
Allows uploads from:
- https://www.disciplineddisciples.co.za
- https://disciplineddisciples.co.za  
- https://disciplined-disciples-1.web.app
- https://disciplined-disciples-1.firebaseapp.com
