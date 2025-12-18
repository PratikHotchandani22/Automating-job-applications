/**
 * Analytics Client
 * 
 * Lightweight PostHog client for server-side analytics.
 * Falls back to console logging if PostHog is not configured.
 */

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com';

const isPostHogConfigured = Boolean(POSTHOG_API_KEY);

/**
 * Send event to PostHog
 */
async function sendToPostHog(eventName, distinctId, properties = {}) {
  if (!isPostHogConfigured) {
    return null;
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        event: eventName,
        distinct_id: distinctId || 'anonymous',
        properties: {
          ...properties,
          $lib: 'resume-intelligence-backend',
          $lib_version: '1.0.0'
        },
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      console.error(`PostHog error: ${response.status}`);
      return null;
    }

    return { ok: true };
  } catch (error) {
    console.error('PostHog capture failed:', error);
    return null;
  }
}

/**
 * Check if analytics is configured
 */
export function isConfigured() {
  return isPostHogConfigured;
}

/**
 * Track a general event
 */
export async function track(eventName, properties = {}, userId = null) {
  if (isPostHogConfigured) {
    return await sendToPostHog(eventName, userId, properties);
  }

  // Fallback: log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Analytics] ${eventName}:`, { userId, ...properties });
  }
  return { ok: true, local: true };
}

/**
 * Identify a user (set user properties)
 */
export async function identify(userId, traits = {}) {
  if (!userId) return null;

  if (isPostHogConfigured) {
    return await sendToPostHog('$identify', userId, {
      $set: traits
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Analytics] Identify:`, { userId, ...traits });
  }
  return { ok: true, local: true };
}

// =============================================================================
// Pre-defined Events
// =============================================================================

/**
 * Track run started
 */
export async function trackRunStarted(userId, runId, properties = {}) {
  return await track('run_started', {
    run_id: runId,
    platform: properties.platform,
    job_title: properties.jobTitle,
    company: properties.company,
    ...properties
  }, userId);
}

/**
 * Track run completed
 */
export async function trackRunCompleted(userId, runId, properties = {}) {
  return await track('run_completed', {
    run_id: runId,
    duration_ms: properties.durationMs,
    coverage_score: properties.coverageScore,
    must_covered: properties.mustCovered,
    must_total: properties.mustTotal,
    nice_covered: properties.niceCovered,
    nice_total: properties.niceTotal,
    cache_hits: properties.cacheHits,
    ...properties
  }, userId);
}

/**
 * Track run failed
 */
export async function trackRunFailed(userId, runId, properties = {}) {
  return await track('run_failed', {
    run_id: runId,
    stage: properties.stage,
    error_type: properties.errorType,
    error_message: properties.errorMessage?.substring(0, 200),
    ...properties
  }, userId);
}

/**
 * Track artifact downloaded
 */
export async function trackDownload(userId, runId, artifactType) {
  return await track('artifact_downloaded', {
    run_id: runId,
    artifact_type: artifactType
  }, userId);
}

/**
 * Track interview received (success metric!)
 */
export async function trackInterviewReceived(userId, runId, properties = {}) {
  return await track('interview_received', {
    run_id: runId,
    days_since_application: properties.daysSinceApplication,
    platform: properties.platform,
    ...properties
  }, userId);
}

/**
 * Track user signup
 */
export async function trackSignup(userId, properties = {}) {
  await identify(userId, {
    email: properties.email,
    signup_source: properties.source,
    created_at: new Date().toISOString()
  });
  
  return await track('user_signed_up', {
    signup_source: properties.source,
    ...properties
  }, userId);
}

/**
 * Track user limit reached
 */
export async function trackLimitReached(userId, properties = {}) {
  return await track('run_limit_reached', {
    plan: properties.plan,
    runs_this_month: properties.runsThisMonth,
    runs_limit: properties.runsLimit,
    ...properties
  }, userId);
}

/**
 * Track chat interaction
 */
export async function trackChatMessage(userId, runId, properties = {}) {
  return await track('chat_message_sent', {
    run_id: runId,
    message_length: properties.messageLength,
    response_time_ms: properties.responseTimeMs,
    ...properties
  }, userId);
}

/**
 * Track explainability tab viewed
 */
export async function trackExplainView(userId, runId, tabName) {
  return await track('explain_tab_viewed', {
    run_id: runId,
    tab_name: tabName
  }, userId);
}

/**
 * Track feature flag evaluation (for A/B testing)
 */
export async function trackFeatureFlag(userId, flagName, value) {
  return await track('$feature_flag_called', {
    $feature_flag: flagName,
    $feature_flag_response: value
  }, userId);
}

// =============================================================================
// Batch tracking for efficiency
// =============================================================================

let eventBatch = [];
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 5000;
let batchTimer = null;

/**
 * Queue event for batch sending
 */
export function queueEvent(eventName, properties = {}, userId = null) {
  eventBatch.push({
    event: eventName,
    distinct_id: userId || 'anonymous',
    properties,
    timestamp: new Date().toISOString()
  });

  // Flush if batch is full
  if (eventBatch.length >= BATCH_SIZE) {
    flushBatch();
  }

  // Set timer for periodic flush
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      flushBatch();
      batchTimer = null;
    }, BATCH_INTERVAL_MS);
  }
}

/**
 * Flush queued events
 */
export async function flushBatch() {
  if (eventBatch.length === 0) return;
  if (!isPostHogConfigured) {
    eventBatch = [];
    return;
  }

  const events = [...eventBatch];
  eventBatch = [];

  try {
    await fetch(`${POSTHOG_HOST}/batch/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        api_key: POSTHOG_API_KEY,
        batch: events
      })
    });
  } catch (error) {
    console.error('PostHog batch send failed:', error);
  }
}

// Flush on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => flushBatch());
  process.on('SIGINT', () => {
    flushBatch();
    process.exit();
  });
}

export default {
  isConfigured,
  track,
  identify,
  trackRunStarted,
  trackRunCompleted,
  trackRunFailed,
  trackDownload,
  trackInterviewReceived,
  trackSignup,
  trackLimitReached,
  trackChatMessage,
  trackExplainView,
  trackFeatureFlag,
  queueEvent,
  flushBatch
};
