# Scaling Resume Intelligence: $0/Month Stack

## Overview

This guide migrates the local-only POC to a hosted stack that's **completely free** for up to ~500 users.

## The Stack

| Layer | Service | Free Tier | Why This Choice |
|-------|---------|-----------|-----------------|
| **Database** | Supabase | 500MB, unlimited rows | Postgres + Auth + Storage in one |
| **Cache** | Upstash Redis | 10K commands/day | Serverless Redis, no cold starts |
| **Hosting** | Vercel | 100GB bandwidth | Best DX, edge functions, free SSL |
| **Analytics** | PostHog | 1M events/month | Full product analytics, free |
| **File Storage** | Supabase Storage | 1GB | Resume PDFs, artifacts |

### Cost Breakdown

| Users | Monthly Cost |
|-------|-------------|
| 0-100 | $0 |
| 100-500 | $0 |
| 500-1000 | ~$25 (Supabase Pro) |
| 1000-5000 | ~$50 |
| 5000+ | ~$100+ |

---

## Step 1: Supabase Setup (Database + Auth)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up with GitHub
3. Create new project: `resume-intelligence`
4. Save your credentials:
   - Project URL: `https://xxx.supabase.co`
   - Anon Key: `eyJ...`
   - Service Role Key: `eyJ...` (keep secret!)

### 1.2 Database Schema

Run this in Supabase SQL Editor:

