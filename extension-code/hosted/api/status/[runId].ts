import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, getUserFromRequest } from '../../lib/supabase';
import { getRunStatusCache, setRunStatusCache } from '../../lib/redis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate
    const user = await getUserFromRequest(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { runId } = req.query;
    if (!runId || typeof runId !== 'string') {
      return res.status(400).json({ error: 'runId is required' });
    }

    // Check cache first (for active runs being polled)
    const cached = await getRunStatusCache(runId);
    if (cached) {
      return res.status(200).json(cached);
    }

    // Fetch from database
    const supabase = createAdminClient();
    const { data: run, error } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', user.id) // Security: user can only see their own runs
      .single();

    if (error || !run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Build response
    const response = {
      run_id: run.id,
      status: run.status,
      stage: run.stage,
      message: getStageMessage(run.stage),
      error: run.error_message,
      job_title: run.job_title,
      company: run.company,
      platform: run.platform,
      coverage: run.coverage_score,
      must_covered: run.must_covered,
      must_total: run.must_total,
      nice_covered: run.nice_covered,
      nice_total: run.nice_total,
      started_at: run.started_at,
      completed_at: run.completed_at,
      artifacts: run.artifacts,
    };

    // Cache if still running (for frequent polling)
    if (run.status === 'running') {
      await setRunStatusCache(runId, response);
    }

    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function getStageMessage(stage: string): string {
  const messages: Record<string, string> = {
    IDLE: 'Waiting to start...',
    EXTRACTING: 'Extracting job details...',
    RUBRIC: 'Analyzing requirements...',
    EVIDENCE: 'Scoring resume bullets...',
    EMBEDDINGS: 'Computing semantic matches...',
    SELECTION: 'Selecting best bullets...',
    ANALYZING: 'Tailoring resume...',
    GENERATING_LATEX: 'Generating document...',
    COMPILING_PDF: 'Compiling PDF...',
    DONE: 'Complete!',
    ERROR: 'An error occurred',
  };
  return messages[stage] || 'Processing...';
}
