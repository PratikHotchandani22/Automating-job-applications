# 🚀 Free Deployment Guide for 100 Users

This guide helps you deploy Resume Intelligence on a **$0/month stack** suitable for up to 100 users.

## Overview

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| [Supabase](https://supabase.com) | Database + Auth | 500MB, 50K MAUs |
| [Upstash](https://upstash.com) | Redis caching | 10K commands/day |
| [Render](https://render.com) | Backend API | 750 hrs/month |
| [Vercel](https://vercel.com) | Dashboard hosting | Unlimited |
| [PostHog](https://posthog.com) | Analytics | 1M events/month |

**Estimated monthly cost: $0** (until you exceed free tiers)

---

## Step 1: Set Up Supabase (Database + Auth)

### 1.1 Create Account & Project
1. Go to [supabase.com](https://supabase.com) and sign up
2. Click "New Project"
3. Name: `resume-intelligence`
4. Generate a strong database password (save it!)
5. Region: Choose closest to your users
6. Wait ~2 minutes for provisioning

### 1.2 Get Your Credentials
After project creation, go to **Settings → API**:
- `SUPABASE_URL` = Project URL (e.g., `https://xyz.supabase.co`)
- `SUPABASE_ANON_KEY` = anon/public key
- `SUPABASE_SERVICE_KEY` = service_role key (keep secret!)

Go to **Settings → Database**:
- `DATABASE_URL` = Connection string (URI format)

### 1.3 Run Database Migrations
In Supabase SQL Editor, run the schema from `backend/db/schema.sql` (we'll create this next).

---

## Step 2: Set Up Upstash Redis (Caching)

### 2.1 Create Account & Database
1. Go to [upstash.com](https://upstash.com) and sign up
2. Click "Create Database"
3. Name: `resume-intel-cache`
4. Region: Same as Supabase
5. Type: Regional (free tier)

### 2.2 Get Your Credentials
- `UPSTASH_REDIS_REST_URL` = REST URL
- `UPSTASH_REDIS_REST_TOKEN` = REST Token

---

## Step 3: Set Up PostHog (Analytics)

### 3.1 Create Account
1. Go to [posthog.com](https://posthog.com) and sign up for Cloud (US or EU)
2. Create a project: `resume-intelligence`

### 3.2 Get Your Credentials
- `NEXT_PUBLIC_POSTHOG_KEY` = Project API Key
- `NEXT_PUBLIC_POSTHOG_HOST` = `https://app.posthog.com` (or EU host)

---

## Step 4: Deploy Backend to Render

### 4.1 Prepare Your Repo
Make sure your backend has a proper `package.json` with a start script:
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

### 4.2 Create Render Service
1. Go to [render.com](https://render.com) and sign up
2. Click "New → Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name**: `resume-intel-api`
   - **Root Directory**: `extension-code/backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### 4.3 Add Environment Variables
In Render dashboard, add these environment variables:

```
# OpenAI (required)
OPENAI_API_KEY=sk-...

# Anthropic (required for LaTeX)
ANTHROPIC_API_KEY=sk-ant-...

# Supabase
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# PostHog
POSTHOG_API_KEY=phc_...

# App Config
NODE_ENV=production
PORT=3001
```

### 4.4 Note About Free Tier Sleep
⚠️ Render's free tier **sleeps after 15 minutes of inactivity**. First request after sleep takes ~30 seconds.

**Solutions:**
1. Accept the cold start (fine for MVP)
2. Use [cron-job.org](https://cron-job.org) to ping your API every 14 minutes (free)
3. Upgrade to $7/month when you have paying users

---

## Step 5: Deploy Dashboard to Vercel

### 5.1 Prepare Dashboard
Ensure `dashboard-react` has proper build config in `package.json`:
```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### 5.2 Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and sign up
2. Click "Add New → Project"
3. Import your GitHub repo
4. Configure:
   - **Root Directory**: `extension-code/dashboard-react`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 5.3 Add Environment Variables
```
VITE_API_URL=https://resume-intel-api.onrender.com
VITE_SUPABASE_URL=https://xyz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://app.posthog.com
```

---

## Step 6: Update Chrome Extension

Update your extension's `manifest.json` to point to production:

```json
{
  "host_permissions": [
    "http://*/*",
    "https://*/*",
    "https://resume-intel-api.onrender.com/*"
  ]
}
```

Update your service worker to use the production API:
```javascript
const API_BASE = 'https://resume-intel-api.onrender.com';
```

---

## Step 7: Set Up Auth with Supabase

### 7.1 Enable Auth Providers
In Supabase Dashboard → Authentication → Providers:
1. Enable **Email** (for password auth)
2. Enable **Google** (optional, needs Google Cloud setup)
3. Enable **Magic Link** (passwordless, recommended)

### 7.2 Configure Redirect URLs
In Authentication → URL Configuration:
- Site URL: `https://your-dashboard.vercel.app`
- Redirect URLs: Add your extension URL

---

## Environment Variables Summary

### Backend (.env)
```bash
# Required: AI APIs
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# Database
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...

# Caching
UPSTASH_REDIS_REST_URL=https://[id].upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...

# Analytics
POSTHOG_API_KEY=phc_...

# App
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://your-dashboard.vercel.app
```

### Frontend (.env)
```bash
VITE_API_URL=https://resume-intel-api.onrender.com
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://app.posthog.com
```

---

## Cost Breakdown

| Service | Free Tier | When You'll Pay |
|---------|-----------|-----------------|
| Supabase | 500MB, 50K MAUs | >500MB data or >50K users |
| Upstash | 10K commands/day | >10K cache operations/day |
| Render | 750 hrs/month | Need always-on ($7/mo) |
| Vercel | 100GB bandwidth | >100GB bandwidth |
| PostHog | 1M events/month | >1M events |

**For 100 users**: You'll likely stay in free tier for 6+ months.

---

## Scaling Path

When you hit limits:

| Users | Recommended Upgrade | Cost |
|-------|---------------------|------|
| 100-500 | Render Starter ($7/mo) | $7/mo |
| 500-2K | Supabase Pro ($25/mo) | $32/mo |
| 2K-10K | Dedicated Redis ($10/mo) | $42/mo |
| 10K+ | Consider Railway/Fly.io | $50-100/mo |

---

## Quick Start Checklist

- [ ] Create Supabase project
- [ ] Create Upstash Redis database
- [ ] Create PostHog project
- [ ] Deploy backend to Render
- [ ] Deploy dashboard to Vercel
- [ ] Update extension manifest
- [ ] Test end-to-end flow
- [ ] Ship to users! 🚀

---

## Troubleshooting

### Backend not responding
- Check Render logs for errors
- Verify environment variables are set
- If free tier, wait 30s for cold start

### Database connection failed
- Verify `DATABASE_URL` format
- Check Supabase is not paused (pauses after 7 days inactivity on free tier)
- Verify IP is not blocked

### Auth not working
- Check redirect URLs in Supabase
- Verify `SUPABASE_ANON_KEY` in frontend
- Check browser console for CORS errors

---

## Next Steps After Deployment

1. **Set up monitoring**: Render has built-in logs
2. **Add error tracking**: Sentry has a free tier (500K events/month)
3. **Set up uptime monitoring**: [UptimeRobot](https://uptimerobot.com) is free
4. **Keep Render awake**: Use cron-job.org to ping every 14 min

---

*Last updated: December 2024*
