"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function HomePage() {
  const router = useRouter();
  const { user: clerkUser, isLoaded } = useUser();
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );
  const resumes = useQuery(
    api.masterResumes.getMasterResumes,
    convexUser ? { userId: convexUser._id } : "skip"
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (!clerkUser) {
      router.replace("/sign-in");
      return;
    }
    if (convexUser === undefined) return;
    if (convexUser === null) {
      router.replace("/billing");
      return;
    }
    if (resumes === undefined) return;
    if (resumes.length === 0) {
      router.replace("/billing");
      return;
    }
    router.replace("/overview");
  }, [isLoaded, clerkUser, convexUser, resumes, router]);

  return (
    <div className="loading-state">
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  );
}
