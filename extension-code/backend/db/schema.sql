-- Resume Intelligence Database Schema for Supabase
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- USERS TABLE (extends Supabase auth.users)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Subscription info
    plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
    runs_this_month INTEGER DEFAULT 0,
    runs_limit INTEGER DEFAULT 10, -- Free tier: 10 runs/month
    
    -- Preferences
    preferences JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- MASTER RESUMES (user's source resume)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_resumes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Resume content
    name TEXT NOT NULL DEFAULT 'My Resume',
    content JSONB NOT NULL, -- The master resume JSON
    content_hash TEXT NOT NULL, -- SHA256 hash for caching
    
    -- Metadata
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, name)
);

-- Ensure required columns exist if the table was created before this schema version.
ALTER TABLE public.master_resumes
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS content_hash TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill and enforce not-null for content_hash
UPDATE public.master_resumes
SET
    is_default = COALESCE(is_default, false),
    content_hash = COALESCE(content_hash, 'missing')
WHERE is_default IS NULL OR content_hash IS NULL;

ALTER TABLE public.master_resumes
    ALTER COLUMN content_hash SET NOT NULL;

-- Ensure unique constraint on (user_id, name)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'master_resumes_user_name_unique'
            AND conrelid = 'public.master_resumes'::regclass
    ) THEN
        ALTER TABLE public.master_resumes
            ADD CONSTRAINT master_resumes_user_name_unique UNIQUE (user_id, name);
    END IF;
END $$;

-- =============================================================================
-- RUNS (each tailoring job)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    master_resume_id UUID REFERENCES public.master_resumes(id) ON DELETE SET NULL,
    
    -- Job info
    job_title TEXT,
    company TEXT,
    platform TEXT, -- linkedin, greenhouse, workday, etc.
    job_url TEXT,
    job_hash TEXT, -- Hash of raw job text for deduplication
    
    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'extracting', 'rubric', 'evidence', 'embeddings', 
        'selection', 'tailoring', 'latex', 'compiling', 'done', 'error'
    )),
    result TEXT DEFAULT 'pending' CHECK (result IN ('pending', 'success', 'error')),
    error_message TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    runtime_ms INTEGER,
    
    -- Coverage metrics
    coverage_score DECIMAL(5,4), -- 0.0000 to 1.0000
    must_covered INTEGER,
    must_total INTEGER,
    nice_covered INTEGER,
    nice_total INTEGER,
    
    -- Artifacts (stored as JSONB for flexibility)
    artifacts JSONB DEFAULT '{}'::jsonb,
    -- Example: { "pdf": "runs/xxx/resume.pdf", "latex": "runs/xxx/resume.tex", ... }
    
    -- User feedback
    response_received_at TIMESTAMPTZ, -- Did they get an interview?
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    user_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PATCH: Ensure runs table has all columns used by backend
-- =============================================================================
ALTER TABLE public.runs
    ADD COLUMN IF NOT EXISTS job_hash TEXT,
    ADD COLUMN IF NOT EXISTS runtime_ms INTEGER,
    ADD COLUMN IF NOT EXISTS coverage_score DECIMAL(5,4),
    ADD COLUMN IF NOT EXISTS must_covered INTEGER,
    ADD COLUMN IF NOT EXISTS must_total INTEGER,
    ADD COLUMN IF NOT EXISTS nice_covered INTEGER,
    ADD COLUMN IF NOT EXISTS nice_total INTEGER,
    ADD COLUMN IF NOT EXISTS artifacts JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS response_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS job_url TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS job_title TEXT,
    ADD COLUMN IF NOT EXISTS company TEXT,
    ADD COLUMN IF NOT EXISTS platform TEXT,
    ADD COLUMN IF NOT EXISTS master_resume_id UUID REFERENCES public.master_resumes(id) ON DELETE SET NULL;

-- =============================================================================
-- RUN ARTIFACTS (large blobs stored separately)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.run_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    
    artifact_type TEXT NOT NULL, -- jd_rubric, selection_plan, tailored, etc.
    content JSONB, -- For JSON artifacts
    content_text TEXT, -- For text artifacts (latex, txt)
    content_hash TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(run_id, artifact_type)
);

