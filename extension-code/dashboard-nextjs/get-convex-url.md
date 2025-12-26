# How to Get Your Convex Deployment URL

When `npx convex dev` just shows "Convex functions ready!" without the URL, here are ways to find it:

## Method 1: Check Convex Dashboard

1. Go to https://dashboard.convex.dev
2. Sign in with your account
3. Select your project (should be named something like "brainy-possum-720")
4. The deployment URL will be shown at the top or in the settings
5. It should look like: `https://brainy-possum-720.convex.cloud`

## Method 2: Check the Full Terminal Output

When you first ran `npx convex dev`, it should have shown something like:

```
✔ Created deployment: brainy-possum-720
✔ Deployment URL: https://brainy-possum-720.convex.cloud
```

Scroll up in your terminal to see the initial output.

## Method 3: Use Convex CLI

Run this command to see your deployment info:

```bash
npx convex deployments
```

This will list all your deployments and their URLs.

## Method 4: Check Environment Variables

If you've set it up before, check:

```bash
cat .env.local | grep CONVEX_URL
```

## Method 5: Based on Your Project Name

From your `.env.local`, I can see your project is `brainy-possum-720`.

Your deployment URL is likely:
```
https://brainy-possum-720.convex.cloud
```

Try this URL in your `.env.local`:

```env
NEXT_PUBLIC_CONVEX_URL=https://brainy-possum-720.convex.cloud
```

Then restart your Next.js dev server and test if it works!

