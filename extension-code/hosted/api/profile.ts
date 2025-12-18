import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, getUserFromRequest } from '../lib/supabase';

// Create/refresh a profile row and return bootstrap info.
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
    const user = await getUserFromRequest(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createAdminClient();

    // Upsert profile (id references auth.users)
    const email = user.email || null;
    const fullName = (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || null;
    const avatarUrl = (user.user_metadata as any)?.avatar_url || (user.user_metadata as any)?.picture || null;

    const { data: profile, error: upsertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .single();

    if (upsertError) {
      console.error('Profile upsert error:', upsertError);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    // Determine default master resume (if any)
    const { data: resumes, error: resumesError } = await supabase
      .from('master_resumes')
      .select('id, name, is_default, created_at, updated_at, content_hash')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });

    if (resumesError) {
      console.error('Fetch master resumes error:', resumesError);
      return res.status(500).json({ error: 'Failed to load resumes' });
    }

    const defaultResume = (resumes || []).find((r: any) => r.is_default) || (resumes || [])[0] || null;

    return res.status(200).json({
      profile,
      has_master_resume: Boolean(defaultResume),
      default_master_resume_id: defaultResume?.id || null,
      master_resumes: resumes || [],
    });
  } catch (error: any) {
    console.error('Profile handler error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
}
