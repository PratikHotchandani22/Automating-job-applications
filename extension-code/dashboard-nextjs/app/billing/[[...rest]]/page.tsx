import { auth } from "@clerk/nextjs/server";
import BillingClient from "../BillingClient";

export default async function BillingPage() {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  return <BillingClient />;
}
