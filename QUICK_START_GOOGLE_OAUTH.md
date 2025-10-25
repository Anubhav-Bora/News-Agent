# Quick Start: Google OAuth Setup (5-Minute Version)

## TL;DR - Get Google OAuth Working in 5 Minutes

### Step 1: Get Google Credentials (2 mins)
```
Go to: https://console.cloud.google.com
→ Create Project
→ Enable Google+ API  
→ Create OAuth Client ID (Web app)
→ Add redirect: http://localhost:3000/auth/callback
→ Copy Client ID & Secret
```

### Step 2: Add to Supabase (1 min)
```
Go to: https://supabase.com (your project)
→ Auth → Providers → Google
→ Turn ON
→ Paste Client ID & Secret
→ Save
```

### Step 3: Test (2 mins)
```bash
npm run dev
# Go to http://localhost:3000/auth/signin
# Click Google button
# Should work!
```

---

## What's Ready to Go ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Email/Password Sign Up | ✅ Working | Ready to use |
| Email/Password Sign In | ✅ Working | Ready to use |
| Google Sign In | ⏳ Waiting for credentials | Needs Google setup |
| Session Management | ✅ Working | Auto-persisted |
| Protected Routes | ✅ Ready | Use `<ProtectedRoute>` |
| Type Safety | ✅ Fixed | All auth errors resolved |

---

## Credentials You Need to Find

| What | Where to Get | Notes |
|-----|-------------|-------|
| Google Client ID | Google Cloud Console → Credentials | 40-character string |
| Google Client Secret | Google Cloud Console → Credentials | Secret string (keep private!) |

---

## Local Testing

```bash
# Start dev server
npm run dev

# Test Sign Up
curl http://localhost:3000/auth/signup

# Test Sign In  
curl http://localhost:3000/auth/signin

# Test Google Sign In
# (After configuring Google OAuth)
curl http://localhost:3000/auth/signin
# Click Google button
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid redirect URI" | Check Google Cloud Console - redirect must match exactly |
| "Client not found" | Wait 30 seconds after creating Client ID for it to activate |
| "Keep redirecting to Google" | Clear browser cookies, verify Supabase has correct credentials |
| "Google button does nothing" | Verify Google OAuth is enabled in Supabase Authentication |

---

## Files to Review

- `AUTH_FIX_SUMMARY.md` - Complete fix details
- `GOOGLE_OAUTH_SETUP_GUIDE.md` - Step-by-step guide with screenshots
- `SUPABASE_AUTH_SETUP.md` - Full authentication setup reference

---

## Build Status

```
✓ Project builds successfully
✓ All auth TypeScript errors fixed
✓ OAuth callback route implemented
✓ Ready for Google OAuth configuration
```

---

## Questions?

Check these resources:
1. `GOOGLE_OAUTH_SETUP_GUIDE.md` - Detailed instructions
2. [Supabase Google OAuth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
3. [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