```sql
  -- Enable UUID extension
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  -- Users table (extends Supabase auth.users)
  CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    master_resume_id UUID,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Master resumes
  CREATE TABLE public.master_resumes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT DEFAULT 'Default Resume',
    content JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Job applications / runs
  CREATE TABLE public.runs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    master_resume_id UUID REFERENCES public.master_resumes(id),
    
    -- Job info
    job_title TEXT,
    company TEXT,
    job_url TEXT,
    platform TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending',
    stage TEXT DEFAULT 'IDLE',
    error_message TEXT,
    
    -- Results
    coverage_score DECIMAL(5,2),
    must_covered INTEGER,
    must_total INTEGER,
    nice_covered INTEGER,
    nice_total INTEGER,
    
    -- Artifacts (stored as JSONB for small ones, or paths for large)
    job_payload JSONB,
    jd_rubric JSONB,
    selection_plan JSONB,
    tailored_resume JSONB,
    
    -- Artifact file paths (for PDFs, large JSONs)
    artifacts JSONB DEFAULT '{}',
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- User tracking
    response_received_at TIMESTAMPTZ,
    interview_scheduled_at TIMESTAMPTZ,
    notes TEXT
  );

  -- Evidence score cache (keyed by resume hash + rules hash)
  CREATE TABLE public.evidence_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_resume_hash TEXT NOT NULL,
    rules_hash TEXT NOT NULL,
    scores JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(master_resume_hash, rules_hash)
  );

  -- Embedding cache (keyed by resume hash + embed config hash)
  CREATE TABLE public.embedding_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    master_resume_hash TEXT NOT NULL,
    embed_key_hash TEXT NOT NULL,
    embeddings JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(master_resume_hash, embed_key_hash)
  );

  -- Indexes for performance
  CREATE INDEX idx_runs_user_id ON public.runs(user_id);
  CREATE INDEX idx_runs_status ON public.runs(status);
  CREATE INDEX idx_runs_created_at ON public.runs(created_at DESC);
  CREATE INDEX idx_master_resumes_user_id ON public.master_resumes(user_id);
  CREATE INDEX idx_evidence_cache_lookup ON public.evidence_cache(master_resume_hash, rules_hash);
  CREATE INDEX idx_embedding_cache_lookup ON public.embedding_cache(master_resume_hash, embed_key_hash);

  -- Row Level Security (RLS)
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.master_resumes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.evidence_cache ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.embedding_cache ENABLE ROW LEVEL SECURITY;

  -- Policies: Users can only see their own data
  CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

  CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

  CREATE POLICY "Users can view own resumes" ON public.master_resumes
    FOR ALL USING (auth.uid() = user_id);

  CREATE POLICY "Users can view own runs" ON public.runs
    FOR ALL USING (auth.uid() = user_id);

  -- Cache tables: Service role only (no user access needed)
  CREATE POLICY "Service role can manage evidence cache" ON public.evidence_cache
    FOR ALL USING (auth.role() = 'service_role');

  CREATE POLICY "Service role can manage embedding cache" ON public.embedding_cache
    FOR ALL USING (auth.role() = 'service_role');

  -- Trigger to auto-create profile on user signup
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;

  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

  -- Function to update updated_at timestamp
  CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

  CREATE TRIGGER update_master_resumes_updated_at
    BEFORE UPDATE ON public.master_resumes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

  CREATE TRIGGER update_runs_updated_at
    BEFORE UPDATE ON public.runs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

### 1.3 Enable Auth Providers

In Supabase Dashboard → Authentication → Providers:
- ✅ Email (enabled by default)
- ✅ Google (free, high conversion)
- ✅ GitHub (optional, for devs)

---

## Step 2: Upstash Redis Setup

### 2.1 Create Upstash Database

1. Go to [upstash.com](https://upstash.com)
2. Sign up with GitHub
3. Create Redis database: `resume-intel-cache`
4. Select region closest to your users
5. Save credentials:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### 2.2 What We Cache

| Cache Key Pattern | TTL | Purpose |
|-------------------|-----|---------|
| `evidence:{resumeHash}:{rulesHash}` | 7 days | Evidence scores |
| `embeddings:{resumeHash}:{embedHash}` | 30 days | Resume embeddings |
| `run:{runId}:status` | 5 min | Active run status |
| `rate:{userId}` | 1 hour | Rate limiting |

---

## Step 3: Vercel Deployment

### 3.1 Project Structure for Vercel

```
resume-intelligence/
├── api/                    # Vercel serverless functions
│   ├── analyze.ts          # POST /api/analyze
│   ├── status/[runId].ts   # GET /api/status/:runId
│   ├── download/[...path].ts
│   ├── runs/index.ts       # GET /api/runs
│   ├── chat.ts             # POST /api/chat
│   └── health.ts           # GET /api/health
├── dashboard/              # React dashboard (Vite build)
├── lib/                    # Shared code
│   ├── supabase.ts
│   ├── redis.ts
│   └── pipeline/           # Your existing pipeline code
├── public/
└── vercel.json
```

### 3.2 Environment Variables (Vercel Dashboard)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# AI APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

## Step 4: PostHog Analytics Setup

### 4.1 Create PostHog Project

1. Go to [posthog.com](https://posthog.com)
2. Sign up (free tier = 1M events/month)
3. Create project: `Resume Intelligence`
4. Get your project API key

### 4.2 Key Events to Track

```typescript
// Track these events:
posthog.capture('run_started', {
  platform: 'linkedin',
  has_master_resume: true
});

posthog.capture('run_completed', {
  coverage_score: 0.85,
  must_covered: 8,
  must_total: 10,
  duration_sec: 45
});

posthog.capture('pdf_downloaded', { run_id: '...' });

posthog.capture('interview_marked', {
  days_since_application: 5
});

