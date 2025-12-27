"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserProfile, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function BillingClient() {
  const { user: clerkUser, isLoaded } = useUser();
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser ? { clerkId: clerkUser.id } : "skip"
  );
  const createUser = useMutation(api.users.createUser);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoaded || !clerkUser || convexUser !== null || creating) return;
    const createProfile = async () => {
      setCreating(true);
      try {
        await createUser({
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0]?.emailAddress || "",
          fullName: clerkUser.fullName || undefined,
          avatarUrl: clerkUser.imageUrl || undefined,
        });
      } catch (error) {
        console.error("Error creating user:", error);
      } finally {
        setCreating(false);
      }
    };
    createProfile();
  }, [isLoaded, clerkUser, convexUser, creating, createUser]);

  const resumes = useQuery(
    api.masterResumes.getMasterResumes,
    convexUser ? { userId: convexUser._id } : "skip"
  );

  if (!isLoaded || !clerkUser || convexUser === undefined || convexUser === null || creating) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  const resumeCount = resumes?.length || 0;
  const resumeStatus = resumeCount ? "Complete" : "Not started";

  return (
    <div className="page-grid">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Setup your workspace</h2>
            <p className="hint">Add a master resume and choose a plan to unlock the full workflow.</p>
          </div>
        </div>

        <div className="setup-grid">
          <div className="setup-card">
            <div className="setup-card-head">
              <div>
                <h3>Master resume</h3>
                <p className="hint">Upload or create a master resume to power tailoring.</p>
              </div>
              <span className={`setup-status ${resumeCount ? "done" : "pending"}`}>{resumeStatus}</span>
            </div>
            <div className="setup-actions">
              <Link href="/settings" className="primary small">
                {resumeCount ? "Manage resumes" : "Upload resume"}
              </Link>
              <span className="hint">
                {resumeCount ? `${resumeCount} saved` : "No resumes added yet"}
              </span>
            </div>
          </div>

          <div className="setup-card">
            <div className="setup-card-head">
              <div>
                <h3>Subscription plan</h3>
                <p className="hint">Review plans to unlock premium models and higher run limits.</p>
              </div>
              <span className="setup-status pending">Free by default</span>
            </div>
            <div className="setup-actions">
              <a className="ghost small" href="#billing-profile">
                Manage plan
              </a>
              <span className="hint">Billing updates are handled by Clerk.</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel" id="billing-profile">
        <UserProfile routing="path" path="/billing" />
      </div>
    </div>
  );
}
