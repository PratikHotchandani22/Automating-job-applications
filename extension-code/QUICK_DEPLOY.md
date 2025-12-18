# ⚡ Quick Deploy: $0/month Stack for 100 Users

Get Resume Intelligence deployed in **30 minutes** with this guide.

## TL;DR Stack

| Service | Free Tier | Setup Time |
|---------|-----------|------------|
| 🐘 **Supabase** | 500MB, 50K users | 5 min |
| 🔴 **Upstash Redis** | 10K commands/day | 3 min |
| 📊 **PostHog** | 1M events/month | 3 min |
| 🚀 **Render** | 750 hrs/month | 10 min |
| ▲ **Vercel** | Unlimited | 5 min |

**Total: $0/month** | **Setup: ~30 minutes**

---

## Step 1: Create Accounts (5 min)

Open these in new tabs and sign up:

1. [supabase.com](https://supabase.com) - GitHub login
2. [upstash.com](https://upstash.com) - GitHub login
3. [posthog.com](https://posthog.com) - Google/GitHub login
4. [render.com](https://render.com) - GitHub login
5. [vercel.com](https://vercel.com) - GitHub login

---

## Step 2: Supabase Setup (5 min)

1. Create new project: `resume-intelligence`
2. Copy these from **Settings → API**:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_KEY=eyJ...
   ```
3. Copy from **Settings → Database**:
   ```
   DATABASE_URL=postgresql://...
   ```
4. Go to **SQL Editor** → Paste contents of `backend/db/schema.sql` → Run

---

## Step 3: Upstash Redis (3 min)

1. Create database: `resume-intel-cache`
2. Copy from **REST API** tab:
   ```
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=AXxx...
   ```

---

## Step 4: PostHog (3 min)

1. Create project: `resume-intelligence`
2. Copy from **Project Settings**:
   ```
   POSTHOG_API_KEY=phc_xxx
   POSTHOG_HOST=https://app.posthog.com
   ```

---

## Step 5: Deploy Backend to Render (10 min)

1. Go to [render.com/new](https://dashboard.render.com/new)
2. Click **Web Service** → Connect GitHub repo
3. Configure:
   - **Name**: `resume-intel-api`
   - **Root Directory**: `extension-code/backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

4. Add **Environment Variables** (click "Add Environment Variable"):

```
OPENAI_API_KEY       = sk-proj-your-key
ANTHROPIC_API_KEY    = sk-ant-your-key
SUPABASE_URL         = https://xxx.supabase.co
SUPABASE_SERVICE_KEY = eyJ...
UPSTASH_REDIS_REST_URL   = https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN = AXxx...
POSTHOG_API_KEY      = phc_xxx
NODE_ENV             = production
PORT                 = 3001
```

5. Click **Create Web Service**
6. Wait ~5 min for deploy
7. Note your URL: `https://resume-intel-api.onrender.com`

---

## Step 6: Deploy Dashboard to Vercel (5 min)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Configure:
   - **Root Directory**: `extension-code/dashboard-react`
   - **Framework**: Vite

4. Add **Environment Variables**:

```
VITE_API_URL           = https://resume-intel-api.onrender.com
VITE_SUPABASE_URL      = https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...
VITE_POSTHOG_KEY       = phc_xxx
```

5. Click **Deploy**
6. Note your URL: `https://your-project.vercel.app`

---

## Step 7: Update Extension (2 min)

In `extension-code/service_worker.js`, update:

```javascript
const API_BASE = 'https://resume-intel-api.onrender.com';
```

In `extension-code/manifest.json`, add your Render URL to `host_permissions`:

```json
"host_permissions": [
  "http://*/*",
  "https://*/*",
  "https://resume-intel-api.onrender.com/*"
]
```

---

## Step 8: Test It! (2 min)

1. Open your Render URL: `https://resume-intel-api.onrender.com/health`
   - Should see: `{"ok":true,...}`
   - First request may take 30s (cold start)

2. Open your Vercel dashboard URL

3. Load the Chrome extension (if not already):
   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Click "Load unpacked"
   - Select `extension-code` folder

4. Navigate to a job posting on LinkedIn
5. Click the extension → Analyze
6. 🎉 Done!

---

## Keeping Render Awake (Optional)

Render's free tier sleeps after 15 minutes. To prevent this:

1. Go to [cron-job.org](https://cron-job.org) (free)
2. Create account
3. Add new cron job:
   - **URL**: `https://resume-intel-api.onrender.com/health`
   - **Schedule**: Every 14 minutes
   - **Method**: GET

---

## Cost Summary

| When | Monthly Cost |
|------|--------------|
| **Now (0-100 users)** | $0 |
| **100-500 users** | $7 (Render Starter) |
| **500-2000 users** | $32 (+ Supabase Pro) |
| **2000+ users** | $50-100 |

---

## Troubleshooting

### "Backend offline" in extension
- Check Render logs for errors
- Verify environment variables are set
- Wait 30s for cold start

### Database errors
- Run schema.sql again in Supabase SQL Editor
- Check DATABASE_URL format

### CORS errors
- Add your Vercel/extension URLs to CORS_ORIGIN env var

---

## What's Next?

1. **Get 10 users** - Share with friends applying for jobs
2. **Track outcomes** - Ask users to mark "Got Interview"
3. **Collect feedback** - What's missing? What's confusing?
4. **Iterate** - Improve based on feedback

---

## Files Created

```
extension-code/
├── DEPLOYMENT_GUIDE.md    # Full guide with details
├── QUICK_DEPLOY.md        # This file
├── render.yaml            # One-click Render deploy
├── backend/
│   ├── db/
│   │   ├── schema.sql     # Supabase database schema
│   │   ├── supabase.js    # Database client
│   │   ├── redis.js       # Cache client
│   │   └── analytics.js   # PostHog client
│   └── env.example.txt    # Environment template
└── dashboard-react/
    └── env.example.txt    # Frontend env template
```

---

**Questions?** Check [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed docs.
