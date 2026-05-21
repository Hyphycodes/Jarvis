import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieEntry = { name: string; value: string; options?: CookieOptions };

/**
 * Server-side Supabase client bound to the current request's auth cookies.
 * Use inside Server Components, Server Actions, and Route Handlers.
 *
 * Note: we intentionally don't pass a Database generic — @supabase/ssr 0.5
 * imports GenericSchema from a path that's not present in the newer
 * supabase-js dist, which collapses the typed surface to `never`. We rely on
 * Zod for validation and cast read results to Database row types instead.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieEntry[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies; safe to ignore.
            // Middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}
