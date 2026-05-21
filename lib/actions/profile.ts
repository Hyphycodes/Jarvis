"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireUser, getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  updateFounderProfileSchema,
  updateProfileSchema,
  type UpdateFounderProfileInput,
  type UpdateProfileInput,
} from "@/lib/schemas";
import type {
  FounderProfileRow,
  ProfileRow,
} from "@/lib/types/database";

export type ProfileBundle = {
  profile: ProfileRow | null;
  founder: FounderProfileRow | null;
};

/**
 * Returns the profile + founder_profile for the surface the current user is
 * allowed to view. Owners see their own row; viewers see the demo founder.
 */
export async function getProfile(): Promise<ProfileBundle> {
  const { id, viewer } = await getViewableProfileId();
  if (!id) {
    // Viewer logged in but no owner has been seeded yet — show their own row.
    return {
      profile: {
        id: viewer.id,
        email: viewer.email,
        display_name: viewer.display_name,
        home_city: viewer.home_city,
        timezone: viewer.timezone,
        app_role: viewer.role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      founder: null,
    };
  }

  const supabase = await getServerSupabase();
  const [{ data: profile }, { data: founder }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("founder_profile").select("*").eq("user_id", id).maybeSingle(),
  ]);

  return {
    profile: (profile ?? null) as ProfileRow | null,
    founder: (founder ?? null) as FounderProfileRow | null,
  };
}

export async function updateProfile(input: UpdateProfileInput) {
  const owner = await requireOwner();
  const data = updateProfileSchema.parse(input);
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("profiles")
    .update(data)
    .eq("id", owner.id);
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function updateFounderProfile(input: UpdateFounderProfileInput) {
  const owner = await requireOwner();
  const data = updateFounderProfileSchema.parse(input);
  const supabase = await getServerSupabase();

  // Upsert so first-time owner edits create the row if seed wasn't run.
  const { error } = await supabase
    .from("founder_profile")
    .upsert({ user_id: owner.id, ...data }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
}

export async function seedFounderProfile() {
  const owner = await requireOwner();
  if (!owner.email) throw new Error("Owner email is required.");

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc("seed_founder", {
    p_email: owner.email,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/profile");
  revalidatePath("/settings");
}

/**
 * Read-only convenience for components that want to know whether the current
 * user can edit. Cheap helper; reads the session profile only.
 */
export async function getViewerRole() {
  const user = await requireUser();
  return user.role;
}
