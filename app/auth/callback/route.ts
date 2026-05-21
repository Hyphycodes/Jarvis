import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { siteOrigin } from "@/lib/siteOrigin";
import { safeNextPath } from "@/lib/navigation";

/**
 * Magic-link / OTP callback. Supabase posts the user back here with a `code`
 * (PKCE) which we exchange for a session before redirecting onward.
 *
 * On success → / (or a safe `?next=` path).
 * On failure → /login?error=<code>&message=<safe text>.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"), "/");

  const supabaseError =
    url.searchParams.get("error") ??
    url.searchParams.get("error_code") ??
    null;
  const supabaseErrorDescription = url.searchParams.get("error_description");

  const origin = siteOrigin();

  if (supabaseError) {
    return redirectTo(origin, "/login", {
      error: mapSupabaseErrorCode(supabaseError, supabaseErrorDescription),
      message: supabaseErrorDescription ?? supabaseError,
    });
  }

  if (!code) {
    return redirectTo(origin, "/login", {
      error: "callback_no_code",
      message: "The sign-in link is missing its code. Request a new one.",
    });
  }

  try {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(
        "[auth/callback] exchangeCodeForSession failed:",
        error.message,
      );
      return redirectTo(origin, "/login", {
        error: "callback_failed",
        message: error.message,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[auth/callback] unexpected error:", message);
    return redirectTo(origin, "/login", {
      error: "callback_failed",
      message,
    });
  }

  return NextResponse.redirect(new URL(next, origin));
}

function redirectTo(
  origin: string,
  path: string,
  params: Record<string, string>,
) {
  const target = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

function mapSupabaseErrorCode(code: string, description: string | null) {
  const c = code.toLowerCase();
  const d = (description ?? "").toLowerCase();
  if (c.includes("expired") || d.includes("expired")) return "link_expired";
  if (c.includes("invalid") || d.includes("invalid")) return "link_invalid";
  if (c.includes("rate")) return "rate_limited";
  return "callback_failed";
}
