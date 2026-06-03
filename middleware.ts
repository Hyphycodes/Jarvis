import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export const CRON_API_PATHS = [
  "/api/radar/autopilot",
  "/api/intelligence/run",
  "/api/library/scout",
  "/api/library/process-candidates",
  "/api/library/refresh",
  "/api/events/scout",
  "/api/events/process",
  "/api/tastemakers/sweep",
] as const;

export function isCronApiPath(pathname: string): boolean {
  return CRON_API_PATHS.some((path) => pathname === path);
}

export async function middleware(request: NextRequest) {
  if (isCronApiPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static, _next/image
     * - favicon, image, font assets
     * - manifest
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
