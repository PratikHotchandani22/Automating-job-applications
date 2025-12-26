"use client";

/**
 * Example component showing how to use Convex functions
 * This is a reference - you can delete this file once you understand the pattern
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

export function UsersExample() {
  const [clerkId, setClerkId] = useState("user_123");

  // Query: Get user by Clerk ID
  const user = useQuery(api.users.getUserByClerkId, {
    clerkId,
  });

  // Mutation: Create a new user
  const createUser = useMutation(api.users.createUser);
  const [creating, setCreating] = useState(false);

  const handleCreateUser = async () => {
    setCreating(true);
    try {
      const userId = await createUser({
        clerkId: "new_user_" + Date.now(),
        email: "example@email.com",
        fullName: "Example User",
      });
      console.log("User created:", userId);
    } catch (error) {
      console.error("Error creating user:", error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", margin: "1rem" }}>
      <h2>Users Example</h2>
      
      <div>
        <label>
          Clerk ID:
          <input
            value={clerkId}
            onChange={(e) => setClerkId(e.target.value)}
            style={{ marginLeft: "0.5rem" }}
          />
        </label>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <h3>Query Result:</h3>
        {user === undefined && <p>Loading...</p>}
        {user === null && <p>User not found</p>}
        {user && (
          <div>
            <p>Email: {user.email}</p>
            <p>Name: {user.fullName || "N/A"}</p>
            <p>User ID: {user._id}</p>
          </div>
        )}
      </div>

      <button
        onClick={handleCreateUser}
        disabled={creating}
        style={{ marginTop: "1rem" }}
      >
        {creating ? "Creating..." : "Create Test User"}
      </button>
    </div>
  );
}

