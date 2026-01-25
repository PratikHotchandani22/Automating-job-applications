import { auth, clerkClient } from "@clerk/nextjs/server";
import type { JwtPayload } from "@clerk/types";

export const FEATURE_KEYS = [
  "50_runsper_month",
  "latex_resume_download",
  "ml_based_resume_tailoring",
  "resume_refactoring_with_llm",
  "unlimited_runs",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface FeatureAccess {
  userId: string;
  features: Record<FeatureKey, boolean>;
  planLabel: "free" | "premium";
  source: "sessionClaims" | "userMetadata" | "fallback";
  has: (feature: FeatureKey) => boolean;
}

function normalizeFeatureSource(input: unknown): Set<string> {
  const features = new Set<string>();

  if (!input) return features;

  if (Array.isArray(input)) {
    input.forEach((value) => {
      if (typeof value === "string") {
        features.add(value);
      }
    });
    return features;
  }

  if (typeof input === "string") {
    input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => features.add(value));
    return features;
  }

  if (typeof input === "object") {
    Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
      if (value) {
        features.add(key);
      }
    });
  }

  return features;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? (value as UnknownRecord) : undefined;
}

function extractFeatureKeysFromClaims(sessionClaims: JwtPayload | null): Set<string> {
  if (!sessionClaims) return new Set();

  const claims = sessionClaims as UnknownRecord;
  const org = asRecord(claims["org"]);
  const orgPublicMetadata = asRecord(org?.["publicMetadata"]);

  const candidates = [
    claims["features"],
    asRecord(claims["entitlements"])?.["features"],
    asRecord(claims["billing"])?.["features"],
    asRecord(claims["publicMetadata"])?.["features"],
    asRecord(claims["privateMetadata"])?.["features"],
    asRecord(claims["metadata"])?.["features"],
    org?.["features"],
    orgPublicMetadata?.["features"],
  ];

  const features = new Set<string>();
  for (const candidate of candidates) {
    for (const value of normalizeFeatureSource(candidate)) {
      features.add(value);
    }
  }

  return features;
}

function toFeatureAccess(
  userId: string,
  featureKeys: Set<string>,
  source: FeatureAccess["source"]
): FeatureAccess {
  const features = FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = featureKeys.has(key);
    return acc;
  }, {} as Record<FeatureKey, boolean>);

  const planLabel =
    features.unlimited_runs || features.ml_based_resume_tailoring
      ? "premium"
      : "free";

  return {
    userId,
    features,
    planLabel,
    source,
    has: (feature: FeatureKey) => Boolean(features[feature]),
  };
}

export async function getAuthOrThrow() {
  const authState = await auth();
  if (!authState.userId) {
    const error = new Error("Unauthorized");
    (error as any).code = "UNAUTHORIZED";
    throw error;
  }
  return authState;
}

export async function getFeatureAccessForUser(
  userId: string
): Promise<FeatureAccess> {
  const authState = await auth();

  if (authState.userId === userId) {
    const featureKeys = extractFeatureKeysFromClaims(authState.sessionClaims);
    if (featureKeys.size > 0) {
      return toFeatureAccess(userId, featureKeys, "sessionClaims");
    }
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadataFeatures =
      asRecord(user.publicMetadata)?.["features"] ||
      asRecord(user.privateMetadata)?.["features"] ||
      asRecord(user.unsafeMetadata)?.["features"];
    const featureKeys = normalizeFeatureSource(metadataFeatures);
    if (featureKeys.size > 0) {
      return toFeatureAccess(userId, featureKeys, "userMetadata");
    }
  } catch (error) {
    console.warn("Failed to read Clerk user metadata for features:", error);
  }

  console.warn(
    "No Clerk Billing feature claims detected; defaulting to free access."
  );
  return toFeatureAccess(userId, new Set(), "fallback");
}
