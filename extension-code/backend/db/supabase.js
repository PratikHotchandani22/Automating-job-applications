/**
 * Supabase Database Client
 * 
 * Lightweight client for Supabase with connection pooling.
 * Falls back to local file storage if Supabase is not configured.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Check if Supabase is configured
const isSupabaseConfigured = Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY));

// Service client (for server-side operations, bypasses RLS)
let supabaseAdmin = null;
if (isSupabaseConfigured && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Anon client (for client-side operations, respects RLS)
let supabaseClient = null;
if (isSupabaseConfigured && SUPABASE_ANON_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Get the admin client (bypasses RLS)
 * Use for server-side operations
 */
export function getAdminClient() {
  if (!supabaseAdmin) {
    console.warn('Supabase admin client not configured. Using local storage.');
    return null;
  }
  return supabaseAdmin;
}

/**
 * Get the public client (respects RLS)
 * Use for client-side operations
 */
export function getClient() {
  if (!supabaseClient) {
    console.warn('Supabase client not configured. Using local storage.');
    return null;
  }
  return supabaseClient;
}

/**
 * Check if Supabase is available
 */
export function isDbConfigured() {
  return isSupabaseConfigured;
}

// =============================================================================
// User Operations
// =============================================================================

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  return data;
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, updates) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
  return data;
}

/**
 * Check if user can create a new run (within limits)
 */
export async function canUserCreateRun(userId) {
  const profile = await getUserProfile(userId);
  if (!profile) return { allowed: true, reason: 'no_profile' }; // Allow if no DB

  if (profile.runs_this_month >= profile.runs_limit) {
    return { 
      allowed: false, 
      reason: 'limit_reached',
      current: profile.runs_this_month,
      limit: profile.runs_limit
    };
  }
  return { allowed: true, remaining: profile.runs_limit - profile.runs_this_month };
}

// =============================================================================
// Master Resume Operations
// =============================================================================

/**
 * Get user's master resumes
 */
export async function getMasterResumes(userId) {
  const db = getAdminClient();
  if (!db) return [];

  const { data, error } = await db
    .from('master_resumes')
    .select('id, name, content_hash, is_default, created_at, updated_at')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching master resumes:', error);
    return [];
  }
  return data || [];
}

/**
 * Get a specific master resume with content
 */
export async function getMasterResume(userId, resumeId) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('master_resumes')
    .select('*')
    .eq('id', resumeId)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching master resume:', error);
    return null;
  }
  return data;
}

/**
 * Create or update a master resume
 */
export async function upsertMasterResume(userId, name, content, contentHash) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('master_resumes')
    .upsert({
      user_id: userId,
      name,
      content,
      content_hash: contentHash,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,name'
    })
    .select()
    .single();

  if (error) {
    console.error('Error upserting master resume:', error);
    throw error;
  }
  return data;
}

// =============================================================================
// Run Operations
// =============================================================================

/**
 * Create a new run
 */
export async function createRun(userId, runData) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('runs')
    .insert({
      user_id: userId,
      ...runData
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating run:', error);
    throw error;
  }
  return data;
}

/**
 * Update a run
 */
export async function updateRun(runId, updates) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('runs')
    .update(updates)
    .eq('id', runId)
    .select()
    .single();

  if (error) {
    console.error('Error updating run:', error);
    throw error;
  }
  return data;
}

/**
 * Get runs for a user
 */
export async function getUserRuns(userId, options = {}) {
  const db = getAdminClient();
  if (!db) return [];

  const { limit = 50, offset = 0, status = null } = options;

  let query = db
    .from('runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching runs:', error);
    return [];
  }
  return data || [];
}

/**
 * Get a specific run
 */
export async function getRun(runId) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) {
    console.error('Error fetching run:', error);
    return null;
  }
  return data;
}

// =============================================================================
// Run Artifacts Operations
// =============================================================================

/**
 * Store a run artifact
 */
export async function storeArtifact(runId, artifactType, content, contentHash = null) {
  const db = getAdminClient();
  if (!db) return null;

  const isJson = typeof content === 'object';
  
  const { data, error } = await db
    .from('run_artifacts')
    .upsert({
      run_id: runId,
      artifact_type: artifactType,
      content: isJson ? content : null,
      content_text: isJson ? null : content,
      content_hash: contentHash
    }, {
      onConflict: 'run_id,artifact_type'
    })
    .select()
    .single();

  if (error) {
    console.error('Error storing artifact:', error);
    throw error;
  }
  return data;
}

/**
 * Get a run artifact
 */
export async function getArtifact(runId, artifactType) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('run_artifacts')
    .select('*')
    .eq('run_id', runId)
    .eq('artifact_type', artifactType)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('Error fetching artifact:', error);
    return null;
  }
  return data;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get cached evidence scores
 */
export async function getCachedEvidenceScores(resumeHash, rulesHash) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('evidence_cache')
    .select('*')
    .eq('resume_hash', resumeHash)
    .eq('rules_hash', rulesHash)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching evidence cache:', error);
    return null;
  }

  if (data) {
    // Increment hit count
    db.from('evidence_cache')
      .update({ hit_count: data.hit_count + 1, last_hit_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {});
  }

  return data;
}

/**
 * Cache evidence scores
 */
export async function cacheEvidenceScores(resumeHash, rulesHash, scores, summary) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('evidence_cache')
    .upsert({
      resume_hash: resumeHash,
      rules_hash: rulesHash,
      scores,
      summary
    }, {
      onConflict: 'resume_hash,rules_hash'
    })
    .select()
    .single();

  if (error) {
    console.error('Error caching evidence scores:', error);
    return null;
  }
  return data;
}

/**
 * Get cached embeddings
 */
export async function getCachedEmbeddings(resumeHash, embedKeyHash) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('embedding_cache')
    .select('*')
    .eq('resume_hash', resumeHash)
    .eq('embed_key_hash', embedKeyHash)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching embedding cache:', error);
    return null;
  }

  if (data) {
    // Increment hit count
    db.from('embedding_cache')
      .update({ hit_count: data.hit_count + 1, last_hit_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {});
  }

  return data;
}

/**
 * Cache embeddings
 */
export async function cacheEmbeddings(resumeHash, embedKeyHash, embeddings, config) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('embedding_cache')
    .upsert({
      resume_hash: resumeHash,
      embed_key_hash: embedKeyHash,
      embeddings,
      model: config.embeddingModel,
      dims: config.embeddingDims,
      preprocess_version: config.preprocessVersion
    }, {
      onConflict: 'resume_hash,embed_key_hash'
    })
    .select()
    .single();

  if (error) {
    console.error('Error caching embeddings:', error);
    return null;
  }
  return data;
}

// =============================================================================
// Analytics Operations
// =============================================================================

/**
 * Track an analytics event
 */
export async function trackEvent(eventName, properties = {}, context = {}) {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from('analytics_events')
    .insert({
      user_id: context.userId || null,
      event_name: eventName,
      properties,
      session_id: context.sessionId,
      page_url: context.pageUrl,
      user_agent: context.userAgent
    });

  if (error) {
    console.error('Error tracking event:', error);
  }
  return data;
}

export default {
  getClient,
  getAdminClient,
  isDbConfigured,
  getUserProfile,
  updateUserProfile,
  canUserCreateRun,
  getMasterResumes,
  getMasterResume,
  upsertMasterResume,
  createRun,
  updateRun,
  getUserRuns,
  getRun,
  storeArtifact,
  getArtifact,
  getCachedEvidenceScores,
  cacheEvidenceScores,
  getCachedEmbeddings,
  cacheEmbeddings,
  trackEvent
};
