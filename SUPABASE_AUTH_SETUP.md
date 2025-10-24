# Supabase Authentication Setup Guide

This guide will help you set up Supabase authentication with Google OAuth and email/password authentication for the News Agent application.

## Prerequisites

- A Supabase project (https://supabase.com)
- A Google Cloud Console project for OAuth
- Node.js and npm installed

## Step 1: Set up Supabase Project

1. **Create a Supabase Project**
   - Go to https://supabase.com and sign in
   - Click "New Project"
   - Choose your organization and configure your project
   - Save your project credentials (URL and Anon Key)

2. **Enable Email/Password Authentication**
   - In Supabase dashboard, go to Authentication → Providers
   - Find "Email" provider and ensure it's enabled
   - Configure email settings if needed

3. **Enable Google OAuth Provider**
   - In Supabase dashboard, go to Authentication → Providers
   - Find "Google" and toggle it on
   - Google will provide instructions for getting OAuth credentials

## Step 2: Set up Google OAuth

1. **Create OAuth 2.0 Credentials**
   - Go to Google Cloud Console (https://console.cloud.google.com)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Go to "Credentials" and create an "OAuth 2.0 Client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     ```
     http://localhost:3000/auth/callback
     https://yourdomain.com/auth/callback
     https://[YOUR_SUPABASE_PROJECT_ID].supabase.co/auth/v1/callback?provider=google
     ```

2. **Add OAuth Credentials to Supabase**
   - Copy your Google Client ID and Client Secret
   - Go to Supabase Dashboard → Authentication → Providers → Google
   - Paste the Client ID and Client Secret
   - Click "Save"

## Step 3: Configure Environment Variables

1. **Create `.env.local` file** in your project root:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

2. **Get your credentials from Supabase**
   - Go to Settings → API
   - Copy "Project URL" and "Anon (public)" key
   - Copy "Service Role" key (keep this secret!)

## Step 4: Test the Authentication

1. **Start the development server**
   ```bash
   npm run dev
   ```

2. **Test Email/Password Auth**
   - Navigate to http://localhost:3000/auth/signup
   - Create an account with email and password
   - Check your email for verification link (or check Supabase email logs)
   - Sign in at http://localhost:3000/auth/signin

3. **Test Google OAuth**
   - Click "Google" button on sign-in/sign-up pages
   - You'll be redirected to Google login
   - After authentication, you'll be redirected to the dashboard

## Step 5: Protect Your Routes

1. **Use ProtectedRoute Component**
   ```tsx
   import { ProtectedRoute } from '@/components/ProtectedRoute';
   
   export default function Dashboard() {
     return (
       <ProtectedRoute>
         <YourContent />
       </ProtectedRoute>
     );
   }
   ```

2. **Use useAuth Hook**
   ```tsx
   'use client';
   
   import { useAuth } from '@/lib/auth-context';
   
   export function MyComponent() {
     const { user, signOut } = useAuth();
     
     if (!user) {
       return <div>Please sign in</div>;
     }
     
     return <div>Welcome, {user.email}</div>;
   }
   ```

## Deployed to Production

1. **Update Environment Variables**
   - Set `NEXT_PUBLIC_APP_URL` to your production domain
   - Update Supabase Google OAuth redirect URIs:
     ```
     https://yourdomain.com/auth/callback
     https://yourdomain.com
     ```

2. **Configure Supabase Email Settings**
   - Go to Authentication → Email Templates
   - Customize confirmation and reset password emails
   - Update redirect URLs to point to your production domain

3. **Enable Email Confirmation (Optional)**
   - Go to Authentication → Providers → Email
   - Toggle "Confirm email" to require email verification

## Troubleshooting

### Google OAuth not working
- Verify redirect URIs in Google Cloud Console match your app URL
- Check that Google provider is enabled in Supabase
- Ensure Client ID and Secret are correctly configured

### Email confirmation not working
- Check Supabase email settings
- Verify email provider is configured (default uses Supabase email)
- Check NEXT_PUBLIC_APP_URL is set correctly

### Session not persisting
- Verify cookies are enabled in browser
- Check that NEXT_PUBLIC_SUPABASE_ANON_KEY is correct
- Ensure supabase client initialization has correct URL and key

### 404 on callback
- Verify `/auth/callback` route exists
- Check redirect URIs match exactly (including trailing slashes)
- Ensure NEXT_PUBLIC_APP_URL environment variable is set

## API Reference

### useAuth Hook

```tsx
const { 
  user,              // Currently logged-in user or null
  session,          // Current session object
  loading,          // Whether auth state is loading
  signUp,           // (email, password) => Promise
  signIn,           // (email, password) => Promise
  signInWithGoogle, // () => Promise
  signOut,          // () => Promise
} = useAuth();
```

### ProtectedRoute Component

```tsx
<ProtectedRoute>
  {/* Only renders if user is authenticated */}
</ProtectedRoute>
```

### UserMenu Component

Ready-to-use component showing current user with dropdown menu:

```tsx
import { UserMenu } from '@/components/UserMenu';

export default function Header() {
  return (
    <header>
      <UserMenu />
    </header>
  );
}
```

## File Structure

```
src/
├── lib/
│   ├── auth-context.tsx      # Auth provider and useAuth hook
│   └── supabaseClient.ts     # Supabase client initialization
├── app/
│   ├── auth/
│   │   ├── signin/
│   │   │   └── page.tsx      # Sign-in page
│   │   ├── signup/
│   │   │   └── page.tsx      # Sign-up page
│   │   └── callback/
│   │       └── route.ts      # OAuth callback handler
│   ├── dashboard/
│   │   └── page.tsx          # Protected dashboard
│   └── layout.tsx            # Root layout with AuthProvider
└── components/
    ├── ProtectedRoute.tsx    # Protected route wrapper
    └── UserMenu.tsx          # User menu component
```

## Security Best Practices

1. **Never commit `.env.local`** - Add to `.gitignore`
2. **Use SUPABASE_SERVICE_ROLE_KEY only on server** - Never expose in client
3. **Enable PKCE** - Supabase uses PKCE for added security
4. **Set secure cookie options** - Configured by Supabase by default
5. **Use HTTPS in production** - Required for OAuth redirects
6. **Regularly rotate credentials** - Especially service role keys
7. **Enable MFA** - Consider enabling multi-factor authentication

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase Google OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Next.js Authentication](https://nextjs.org/docs/app/building-your-application/authentication)
