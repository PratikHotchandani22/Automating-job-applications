import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import BillingClient from "../BillingClient";

export default async function BillingPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <BillingClient />;
}