-- =============================================================================
-- EVIDENCE CACHE (cached bullet scores)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.evidence_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Cache key
    resume_hash TEXT NOT NULL,
    rules_hash TEXT NOT NULL,
    
    -- Cached data
    scores JSONB NOT NULL,
    summary JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    
    UNIQUE(resume_hash, rules_hash)
);

-- =============================================================================
-- PATCH: Ensure evidence_cache table has required columns
-- =============================================================================
ALTER TABLE public.evidence_cache
    ADD COLUMN IF NOT EXISTS resume_hash TEXT,
    ADD COLUMN IF NOT EXISTS rules_hash TEXT,
    ADD COLUMN IF NOT EXISTS scores JSONB,
    ADD COLUMN IF NOT EXISTS summary JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_hit_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'evidence_cache' AND column_name = 'resume_hash'
    ) THEN
        ALTER TABLE public.evidence_cache
            ALTER COLUMN resume_hash SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'evidence_cache' AND column_name = 'rules_hash'
    ) THEN
        ALTER TABLE public.evidence_cache
            ALTER COLUMN rules_hash SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'evidence_cache' AND column_name = 'scores'
    ) THEN
        ALTER TABLE public.evidence_cache
            ALTER COLUMN scores SET NOT NULL;
    END IF;
END $$;

-- =============================================================================
-- EMBEDDING CACHE (cached resume embeddings)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.embedding_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Cache key
    resume_hash TEXT NOT NULL,
    embed_key_hash TEXT NOT NULL, -- model + dims + preprocess version
    
    -- Cached data
    embeddings JSONB NOT NULL, -- Array of {bullet_id, vector, text_hash}
    
    -- Metadata
    model TEXT NOT NULL,
    dims INTEGER NOT NULL,
    preprocess_version TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INTEGER DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    
    UNIQUE(resume_hash, embed_key_hash)
);

-- =============================================================================
-- PATCH: Ensure embedding_cache table has required columns
-- =============================================================================
ALTER TABLE public.embedding_cache
    ADD COLUMN IF NOT EXISTS resume_hash TEXT,
    ADD COLUMN IF NOT EXISTS embed_key_hash TEXT,
    ADD COLUMN IF NOT EXISTS embeddings JSONB,
    ADD COLUMN IF NOT EXISTS model TEXT,
    ADD COLUMN IF NOT EXISTS dims INTEGER,
    ADD COLUMN IF NOT EXISTS preprocess_version TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_hit_at TIMESTAMPTZ;

-- Enforce not-null only if the column exists (guards older schemas)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'resume_hash'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN resume_hash SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'embed_key_hash'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN embed_key_hash SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'embeddings'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN embeddings SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'model'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN model SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'dims'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN dims SET NOT NULL;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'preprocess_version'
    ) THEN
        ALTER TABLE public.embedding_cache
            ALTER COLUMN preprocess_version SET NOT NULL;
    END IF;
END $$;

-- Unique index if not present (guarded by column existence)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'resume_hash'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'embed_key_hash'
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_cache_key ON public.embedding_cache(resume_hash, embed_key_hash);
    END IF;
END $$;

