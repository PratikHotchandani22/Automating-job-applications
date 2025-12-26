"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";

export default function UserOnboarding() {
  const { user: clerkUser, isLoaded } = useUser();
  const [step, setStep] = useState<"checking" | "create" | "complete">("checking");
  
  const convexUser = useQuery(
    api.users.getUserByClerkId,
    clerkUser && isLoaded ? { clerkId: clerkUser.id } : "skip"
  );
  
  const createUser = useMutation(api.users.createUser);
  const [creating, setCreating] = useState(false);

  const handleCreateUser = async () => {
    if (!clerkUser || creating) return;
    
    setCreating(true);
    try {
      await createUser({
        clerkId: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress || "",
        fullName: clerkUser.fullName || undefined,
        avatarUrl: clerkUser.imageUrl || undefined,
      });
      setStep("complete");
    } catch (error) {
      console.error("Error creating user:", error);
    } finally {
      setCreating(false);
    }
  };

  // Auto-create user if doesn't exist
  if (isLoaded && clerkUser && convexUser === null && step === "checking" && !creating) {
    handleCreateUser();
  }

  if (!isLoaded) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!clerkUser) {
    return (
      <div className="empty-state-container">
        <div className="empty-state-icon">👤</div>
        <h3>Please Sign In</h3>
        <p className="hint">You need to sign in to use the Resume Intelligence Platform.</p>
      </div>
    );
  }

  if (convexUser === undefined || step === "create") {
    return (
      <div className="empty-state-container">
        <div className="empty-state-icon">⚙️</div>
        <h3>Setting up your account...</h3>
        <p className="hint">We're creating your profile. This will only take a moment.</p>
        {creating && <div className="spinner" style={{ marginTop: "1rem" }} />}
      </div>
    );
  }

  if (convexUser === null) {
    return (
      <div className="empty-state-container">
        <div className="empty-state-icon">👋</div>
        <h3>Welcome!</h3>
        <p className="hint">Let's set up your account to get started.</p>
        <button className="primary" onClick={handleCreateUser} disabled={creating} style={{ marginTop: "1rem" }}>
          {creating ? "Creating..." : "Create Account"}
        </button>
      </div>
    );
  }

  // User exists, show nothing (render children)
  return null;
}

