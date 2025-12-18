import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, getUserFromRequest } from '../../lib/supabase';

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

    // Parse query params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string; // 'running', 'done', 'error'

    const supabase = createAdminClient();
    
    // Build query
    let query = supabase
      .from('runs')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data: runs, count, error } = await query;

    if (error) {
      console.error('Fetch runs error:', error);
      return res.status(500).json({ error: 'Failed to fetch runs' });
    }

    return res.status(200).json({
      runs: runs || [],
      total: count || 0,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('Runs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