// User properties
posthog.identify(userId, {
  email: user.email,
  total_runs: 15,
  subscription: 'free'
});
```

---

## Step 5: Implementation Files

### 5.1 Supabase Client

Create `lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side client (uses anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client (uses service role, bypasses RLS)
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
```

### 5.2 Redis Client

Create `lib/redis.ts`:

```typescript
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Cache helpers
export async function getCached<T>(key: string): Promise<T | null> {
  return redis.get(key);
}

export async function setCache(key: string, value: any, ttlSeconds: number) {
  return redis.setex(key, ttlSeconds, value);
}

// Evidence cache
export async function getEvidenceCache(resumeHash: string, rulesHash: string) {
  return getCached(`evidence:${resumeHash}:${rulesHash}`);
}

export async function setEvidenceCache(
  resumeHash: string,
  rulesHash: string,
  scores: any
) {
  return setCache(`evidence:${resumeHash}:${rulesHash}`, scores, 7 * 24 * 3600);
}

// Rate limiting
export async function checkRateLimit(userId: string, limit = 10): Promise<boolean> {
  const key = `rate:${userId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }
  return current <= limit;
}
```

### 5.3 PostHog Client

Create `lib/analytics.ts`:

```typescript
import posthog from 'posthog-js';

export function initAnalytics() {
  if (typeof window !== 'undefined') {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') {
          posthog.opt_out_capturing();
        }
      },
    });
  }
}

export function trackEvent(event: string, properties?: Record<string, any>) {
  posthog.capture(event, properties);
}

export function identifyUser(userId: string, traits?: Record<string, any>) {
  posthog.identify(userId, traits);
}

export function resetUser() {
  posthog.reset();
}
```

---

## Step 6: Migration Path

### Phase 1: Add Supabase Auth (Week 1)

1. Install Supabase client in extension
2. Add login/signup UI to dashboard
3. Store user_id with each run
4. Migrate existing local runs to Supabase

### Phase 2: Move Pipeline to Vercel (Week 2)

1. Convert Express endpoints to Vercel serverless
2. Update extension to call hosted API
3. Add Redis caching layer
4. Test end-to-end

### Phase 3: Analytics + Polish (Week 3)

1. Add PostHog tracking
2. Build analytics dashboard
3. Add outcome tracking (interview received)
4. Launch to beta users

---

## Serverless Function Example

```typescript
// api/analyze.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../lib/supabase';
import { redis, checkRateLimit } from '../lib/redis';
import { trackEvent } from '../lib/analytics';
import { runPipeline } from '../lib/pipeline';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get user from auth header
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Rate limiting
  const allowed = await checkRateLimit(user.id);
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in 1 hour.' });
  }

  const { job_payload, resume_id } = req.body;

  // Create run record
  const { data: run, error: insertError } = await supabaseAdmin
    .from('runs')
    .insert({
      user_id: user.id,
      master_resume_id: resume_id,
      job_title: job_payload.job?.title,
      company: job_payload.job?.company,
      job_url: job_payload.job?.job_url,
      platform: job_payload.job?.platform,
      status: 'running',
      stage: 'ANALYZING',
      job_payload,
      started_at: new Date().toISOString()
    })
    .select()
    .single();

  if (insertError) {
    return res.status(500).json({ error: 'Failed to create run' });
  }

  // Track event
  trackEvent('run_started', {
    user_id: user.id,
    platform: job_payload.job?.platform,
    run_id: run.id
  });

  // Start pipeline (async - don't await)
  runPipeline(run.id, job_payload, resume_id).catch(console.error);

  return res.status(200).json({
    run_id: run.id,
    status: 'running',
    message: 'Pipeline started'
  });
}
```

---

## Free Tier Limits Summary

| Service | Limit | ~100 Users | ~500 Users |
|---------|-------|------------|------------|
| Supabase DB | 500MB | ~50MB used | ~200MB |
| Supabase Auth | Unlimited | ✅ | ✅ |
| Supabase Storage | 1GB | ~100MB | ~500MB |
| Upstash Redis | 10K cmd/day | ~2K/day | ~8K/day |
| Vercel Functions | 100GB-hrs | ~10GB-hrs | ~40GB-hrs |
| Vercel Bandwidth | 100GB | ~5GB | ~20GB |
| PostHog Events | 1M/month | ~50K | ~200K |

**Verdict: Completely free until ~500-1000 users** 🎉

---

## Quick Start Commands

```bash
# Install dependencies
npm install @supabase/supabase-js @upstash/redis posthog-js

# Generate Supabase types
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts

# Deploy to Vercel
vercel --prod
```

---

## Questions?

This setup gives you:
- ✅ User authentication (email + Google)
- ✅ Persistent data storage
- ✅ Multi-device sync
- ✅ Usage analytics
- ✅ Rate limiting
- ✅ Caching for API cost savings

All for **$0/month** at your current scale!
