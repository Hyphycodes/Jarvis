import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/ssr-server";

/**
 * Magic-link / OTP callback. Supabase posts the user back here with a `code`
 * (PKCE) which we exchange for a session before redirecting onward.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/profile";

  if (code) {
    const supabase = await getServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
