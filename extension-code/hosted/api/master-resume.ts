import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { createAdminClient, getUserFromRequest } from '../lib/supabase';

function sha256(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function stableStringify(value: any) {
  // Deterministic-ish stringify for hashing.
  return JSON.stringify(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
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
    const user = await getUserFromRequest(req.headers.authorization as string);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createAdminClient();

    const body = (req.body || {}) as any;
    const name = (body.name || 'My Resume').toString().slice(0, 120);
    const contentInput = body.content;
    if (!contentInput) {
      return res.status(400).json({ error: 'content is required (master resume JSON)' });
    }

    const content = typeof contentInput === 'string' ? JSON.parse(contentInput) : contentInput;
    const contentText = stableStringify(content);
    const contentHash = sha256(contentText);

    // Ensure profile exists (best-effort)
    try {
      await supabase.from('profiles').upsert(
        {
          id: user.id,
          email: user.email || null,
          full_name: (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || null,
          avatar_url: (user.user_metadata as any)?.avatar_url || (user.user_metadata as any)?.picture || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch {
      // ignore
    }

    // Clear existing defaults
    try {
      await supabase.from('master_resumes').update({ is_default: false }).eq('user_id', user.id);
    } catch {
      // ignore
    }

    // Upsert resume
    const { data: resume, error: upsertErr } = await supabase
      .from('master_resumes')
      .upsert(
        {
          user_id: user.id,
          name,
          content,
          content_hash: contentHash,
          is_default: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name' }
      )
      .select('id, user_id, name, content_hash, is_default, created_at, updated_at')
      .single();

    if (upsertErr || !resume) {
      console.error('Master resume upsert error:', upsertErr);
      return res.status(500).json({ error: 'Failed to save master resume' });
    }

    // Optionally compute/store embeddings into embedding_cache.
    // This is a minimal implementation that embeds the entire resume JSON as a single document.
    const openaiKey = process.env.OPENAI_API_KEY;
    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    const preprocessVersion = 'resume_json_v1';

    let embeddingStored = false;
    let embeddingError: string | null = null;

    if (openaiKey) {
      try {
        const openai = new OpenAI({ apiKey: openaiKey });
        const textForEmbedding = contentText.length > 8000 ? contentText.slice(0, 8000) : contentText;
        const textHash = sha256(textForEmbedding);

        const emb = await openai.embeddings.create({
          model: embeddingModel,
          input: textForEmbedding,
        });

        const vector = emb.data?.[0]?.embedding;
        if (Array.isArray(vector) && vector.length) {
          const dims = vector.length;
          const embedKeyHash = sha256(`${embeddingModel}:${dims}:${preprocessVersion}`);

          const embeddingsPayload = [
            {
              bullet_id: 'resume',
              vector,
              text_hash: textHash,
            },
          ];

          const { error: cacheErr } = await supabase
            .from('embedding_cache')
            .upsert(
              {
                resume_hash: contentHash,
                embed_key_hash: embedKeyHash,
                embeddings: embeddingsPayload,
                model: embeddingModel,
                dims,
                preprocess_version: preprocessVersion,
                last_hit_at: new Date().toISOString(),
              },
              { onConflict: 'resume_hash,embed_key_hash' }
            );

          if (cacheErr) {
            embeddingError = cacheErr.message || 'Failed to store embedding cache';
          } else {
            embeddingStored = true;
          }
        }
      } catch (e: any) {
        embeddingError = e?.message || 'Embedding generation failed';
      }
    } else {
      embeddingError = 'OPENAI_API_KEY not set; embeddings skipped';
    }

    return res.status(200).json({
      ok: true,
      resume,
      embeddings: {
        stored: embeddingStored,
        error: embeddingError,
      },
    });
  } catch (error: any) {
    const msg = error?.message || 'Internal server error';
    // JSON.parse failure surfaces here
    return res.status(500).json({ error: msg });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 60,
};
