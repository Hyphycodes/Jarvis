import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

export const CRON_API_PATHS = [
  "/api/radar/autopilot",
  "/api/radar/promote",
  "/api/intelligence/run",
  "/api/library/scout",
  "/api/library/process-candidates",
  "/api/library/convert-inbox",
  "/api/library/refresh",
  "/api/library/enrich",
  "/api/library/archive-mine",
  "/api/events/scout",
  "/api/events/process",
  "/api/wardrobe/process-imports",
  "/api/finds/scout",
  "/api/finds/process-jobs",
  "/api/tastemakers/sweep",
  "/api/push/evening",
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
