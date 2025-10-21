# 🔐 URGENT: Regenerate All Exposed Credentials

## ⚠️ YOUR SECRETS WERE EXPOSED ON GITHUB!

Since your `.env` file was pushed to GitHub (even though the push was blocked), you **MUST** regenerate all credentials immediately.

## 1. Google OAuth Credentials

### Steps to Regenerate:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Find your OAuth 2.0 Client ID that was exposed
4. **DELETE** the exposed client ID
5. Click **+ CREATE CREDENTIALS** > **OAuth client ID**
6. Choose **Web application**
7. Configure:
   - **Name**: LabMate360 Backend
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (development)
     - `https://your-frontend-domain.vercel.app` (production - add after deployment)
   - **Authorized redirect URIs**:
     - `http://localhost:5000/api/auth/google/callback` (development)
     - `https://your-backend-domain.onrender.com/api/auth/google/callback` (production)
8. Click **CREATE**
9. **SAVE** your new Client ID and Client Secret

## 2. JWT Secret

Generate a new strong JWT secret:

```powershell
# Option 1: Use Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Option 2: Use OpenSSL (if available)
openssl rand -hex 64

# Option 3: Use PowerShell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## 3. MongoDB Connection String

If your `.env` contained a MongoDB connection string with credentials:

### Option A: MongoDB Atlas
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Navigate to **Database Access**
3. Find your user
4. Click **Edit** > **Edit Password**
5. Generate and save new password
6. Update connection string: `mongodb+srv://username:NEW_PASSWORD@cluster.mongodb.net/labmate360`

### Option B: Local MongoDB
- Change your MongoDB password if it was in the connection string

## 4. Razorpay Keys

If you had Razorpay keys in your `.env`:

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com/)
2. Navigate to **Settings** > **API Keys**
3. Click **Regenerate Test Keys** (for test mode)
4. Click **Regenerate Live Keys** (for production - be careful!)
5. Save your new Key ID and Key Secret

## 5. Email App Password (Gmail)

If you're using Gmail with an app password:

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Navigate to **2-Step Verification** > **App passwords**
3. **Revoke** the old app password
4. Create a new app password:
   - Select app: **Mail**
   - Select device: **Other (Custom name)**
   - Enter: "LabMate360 Backend"
   - Click **Generate**
5. Save the 16-character password

## 6. Update Your Local .env

After regenerating all credentials, update your local `.env` file:

```bash
# In: E:\labmate\labmate\backend\.env

# Database
MONGODB_URI=mongodb+srv://username:NEW_PASSWORD@cluster.mongodb.net/labmate360

# JWT
JWT_SECRET=YOUR_NEW_64_CHAR_HEX_STRING

# Server
PORT=5000
NODE_ENV=development

# Frontend
FRONTEND_URL=http://localhost:5173

# Google OAuth (NEW CREDENTIALS)
GOOGLE_CLIENT_ID=your_new_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_new_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Email (NEW APP PASSWORD)
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_new_16_char_app_password

# Razorpay (NEW KEYS)
RAZORPAY_KEY_ID=your_new_razorpay_key_id
RAZORPAY_KEY_SECRET=your_new_razorpay_key_secret

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=uploads

# CORS
CORS_ORIGIN=http://localhost:5173
```

## 7. Test Locally

After updating all credentials:

```powershell
cd E:\labmate\labmate\backend
npm start
```

Verify:
- ✅ MongoDB connects successfully
- ✅ Google OAuth login works
- ✅ Email sending works
- ✅ Razorpay integration works

## 8. Checklist

- [ ] Deleted old Google OAuth Client
- [ ] Created new Google OAuth Client
- [ ] Generated new JWT Secret
- [ ] Changed MongoDB password (if applicable)
- [ ] Regenerated Razorpay keys (if they were exposed)
- [ ] Created new Gmail app password (if it was exposed)
- [ ] Updated local `.env` with ALL new credentials
- [ ] Tested backend locally
- [ ] Verified `.env` is in `.gitignore`
- [ ] Confirmed `.env` does NOT appear in `git status`

## Next: Deployment

Once all secrets are regenerated and tested:
1. Fix Git history (see `FIX_GIT_SECRETS.md`)
2. Deploy to Render/Vercel (see `DEPLOYMENT_GUIDE.md`)
3. Add production URLs to Google OAuth redirect URIs

---

**⚠️ DO NOT skip this step!** Exposed credentials are a serious security risk!

