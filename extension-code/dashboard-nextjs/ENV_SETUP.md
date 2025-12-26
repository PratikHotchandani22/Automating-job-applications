# Environment Variable Setup

## Important: Convex URL Format

Your `.env.local` file should contain the **deployment URL**, not the dashboard URL.

### ❌ Incorrect (Dashboard URL)
```
NEXT_PUBLIC_CONVEX_URL=https://dashboard.convex.dev/d/brainy-possum-720
```

### ✅ Correct (Deployment URL)
```
NEXT_PUBLIC_CONVEX_URL=https://brainy-possum-720.convex.cloud
```

## How to Get Your Deployment URL

1. Run `npx convex dev` in your terminal
2. Look for output like:
   ```
   Deployment URL: https://brainy-possum-720.convex.cloud
   ```
3. Copy that URL to your `.env.local` file

## Current Setup

Your `.env.local` should look like:

```env
# Convex Configuration
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk Authentication (if using)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
# CLERK_SECRET_KEY=your_clerk_secret_key
```

## Verification

After updating the URL, restart your Next.js dev server:

```bash
npm run dev
```

You should see no errors related to Convex connection. If you see connection errors, double-check that:
1. The URL format is correct (ends with `.convex.cloud`)
2. You've run `npx convex dev` at least once to initialize the deployment
3. The URL matches what's shown in your terminal when running `npx convex dev`

