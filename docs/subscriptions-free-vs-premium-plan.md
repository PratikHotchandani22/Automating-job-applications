# Subscriptions: Free vs Premium Plan

## Overview

This document provides a comprehensive analysis of the Resume Intelligence Platform's current architecture and a detailed implementation plan for adding Free vs Premium subscription tiers using Clerk Billing. The goal is to enable monetization while maintaining a great user experience for free users and providing clear value for premium subscribers.

**Key Constraints:**
- Next.js 15 App Router with Clerk v5 authentication
- Use ONLY Clerk's Next.js Dashboard approach (NOT the React dashboard)
- Server-side subscription enforcement (API routes, server actions, middleware)
- Minimal refactoring—incremental changes over rewrites

---

## Current System Summary

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15 (App Router) | Dashboard UI |
| Auth | Clerk v5 (`@clerk/nextjs`) | Authentication & user management |
| Database | Convex | Real-time database, file storage |
| LLM | OpenAI (gpt-4o-mini) | Resume parsing, tailoring, rubric extraction |
| PDF | YtoTech LaTeX API | LaTeX to PDF compilation |
| Extension | Chrome Extension | Job scraping from browser tabs |

### File Structure Overview

```
extension-code/dashboard-nextjs/
├── app/
│   ├── api/
│   │   ├── analyze/route.ts      # Main tailoring endpoint
│   │   ├── generate-pdf/route.ts # LaTeX → PDF
│   │   ├── parse-resume/route.ts # File parsing
│   │   └── sync-jobs/route.ts    # Extension job sync
│   ├── layout.tsx                # ClerkProvider wrapper
│   ├── middleware.ts             # clerkMiddleware
│   ├── overview/page.tsx
│   ├── runs/page.tsx
│   ├── run/[runId]/page.tsx
│   ├── settings/page.tsx
│   └── start-run/page.tsx
├── components/
│   ├── AppShell.tsx              # Main layout with Clerk UI
│   ├── TailoredResumeView.tsx    # Resume preview/editing
│   ├── ResumeEditor.tsx
│   └── UserOnboarding.tsx
├── convex/
│   ├── schema.ts                 # Database schema
│   ├── users.ts                  # User CRUD
│   ├── runs.ts                   # Pipeline run tracking
│   ├── resumeExtraction.ts       # LLM extraction action
│   ├── resumePipeline.ts         # Backend pipeline integration
│   └── ... (other tables)
└── middleware.ts                 # Clerk authentication
```

### Core User Flows

1. **Sign In / Sign Up**
   - Entry: `ClerkProvider` in `app/layout.tsx`
   - Auth: `clerkMiddleware` in `middleware.ts`
   - UI: `SignInButton`, `SignUpButton`, `UserButton` in `AppShell.tsx`
   - User creation: `UserOnboarding.tsx` → `convex/users.ts:createUser`

2. **Resume Upload / Parsing**
   - UI: `app/settings/page.tsx` → file input
   - API: `app/api/parse-resume/route.ts` (mammoth/pdf-parse)
   - LLM: `convex/resumeExtraction.ts:extractResumeData` (OpenAI)
   - Storage: `convex/masterResumes.ts`, `convex/resumeBullets.ts`

3. **Job Description Ingestion**
   - Source: Chrome extension scrapes job pages
   - Communication: `postMessage` / `chrome.runtime.sendMessage`
   - Sync: `app/api/sync-jobs/route.ts` → `convex/jobs.ts`

4. **Tailoring Pipeline**
   - Trigger: `app/start-run/page.tsx` → `app/api/analyze/route.ts`
   - Steps: Clean JD → Structure JD → Extract Rubric → Tailor Resume → Generate LaTeX
   - Storage: `convex/runs.ts`, `convex/jdRubrics.ts`, `convex/tailoredResumes.ts`

5. **Output Generation**
   - LaTeX: Generated inline in `app/api/analyze/route.ts`
   - PDF: `app/api/generate-pdf/route.ts` → YtoTech API
   - Artifacts: `convex/generatedArtifacts.ts`

---

## Current Tailoring Pipeline Map

