import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "./providers";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Intelligence Platform",
  description: "AI-powered resume tailoring platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // #region agent log
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  fetch('http://127.0.0.1:7242/ingest/1c636cf3-eea1-4dbe-92e0-605456223a98',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/layout.tsx:17',message:'Checking Clerk env vars',data:{clerkKeyExists:!!clerkKey,clerkKeyLength:clerkKey?.length||0,allEnvKeys:Object.keys(process.env).filter(k=>k.includes('CLERK')||k.includes('NEXT_PUBLIC')).slice(0,10)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  return (
    <ClerkProvider publishableKey={clerkKey || undefined}>
      <html lang="en">
        <body>
          <ConvexClientProvider>
            <AppShell>{children}</AppShell>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
