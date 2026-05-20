import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

let browserAnon: SupabaseClient | null = null;
let serviceRole: SupabaseClient | null = null;

// Anonymous client — safe for read paths that respect RLS.
export function getSupabaseAnonClient(): SupabaseClient {
  if (browserAnon) return browserAnon;
  const env = getEnv();
  browserAnon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  return browserAnon;
}

// Service-role client — server only. Bypasses RLS. Never import from client code.
export function getSupabaseServiceClient(): SupabaseClient {
  if (serviceRole) return serviceRole;
  const env = getEnv();
  serviceRole = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  return serviceRole;
}
