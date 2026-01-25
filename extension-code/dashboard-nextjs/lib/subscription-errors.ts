export type SubscriptionErrorCode =
  | "RUN_LIMIT_EXCEEDED"
  | "PREMIUM_FEATURE"
  | "EXPORT_RESTRICTED";

export interface SubscriptionErrorPayload {
  error: string;
  code: SubscriptionErrorCode;
  upgrade_url: string;
  required_feature?: string;
  limit?: number;
  current?: number;
  remaining?: number;
}

interface SubscriptionErrorParams {
  code: SubscriptionErrorCode;
  message: string;
  requiredFeature?: string;
  limit?: number;
  current?: number;
  remaining?: number;
}

export function buildSubscriptionError(
  params: SubscriptionErrorParams
): SubscriptionErrorPayload {
  return {
    error: params.message,
    code: params.code,
    upgrade_url: "/billing",
    required_feature: params.requiredFeature,
    limit: params.limit,
    current: params.current,
    remaining: params.remaining,
  };
}
