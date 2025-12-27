import { NextResponse } from "next/server";
import { getAuthOrThrow, getFeatureAccessForUser } from "@/lib/featureAccess";

export async function GET() {
  try {
    const authState = await getAuthOrThrow();
    const featureAccess = await getFeatureAccessForUser(authState.userId);

    return NextResponse.json({
      plan: featureAccess.planLabel,
      features: featureAccess.features,
      source: featureAccess.source,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
