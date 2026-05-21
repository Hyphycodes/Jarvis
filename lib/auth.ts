import "server-only";

import { getServerSupabase } from "@/lib/supabase/ssr-server";
import type { AppRole } from "@/lib/types/database";
import { isAllowedOwner } from "@/lib/ownerEmails";

export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
  display_name: string | null;
  home_city: string | null;
  timezone: string | null;
};

/**
 * Resolve the current request's user + app role.
 * Returns null when unauthenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const allowedOwner = isAllowedOwner(user.email);

  if (allowedOwner) {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        app_role: "owner",
      },
      { onConflict: "id" },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, app_role, display_name, home_city, timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? null,
      app_role: allowedOwner ? "owner" : "viewer",
    });
  }

  return {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    role: (allowedOwner ? "owner" : (profile?.app_role ?? "viewer")) as AppRole,
    display_name: profile?.display_name ?? null,
    home_city: profile?.home_city ?? null,
    timezone: profile?.timezone ?? null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "owner") throw new Error("FORBIDDEN: owner only");
  return user;
}

/**
 * Locate the demo-owner profile id (the founder). Used so viewer accounts can
 * land on /profile and see the founder/demo identity without being the founder.
 */
export async function getDemoOwnerId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("app_role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Return the profile id whose data the current viewer is allowed to see.
 * - Owners: their own id
 * - Viewers: the founder/demo owner id (or null if none exists yet)
 */
export async function getViewableProfileId(): Promise<{
  id: string | null;
  viewer: SessionUser;
}> {
  const viewer = await requireUser();
  if (viewer.role === "owner") return { id: viewer.id, viewer };
  const demo = await getDemoOwnerId();
  return { id: demo, viewer };
}