| Step | Stage | Input | Output | File/Function | LLM Cost |
|------|-------|-------|--------|---------------|----------|
| 1 | extracting | Raw JD text | Cleaned JD | `route.ts:cleanJobDescription()` | ~$0.002 |
| 2 | extracting | Cleaned JD | Structured sections | `route.ts:structureJobDescription()` | ~$0.003 |
| 3 | rubric_generating | Cleaned JD | Requirements rubric | `route.ts` OpenAI call | ~$0.005 |
| 4 | tailoring | Rubric + Master Resume | Tailored resume JSON | `route.ts` OpenAI call | ~$0.010 |
| 5 | generating_latex | Tailored JSON | LaTeX source | `route.ts:generateSimpleLatex()` | $0 |
| 6 | generating_pdf | LaTeX | PDF binary | `generate-pdf/route.ts` | $0 (external) |

**Total estimated cost per run:** ~$0.02 (varies by content length)

### Cost Drivers
- **LLM Calls:** 4 calls per run (cleaning, structuring, rubric, tailoring)
- **Embedding:** Currently not used in simple flow (backend has embedding capability)
- **PDF:** External free API (YtoTech)

---

## Current Clerk/Auth Integration

### Middleware (`middleware.ts`)

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    const authState = await auth();
    // Clerk handles redirect for unauthenticated users
  }
});
```

### API Route Auth Pattern (`app/api/analyze/route.ts`)

```typescript
import { auth } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... rest of handler
}
```

### Client-Side Auth (`components/AppShell.tsx`)

```typescript
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

<SignedIn>
  <UserButton />
  {/* Authenticated content */}
</SignedIn>
<SignedOut>
  <SignInButton />
