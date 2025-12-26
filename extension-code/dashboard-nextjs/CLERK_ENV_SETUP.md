# Clerk Environment Variable Setup

## The Issue

Clerk requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to be set in your environment variables.

## Quick Fix

Add this to your `.env.local` file:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

## How to Get Your Clerk Keys

1. **Visit Clerk Dashboard**: https://dashboard.clerk.com
2. **Sign in or create account**
3. **Create a new application** (or select existing)
4. **Go to API Keys section**
5. **Copy the "Publishable key"** (starts with `pk_test_` for development)
6. **Add to `.env.local`**:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
   CLERK_SECRET_KEY=sk_test_your_secret_here
   ```

## Important Notes

- **Restart your dev server** after adding environment variables:
  ```bash
  # Stop the server (Ctrl+C)
  npm run dev
  ```

- The `NEXT_PUBLIC_` prefix is required for client-side access
- Clerk will automatically generate keys on first run if you haven't set them up yet
- For production, use keys from your production Clerk application

## Current Status

The code now explicitly passes the `publishableKey` to `ClerkProvider`, which will help diagnose if the environment variable is being loaded correctly.

