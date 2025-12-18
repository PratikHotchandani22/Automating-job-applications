import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, getUserFromRequest } from '../lib/supabase';
import { checkRateLimit, trackDailyUsage } from '../lib/redis';
import { trackServerEvent, Events } from '../lib/analytics';

// Free tier limits
const FREE_TIER_DAILY_LIMIT = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1. Authenticate user
    const user = await getUserFromRequest(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
    }

    // 2. Check rate limit (hourly)
    const rateLimit = await checkRateLimit(user.id, 20); // 20 per hour
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
        resetAt: rateLimit.resetAt,
        remaining: rateLimit.remaining,
      });
    }

    // 3. Check daily usage (free tier)
    const dailyUsage = await trackDailyUsage(user.id, 'runs');
    if (dailyUsage > FREE_TIER_DAILY_LIMIT) {
      return res.status(429).json({
        error: `Free tier limit reached (${FREE_TIER_DAILY_LIMIT}/day). Upgrade for unlimited.`,
        dailyUsage,
        limit: FREE_TIER_DAILY_LIMIT,
      });
    }

    // 4. Validate request body
    const { job_payload, resume_id } = req.body || {};
    if (!job_payload?.job) {
      return res.status(400).json({ error: 'job_payload is required' });
    }

    const supabase = createAdminClient();

    // 5. Get master resume (optional - use default if not specified)
    // NOTE: The schema does NOT have profiles.master_resume_id; default is tracked on master_resumes.is_default.
    let masterResumeId = resume_id;
    if (!masterResumeId) {
      const { data: resumes, error: resumeErr } = await supabase
        .from('master_resumes')
        .select('id, is_default, updated_at')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1);

      if (resumeErr) {
        console.error('Failed to load master resume:', resumeErr);
      }

      masterResumeId = resumes?.[0]?.id;
    }

    if (!masterResumeId) {
      return res.status(400).json({
        error: 'No resume found. Please create a resume first.',
      });
    }

    // 6. Create run record
    const { data: run, error: insertError } = await supabase
      .from('runs')
      .insert({
        user_id: user.id,
        master_resume_id: masterResumeId,
        job_title: job_payload.job?.title || job_payload.job?.job_title,
        company: job_payload.job?.company,
        job_url: job_payload.job?.job_url || job_payload.job?.url,
        platform: job_payload.job?.platform || job_payload.job?.source_platform,
        status: 'running',
        stage: 'ANALYZING',
        job_payload,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !run) {
      console.error('Failed to create run:', insertError);
      return res.status(500).json({ error: 'Failed to create run' });
    }

    // 7. Track analytics
    await trackServerEvent(user.id, Events.RUN_STARTED, {
      runId: run.id,
      platform: run.platform,
      jobTitle: run.job_title,
      company: run.company,
    });

    // 8. Start pipeline (async)
    // This calls your existing pipeline code
    startPipelineAsync(run.id, job_payload, masterResumeId, user.id).catch((err) => {
      console.error('Pipeline error:', err);
    });

    // 9. Return immediately
    return res.status(200).json({
      run_id: run.id,
      status: 'running',
      stage: 'ANALYZING',
      message: 'Pipeline started',
      daily_usage: dailyUsage,
      daily_limit: FREE_TIER_DAILY_LIMIT,
    });

  } catch (error: any) {
    console.error('Analyze error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
}

// Async pipeline execution
async function startPipelineAsync(
  runId: string,
  jobPayload: any,
  resumeId: string,
  userId: string
) {
  const supabase = createAdminClient();
  
  try {
    // Get master resume
    const { data: resume } = await supabase
      .from('master_resumes')
      .select('content, content_hash')
      .eq('id', resumeId)
      .single();

    if (!resume) {
      throw new Error('Resume not found');
    }

    // Update status
    const updateStage = async (stage: string, extra?: Record<string, any>) => {
      await supabase
        .from('runs')
        .update({ stage, ...extra })
        .eq('id', runId);
    };

    // Run your existing pipeline stages here
    // For now, simulate with delays
    
    await updateStage('EXTRACTING');
    // await runExtractionStage(...)
    
    await updateStage('RUBRIC');
    // await runRubricStage(...)
    
    await updateStage('EVIDENCE');
    // await runEvidenceStage(...)
    
    await updateStage('EMBEDDINGS');
    // await runEmbeddingStage(...)
    
    await updateStage('SELECTION');
    // await runSelectionStage(...)
    
    await updateStage('ANALYZING');
    // await runTailorStage(...)
    
    await updateStage('GENERATING_LATEX');
    // await runLatexStage(...)
    
    await updateStage('COMPILING_PDF');
    // await runPdfStage(...)
    
    // Mark complete
    await supabase
      .from('runs')
      .update({
        status: 'done',
        stage: 'DONE',
        completed_at: new Date().toISOString(),
        // Add results from pipeline
        // coverage_score: result.coverage,
        // must_covered: result.mustCovered,
        // etc.
      })
      .eq('id', runId);

    // Track completion
    await trackServerEvent(userId, Events.RUN_COMPLETED, {
      runId,
      // coverageScore: result.coverage,
      // durationSec: (Date.now() - startTime) / 1000,
    });

  } catch (error: any) {
    console.error('Pipeline failed:', error);
    
    // Mark failed
    await supabase
      .from('runs')
      .update({
        status: 'error',
        stage: 'ERROR',
        error_message: error.message || 'Pipeline failed',
      })
      .eq('id', runId);

    await trackServerEvent(userId, Events.RUN_FAILED, {
      runId,
      errorMessage: error.message,
    });
  }
}

// Vercel config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 60, // 60 seconds max (Vercel Hobby limit)
};
