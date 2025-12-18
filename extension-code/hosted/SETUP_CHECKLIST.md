# Quick Setup Checklist (~30 minutes)

## Step 1: Create Supabase Project (5 min)

1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub (free)
3. Click "New Project"
   - Name: `resume-intelligence`
   - Password: (generate strong one)
   - Region: closest to you
4. Wait 2 min for project to initialize
5. Go to **Settings → API**
6. Copy these values to your `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Create Database Tables (2 min)

1. In Supabase, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire SQL from `SCALING_GUIDE.md` (Section 1.2)
4. Click "Run"
5. Verify tables created in **Table Editor**

## Step 3: Enable Google Auth (3 min)

1. Go to **Authentication → Providers**
2. Enable "Google"
3. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
4. Create OAuth 2.0 Client ID
   - Authorized redirect: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
5. Copy Client ID and Secret to Supabase

## Step 4: Create Upstash Redis (3 min)

1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub (free)
3. Click "Create Database"
   - Name: `resume-intel-cache`
   - Type: Regional
   - Region: closest to your users
4. Copy these to `.env.local`:
   - REST URL → `UPSTASH_REDIS_REST_URL`
   - REST Token → `UPSTASH_REDIS_REST_TOKEN`

## Step 5: Create PostHog Project (2 min)

1. Go to [posthog.com](https://posthog.com)
2. Sign up (free - 1M events/month)
3. Create project: `Resume Intelligence`
4. Copy API key to `.env.local`:
   - Project API Key → `NEXT_PUBLIC_POSTHOG_KEY`

## Step 6: Deploy to Vercel (5 min)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (from hosted/ folder)
cd hosted
vercel

# Add environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add OPENAI_API_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add NEXT_PUBLIC_POSTHOG_KEY

# Deploy production
vercel --prod
```

## Step 7: Update Extension (5 min)

Update your extension's `service_worker.js` to point to hosted API:

```javascript
// Change from:
const API_BASE = 'http://localhost:3001';

// To:
const API_BASE = 'https://your-project.vercel.app/api';
```

## Step 8: Test (5 min)

1. Install extension in Chrome
2. Open a job posting (LinkedIn, etc.)
3. Click extension icon
4. Sign in with Google
5. Click "Analyze"
6. Check PostHog for events

---

## Monthly Cost Estimate

| Users | Supabase | Upstash | Vercel | PostHog | **Total** |
|-------|----------|---------|--------|---------|-----------|
| 0-100 | $0 | $0 | $0 | $0 | **$0** |
| 100-500 | $0 | $0 | $0 | $0 | **$0** |
| 500-1K | $25 | $0 | $0 | $0 | **$25** |
| 1K-5K | $25 | $10 | $20 | $0 | **$55** |

---

## Troubleshooting

### "Unauthorized" errors
- Check Supabase anon key is correct
- Verify user is logged in
- Check RLS policies are correct

### "Rate limit exceeded"
- Free tier: 5 runs/day, 20/hour
- Check `checkRateLimit()` in redis.ts

### Pipeline times out
- Vercel Hobby: 60s max
- Split long operations
- Consider background jobs (Inngest, Trigger.dev)

### PostHog not tracking
- Check `NEXT_PUBLIC_POSTHOG_KEY`
- Disable in development (default)
- Check browser console for errors