-- =============================================================================
-- ANALYTICS EVENTS (lightweight, for custom tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    
    event_name TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    
    -- Context
    session_id TEXT,
    page_url TEXT,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- Master resumes
CREATE INDEX IF NOT EXISTS idx_master_resumes_user ON public.master_resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_master_resumes_hash ON public.master_resumes(content_hash);

-- Runs
CREATE INDEX IF NOT EXISTS idx_runs_user ON public.runs(user_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON public.runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created ON public.runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_job_hash ON public.runs(job_hash);
CREATE INDEX IF NOT EXISTS idx_runs_user_created ON public.runs(user_id, created_at DESC);

-- Run artifacts
CREATE INDEX IF NOT EXISTS idx_run_artifacts_run ON public.run_artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_run_artifacts_type ON public.run_artifacts(run_id, artifact_type);

-- Evidence cache
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'evidence_cache' AND column_name = 'resume_hash'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'evidence_cache' AND column_name = 'rules_hash'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_evidence_cache_key ON public.evidence_cache(resume_hash, rules_hash);
    END IF;
END $$;

-- Embedding cache
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'resume_hash'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'embedding_cache' AND column_name = 'embed_key_hash'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_embedding_cache_key ON public.embedding_cache(resume_hash, embed_key_hash);
    END IF;
END $$;

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON public.analytics_events(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only see/edit their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
    
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Master resumes: Users can only see/edit their own resumes
CREATE POLICY "Users can view own resumes" ON public.master_resumes
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own resumes" ON public.master_resumes
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update own resumes" ON public.master_resumes
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can delete own resumes" ON public.master_resumes
    FOR DELETE USING (auth.uid() = user_id);

-- Runs: Users can only see/edit their own runs
CREATE POLICY "Users can view own runs" ON public.runs
    FOR SELECT USING (auth.uid() = user_id);
    
CREATE POLICY "Users can insert own runs" ON public.runs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
    
CREATE POLICY "Users can update own runs" ON public.runs
    FOR UPDATE USING (auth.uid() = user_id);
    
CREATE POLICY "Users can delete own runs" ON public.runs
    FOR DELETE USING (auth.uid() = user_id);

-- Run artifacts: Users can view artifacts for their runs
CREATE POLICY "Users can view own run artifacts" ON public.run_artifacts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.runs 
            WHERE runs.id = run_artifacts.run_id 
            AND runs.user_id = auth.uid()
        )
    );

-- Analytics: Users can only insert (no read for privacy)
CREATE POLICY "Users can insert own events" ON public.analytics_events
    FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_master_resumes_updated_at
    BEFORE UPDATE ON public.master_resumes
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_runs_updated_at
    BEFORE UPDATE ON public.runs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
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

-- Trigger for new user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Increment runs_this_month when a run completes successfully
CREATE OR REPLACE FUNCTION public.handle_run_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.result = 'success' AND OLD.result != 'success' THEN
        UPDATE public.profiles
        SET runs_this_month = runs_this_month + 1
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_run_completion
    AFTER UPDATE ON public.runs
    FOR EACH ROW EXECUTE FUNCTION public.handle_run_completion();

-- =============================================================================
-- VIEWS (optional, for dashboard queries)
-- =============================================================================

-- User stats view
CREATE OR REPLACE VIEW public.user_stats AS
SELECT 
    p.id as user_id,
    p.email,
    p.plan,
    p.runs_this_month,
    p.runs_limit,
    COUNT(r.id) as total_runs,
    COUNT(r.id) FILTER (WHERE r.result = 'success') as successful_runs,
    COUNT(r.id) FILTER (WHERE r.response_received_at IS NOT NULL) as interviews_received,
    AVG(r.coverage_score) FILTER (WHERE r.result = 'success') as avg_coverage,
    MAX(r.created_at) as last_run_at
FROM public.profiles p
LEFT JOIN public.runs r ON r.user_id = p.id
GROUP BY p.id;

-- =============================================================================
-- STORAGE BUCKET (for PDFs and large files)
-- =============================================================================
-- Run this separately in Supabase Dashboard → Storage → Create bucket

-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('run-artifacts', 'run-artifacts', false);

-- Storage policies (run in SQL editor after creating bucket):
-- CREATE POLICY "Users can upload own artifacts"
-- ON storage.objects FOR INSERT
-- WITH CHECK (
--     bucket_id = 'run-artifacts' AND
--     auth.uid()::text = (storage.foldername(name))[1]
-- );

-- CREATE POLICY "Users can view own artifacts"
-- ON storage.objects FOR SELECT
-- USING (
--     bucket_id = 'run-artifacts' AND
--     auth.uid()::text = (storage.foldername(name))[1]
-- );
