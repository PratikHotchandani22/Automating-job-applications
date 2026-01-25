import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Minimal middleware - Clerk auth is handled at page/API level via ClerkProvider
// This avoids Edge Runtime compatibility issues with @clerk/nextjs/server
export function middleware(request: NextRequest) {
  // Allow all requests to pass through
  // Authentication is enforced by Clerk's ClerkProvider and auth() in pages/API routes
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
  ],
};