</SignedOut>
```

### Current User Schema (`convex/schema.ts`)

```typescript
users: defineTable({
  clerkId: v.string(),
  email: v.string(),
  fullName: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  defaultMasterResumeId: v.optional(v.id("masterResumes")),
  settings: v.optional(v.object({
    preferredModels: v.optional(v.array(v.string())),
    embeddingModel: v.optional(v.string()),
    // ... other settings
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

**Note:** No subscription/plan fields exist currently. Plan data should come from Clerk, not be duplicated in Convex.

---

## Target Subscription Model (Free vs Premium)

### Feature Matrix

| Feature | Free | Premium |
|---------|------|---------|
| **Runs per month** | 5 | Unlimited |
| **Master resumes** | 1 | 5 |
| **Job history** | 30 days | Unlimited |
| **PDF downloads** | Watermark | Clean |
| **LLM model** | gpt-4o-mini | gpt-4o / gpt-4-turbo |
| **Priority queue** | No | Yes |
| **Export formats** | PDF only | PDF + LaTeX + JSON |
| **Email support** | Community | Priority |

### What Gets Gated Where

| Gate Type | Location | Enforcement |
|-----------|----------|-------------|
| Run limit | API route | Server-side (hard block) |
| Resume limit | Convex mutation | Server-side (reject insert) |
| Model selection | API route | Server-side (override to mini) |
| PDF watermark | PDF generation | Server-side (modify LaTeX) |
| Export formats | UI + API | UI hides + API rejects |

### Telemetry Per Run

Add to `runs` table:

```typescript
planUsed: v.optional(v.union(v.literal("free"), v.literal("premium"))),
strategyUsed: v.optional(v.string()), // e.g., "free_v1", "premium_v1"
llmModel: v.optional(v.string()),     // actual model used
```

---

## Clerk Billing Implementation (Next.js Dashboard Only)

### Step 1: Enable Clerk Billing

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Configure → Billing**
3. Enable Clerk Billing
4. Connect Stripe account

### Step 2: Create Products & Plans

In Clerk Dashboard → Billing → Products:

**Product: Resume Intelligence Platform**

| Plan | Price | Billing | Plan ID |
|------|-------|---------|---------|
| Free | $0 | - | `plan_free` |
| Premium Monthly | $19/mo | Monthly | `plan_premium_monthly` |
| Premium Annual | $149/yr | Annually | `plan_premium_annual` |

### Step 3: Define Entitlements

In Clerk Dashboard → Billing → Entitlements:

| Entitlement Key | Free | Premium |
|-----------------|------|---------|
| `runs_per_month` | 5 | 999999 |
| `master_resumes` | 1 | 5 |
| `premium_models` | false | true |
| `export_latex` | false | true |
| `export_json` | false | true |
| `watermark_free` | false | true |
| `priority_support` | false | true |

### Step 4: Add Billing Portal to UI

**File: `app/billing/page.tsx`** (new file)

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  
  // Clerk's Next.js Dashboard approach uses UserProfile with billing
  return (
    <div className="billing-page">
      <h1>Billing & Subscription</h1>
      {/* Clerk handles the billing UI via UserProfile */}
    </div>
  );
}
```

**Update `components/AppShell.tsx`:**

```typescript
const navItems = [
  { path: "/overview", label: "Overview" },
  { path: "/runs", label: "Runs" },
  { path: "/settings", label: "Settings" },
  { path: "/billing", label: "Billing" },  // ADD THIS
];
```

### Step 5: Read Subscription in Server Code

**File: `lib/entitlements.ts`** (new file)

```typescript
import { auth, clerkClient } from "@clerk/nextjs/server";

export type Plan = "free" | "premium";

export interface Entitlements {
  plan: Plan;
  runsPerMonth: number;
  masterResumes: number;
  premiumModels: boolean;
  exportLatex: boolean;
  exportJson: boolean;
  watermarkFree: boolean;
}

const FREE_ENTITLEMENTS: Entitlements = {
  plan: "free",
  runsPerMonth: 5,
  masterResumes: 1,
  premiumModels: false,
  exportLatex: false,
  exportJson: false,
  watermarkFree: false,
};

const PREMIUM_ENTITLEMENTS: Entitlements = {
  plan: "premium",
  runsPerMonth: 999999,
  masterResumes: 5,
  premiumModels: true,
  exportLatex: true,
  exportJson: true,
  watermarkFree: true,
};

export async function resolveEntitlements(userId?: string | null): Promise<Entitlements> {
  if (!userId) return FREE_ENTITLEMENTS;
  
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    
    // Check Clerk's subscription metadata
    // Clerk stores subscription info in publicMetadata after billing setup
    const subscription = user.publicMetadata?.subscription as {
      planId?: string;
      status?: string;
    } | undefined;
    
    if (subscription?.status === "active" && 
        (subscription.planId === "plan_premium_monthly" || 
         subscription.planId === "plan_premium_annual")) {
      return PREMIUM_ENTITLEMENTS;
    }
    
    return FREE_ENTITLEMENTS;
  } catch (error) {
    console.error("Failed to resolve entitlements:", error);
    return FREE_ENTITLEMENTS;
  }
}

export async function resolveEntitlementsFromAuth(): Promise<Entitlements> {
  const { userId } = await auth();
  return resolveEntitlements(userId);
}
```

### Recommendation: Clerk Metadata vs DB Mirror

**Recommendation: Use Clerk metadata (publicMetadata) as the source of truth.**

**Justification:**
1. **Single source of truth:** Clerk manages subscriptions via Stripe integration
2. **Real-time:** No sync lag between payment and access
3. **Clerk webhooks:** Can update Convex if needed for analytics/reporting
4. **Simpler:** No duplicate subscription logic in Convex

**For analytics only,** optionally mirror to Convex via webhook:
- `app/api/webhooks/clerk/route.ts` → listen for `user.updated`
- Update `convex/users.ts` with `subscriptionPlan` field

---

## Backend Gating Design (Server-Enforced)

### Pattern: Gate at API Entry Points

Every paid feature must be gated server-side. UI can hide elements, but backend enforces.

### Implementation in `/api/analyze/route.ts`

```typescript
import { resolveEntitlementsFromAuth, Entitlements } from "@/lib/entitlements";

export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Resolve entitlements
  const entitlements = await resolveEntitlementsFromAuth();
  
  // 2. Check run limit
  const runCount = await getMonthlyRunCount(clerkId);
  if (runCount >= entitlements.runsPerMonth) {
    return NextResponse.json(
      { 
        error: "Monthly run limit reached",
        code: "RUN_LIMIT_EXCEEDED",
        limit: entitlements.runsPerMonth,
        upgrade_url: "/billing"
      },
      { status: 402 }
    );
  }
  
  // 3. Select model based on plan
  const modelToUse = entitlements.premiumModels 
    ? (process.env.OPENAI_PREMIUM_MODEL || "gpt-4o")
    : "gpt-4o-mini";
  
  // 4. Continue with tailoring...
  // Pass modelToUse to LLM calls
  
  // 5. Log plan/strategy in run record
  // ... when creating run, include:
  // planUsed: entitlements.plan,
  // strategyUsed: `${entitlements.plan}_v1`,
  // llmModel: modelToUse,
}
```

### Implementation in `/api/generate-pdf/route.ts`

```typescript
import { resolveEntitlementsFromAuth } from "@/lib/entitlements";

export async function POST(request: NextRequest) {
  const entitlements = await resolveEntitlementsFromAuth();
  
  let latex = body.latex;
  
  // Add watermark for free users
  if (!entitlements.watermarkFree) {
    latex = addWatermarkToLatex(latex);
  }
  
  // ... rest of PDF generation
}

function addWatermarkToLatex(latex: string): string {
  // Insert watermark package and footer
  const watermarkSetup = `
\\usepackage{draftwatermark}
\\SetWatermarkText{Generated with ResumeGen Free}
\\SetWatermarkScale{0.5}
\\SetWatermarkLightness{0.9}
`;
  return latex.replace('\\begin{document}', watermarkSetup + '\\begin{document}');
}
```

### Gating in Convex Mutations

**File: `convex/masterResumes.ts` (update)**

```typescript
export const createMasterResume = mutation({
  args: { /* ... */ },
  handler: async (ctx, args) => {
    // Get user's current resume count
    const existingResumes = await ctx.db
      .query("masterResumes")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    
    // Note: For Convex, we need to pass entitlements from the client
    // or have a separate entitlements check before calling this mutation
    // Option: Add maxResumes as an argument, validated on client with server backup
    
    const maxResumes = args.maxResumes ?? 1; // Default to free limit
    
    if (existingResumes.length >= maxResumes) {
      throw new Error(`Resume limit reached. Max: ${maxResumes}`);
    }
    
    // ... rest of creation
  },
});
```

### Error Response Standard

All subscription-gated endpoints should return consistent error format:

```typescript
interface SubscriptionError {
  error: string;
  code: "RUN_LIMIT_EXCEEDED" | "RESUME_LIMIT_EXCEEDED" | "PREMIUM_FEATURE" | "EXPORT_RESTRICTED";
  limit?: number;
  current?: number;
  upgrade_url: string;
  required_plan: "premium";
}
```

---

## Tailoring Strategy Design (Free vs Premium)

### Strategy Pattern

**File: `lib/tailoring-strategy.ts`** (new file)

```typescript
export type TailorStrategy = "FREE" | "PREMIUM";

export interface StrategyConfig {
  strategy: TailorStrategy;
  llmModel: string;
  temperature: number;
  maxTokens: number;
  enableAdvancedSelection: boolean;
  enableMultiModelComparison: boolean;
}

export function getStrategyConfig(plan: "free" | "premium"): StrategyConfig {
  if (plan === "premium") {
    return {
      strategy: "PREMIUM",
      llmModel: process.env.OPENAI_PREMIUM_MODEL || "gpt-4o",
      temperature: 0.3,
      maxTokens: 2000,
      enableAdvancedSelection: true,
      enableMultiModelComparison: true,
    };
  }
  
  return {
    strategy: "FREE",
    llmModel: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 1500,
    enableAdvancedSelection: false,
    enableMultiModelComparison: false,
  };
}
```

### Single Branching Point

In `app/api/analyze/route.ts`, the strategy is resolved once at the top and passed through:

```typescript
export async function POST(request: NextRequest) {
  // ... auth check ...
  
  const entitlements = await resolveEntitlementsFromAuth();
  const strategyConfig = getStrategyConfig(entitlements.plan);
  
  // All LLM calls use strategyConfig.llmModel
  // All feature flags check strategyConfig
  
  // Single place where strategy affects behavior:
  const rubricResponse = await openai.chat.completions.create({
    model: strategyConfig.llmModel,  // <-- strategy applied here
    // ...
  });
  
  const tailorResponse = await openai.chat.completions.create({
    model: strategyConfig.llmModel,  // <-- and here
    // ...
  });
}
```

### Strategy Differences Summary

| Aspect | FREE | PREMIUM |
|--------|------|---------|
| LLM Model | gpt-4o-mini | gpt-4o |
| Response quality | Good | Best |
| Token limits | 1500 | 2000 |
| Multi-model comparison | No | Yes (future) |
| Advanced bullet selection | No | Yes (future) |

---

## UI/UX Changes for Subscriptions

### 1. Plan Badge in Header

**Update `components/AppShell.tsx`:**

```typescript
import { useUser } from "@clerk/nextjs";

function PlanBadge() {
  const { user } = useUser();
  const plan = user?.publicMetadata?.subscription?.planId;
  const isPremium = plan?.includes("premium");
  
  return (
    <span className={`plan-badge ${isPremium ? "premium" : "free"}`}>
      {isPremium ? "✨ Premium" : "Free"}
    </span>
  );
}

// In the header:
<SignedIn>
  <PlanBadge />
  <UserButton />
</SignedIn>
```

### 2. Upgrade Prompts

**File: `components/UpgradePrompt.tsx`** (new)

```typescript
import Link from "next/link";

interface UpgradePromptProps {
  feature: string;
  compact?: boolean;
}

export function UpgradePrompt({ feature, compact }: UpgradePromptProps) {
  if (compact) {
    return (
      <Link href="/billing" className="upgrade-link">
        🔒 Upgrade to unlock
      </Link>
    );
  }
  
  return (
    <div className="upgrade-prompt">
      <div className="upgrade-icon">✨</div>
      <h3>Upgrade to Premium</h3>
      <p>{feature} is available on the Premium plan.</p>
      <Link href="/billing" className="primary">
        View Plans
      </Link>
    </div>
  );
}
```

### 3. Run Limit Warning

**Update `app/start-run/page.tsx`:**

```typescript
function RunLimitBanner({ current, max }: { current: number; max: number }) {
  const remaining = max - current;
  const isLow = remaining <= 2;
  const isExhausted = remaining <= 0;
  
  if (isExhausted) {
    return (
      <div className="banner error">
        Monthly run limit reached ({current}/{max}).
        <Link href="/billing">Upgrade for unlimited runs</Link>
      </div>
    );
  }
  
  if (isLow) {
    return (
      <div className="banner warn">
        {remaining} runs remaining this month.
        <Link href="/billing">Upgrade for unlimited</Link>
      </div>
    );
  }
  
  return null;
}
```

### 4. Locked Export Options

**Update `components/TailoredResumeView.tsx`:**

```typescript
// In the export dropdown:
<button 
  disabled={!entitlements.exportLatex}
  onClick={() => handleExport("latex")}
>
  {entitlements.exportLatex ? "📄 Download LaTeX" : "🔒 LaTeX (Premium)"}
</button>
```

### 5. Billing Page with Clerk

**File: `app/billing/page.tsx`** (new)

```typescript
"use client";

import { UserProfile } from "@clerk/nextjs";

export default function BillingPage() {
  return (
    <div className="billing-page">
      <h1>Billing & Subscription</h1>
      <p className="hint">Manage your subscription and payment methods.</p>
      
      <UserProfile 
        appearance={{
          elements: {
            rootBox: "billing-profile",
          }
        }}
      />
    </div>
  );
}
```

### 6. Client Spoofing Prevention

**Principle:** UI is informational only. All limits enforced server-side.

- UI reads plan from Clerk `useUser()` hook
- UI hides/disables buttons based on plan
- Backend re-validates on every request
- Never trust client-provided `plan` parameter

---

## Step-by-Step Refactor Plan (Smallest Safe Diffs)

### Phase 1: Infrastructure (No User-Facing Changes)

**PR #1: Add entitlements resolver**
- Create `lib/entitlements.ts`
- Create `lib/tailoring-strategy.ts`
- Add types for `Plan` and `Entitlements`
- No integration yet—just the module

**PR #2: Update schema for tracking**
- Add `planUsed`, `strategyUsed`, `llmModel` to `runs` table in `convex/schema.ts`
- Update `convex/runs.ts` mutations
- No enforcement yet

### Phase 2: Backend Gating (Soft Launch)

**PR #3: Gate `/api/analyze`**
- Import `resolveEntitlementsFromAuth`
- Add run limit check (but set free limit high: 100)
- Add model selection based on plan
- Log plan/strategy in run record

**PR #4: Gate `/api/generate-pdf`**
- Add watermark logic for free users
- Keep watermark subtle initially

**PR #5: Gate master resume creation**
- Update `convex/masterResumes.ts`
- Enforce resume limit

### Phase 3: Clerk Billing Setup

**PR #6: Configure Clerk Billing**
- Enable billing in Clerk Dashboard
- Create products and plans
- Define entitlements
- This is dashboard-only, no code changes

**PR #7: Add billing webhook**
- Create `app/api/webhooks/clerk/route.ts`
- Handle subscription events
- Optionally sync to Convex for analytics

### Phase 4: UI Updates

**PR #8: Add billing page and navigation**
- Create `app/billing/page.tsx`
- Add to navigation in `AppShell.tsx`
- Add plan badge

**PR #9: Add upgrade prompts**
- Create `UpgradePrompt` component
- Add run limit banner to `start-run`
- Add locked indicators to exports

### Phase 5: Launch

**PR #10: Lower free limits to production values**
- Change `runsPerMonth: 100` → `runsPerMonth: 5`
- Change `masterResumes` limit
- Announce launch

---

## Testing Plan and Acceptance Criteria

### Unit Tests

| Test | File | Criteria |
|------|------|----------|
| Entitlements returns FREE for no user | `lib/entitlements.test.ts` | `resolveEntitlements(null)` returns FREE_ENTITLEMENTS |
| Entitlements returns FREE for user without subscription | `lib/entitlements.test.ts` | Mock user with no publicMetadata.subscription |
| Entitlements returns PREMIUM for active subscriber | `lib/entitlements.test.ts` | Mock user with active premium subscription |
| Strategy config matches plan | `lib/tailoring-strategy.test.ts` | Free → gpt-4o-mini, Premium → gpt-4o |

### Integration Tests

| Test | Criteria |
|------|----------|
| Free user hits run limit | 6th run returns 402 with `RUN_LIMIT_EXCEEDED` |
| Premium user unlimited runs | 100+ runs succeed |
| Free user gets watermarked PDF | PDF contains watermark text |
| Premium user gets clean PDF | PDF has no watermark |
| Free user cannot download LaTeX | Export endpoint returns 402 |
| Premium user can download LaTeX | Export endpoint returns file |

### E2E Tests

| Flow | Criteria |
|------|----------|
| New signup → Free plan | User created, can run 5 analyses, 6th blocked |
| Upgrade flow | User clicks upgrade → Clerk modal → Payment → Premium access |
| Downgrade/cancel | User cancels → Reverts to Free limits |
| Billing page accessible | `/billing` loads UserProfile component |

### Acceptance Criteria Summary

1. ✅ Free users limited to 5 runs/month
2. ✅ Free users limited to 1 master resume
3. ✅ Free PDFs have watermark
4. ✅ Premium users get gpt-4o model
5. ✅ Billing page shows subscription status
6. ✅ Upgrade prompt appears at limit
7. ✅ Backend enforces all limits (not just UI)
8. ✅ No breaking changes to existing flows

---

## Open Questions / Repo Unknowns (and how to confirm)

### Confirmed

| Item | Status | Location |
|------|--------|----------|
| Clerk v5 installed | ✅ Confirmed | `package.json`: `"@clerk/nextjs": "^5.0.0"` |
| Auth middleware pattern | ✅ Confirmed | `middleware.ts` uses `clerkMiddleware` |
| API route auth | ✅ Confirmed | `app/api/analyze/route.ts` uses `auth()` |
| User schema in Convex | ✅ Confirmed | `convex/schema.ts:users` table |
| No existing billing code | ✅ Confirmed | grep found no billing/subscription references |

### Unknown - Need Verification

| Item | How to Confirm | Likely Answer |
|------|----------------|---------------|
| Clerk billing already enabled? | Check Clerk Dashboard → Billing | Probably not enabled yet |
| Stripe account connected? | Check Clerk Dashboard | Need to connect |
| Monthly run count tracking | Check if runs table has month-based query | Need to add query/index |
| `publicMetadata` shape after billing | Enable billing, subscribe, inspect user | Will contain subscription object |

### To Add: Monthly Run Count Query

**File: `convex/runs.ts`** (add new query)

```typescript
export const getMonthlyRunCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("createdAt"), startOfMonth))
      .collect();
    
    return runs.filter(r => !r.isDeleted).length;
  },
});
```

### Environment Variables Needed

```env
# Existing
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
OPENAI_API_KEY=sk-...

# New for Premium
OPENAI_PREMIUM_MODEL=gpt-4o  # or gpt-4-turbo
```

---

## Summary

This document provides a complete roadmap for implementing Free vs Premium subscriptions:

1. **Current state** is fully documented with file paths and function names
2. **Clerk Billing** is the recommended approach using Next.js Dashboard
3. **Server-side enforcement** is prioritized over client-side gating
4. **Strategy pattern** keeps plan-specific logic in one place
5. **Incremental PRs** minimize risk and enable easy rollback
6. **Testing plan** ensures quality before launch

**Next step:** Begin implementing Phase 1 by creating `lib/entitlements.ts` and `lib/tailoring-strategy.ts`.

