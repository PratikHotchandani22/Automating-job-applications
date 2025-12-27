import { auth } from "@clerk/nextjs/server";
import BillingClient from "../BillingClient";

export default function BillingPage() {
  const { userId, redirectToSignIn } = auth();

  if (!userId) {
    return redirectToSignIn();
  }

  return <BillingClient />;
}
