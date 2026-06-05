"use server";

import { revalidatePath } from "next/cache";
import { requireOwner, requireUser, getViewableProfileId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import {
  DEFAULT_WEEKLY_RHYTHM,
  normalizeWeeklyRhythm,
  weeklyRhythmToJson,
  type Weekday,
} from "@/lib/schedule/weeklyRhythm";
import {
  updateFounderProfileSchema,
  updateProfileSchema,
  type UpdateFounderProfileInput,
  type UpdateProfileInput,
} from "@/lib/schemas";
import { z } from "zod";
import type {
  FounderProfileRow,
  ProfileRow,
} from "@/lib/types/database";

export type ProfileBundle = {
  profile: ProfileRow | null;
  founder: FounderProfileRow | null;
};

export type WeeklyRhythmActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  savedAt?: string;
};

const weeklyRhythmFormSchema = z.object({
  enabled: z.boolean(),
  workdays: z.array(z.string()).min(1),
  leave_home: z.string().regex(/^\d{2}:\d{2}$/),
  work_start: z.string().regex(/^\d{2}:\d{2}$/),
  leave_work: z.string().regex(/^\d{2}:\d{2}$/),
  arrive_home: z.string().regex(/^\d{2}:\d{2}$/),
  work_location: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(80),
});

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
        home_latitude: null,
        home_longitude: null,
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

export async function updateWeeklyRhythm(
  _previousState: WeeklyRhythmActionState,
  formData: FormData,
): Promise<WeeklyRhythmActionState> {
  try {
    const owner = await requireOwner();
    const supabase = await getServerSupabase();
    const parsed = weeklyRhythmFormSchema.parse({
      enabled: formData.get("enabled") === "on",
      workdays: formData.getAll("workdays").map(String),
      leave_home: String(formData.get("leave_home") ?? ""),
      work_start: String(formData.get("work_start") ?? ""),
      leave_work: String(formData.get("leave_work") ?? ""),
      arrive_home: String(formData.get("arrive_home") ?? ""),
      work_location: String(formData.get("work_location") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    });
    const rhythm = normalizeWeeklyRhythm({
      ...parsed,
      workdays: parsed.workdays as Weekday[],
    });
    const payload = weeklyRhythmToJson(rhythm);
    console.info("[settings.weekly_rhythm.save.start]", {
      userId: owner.id,
      email: owner.email,
      table: "founder_profile",
      selector: { user_id: owner.id },
      weekly_rhythm: payload,
    });

    const { error } = await supabase.from("founder_profile").upsert(
      {
        user_id: owner.id,
        weekly_rhythm: payload,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[settings.weekly_rhythm.save.error]", {
        userId: owner.id,
        email: owner.email,
        message: error.message,
      });
      return {
        ok: false,
        error: friendlyWeeklyRhythmError(error.message),
      };
    }
    revalidatePath("/settings");
    revalidatePath("/");
    const savedAt = new Date().toISOString();
    console.info("[settings.weekly_rhythm.save.success]", {
      userId: owner.id,
      email: owner.email,
      savedAt,
    });
    return { ok: true, message: "Saved.", savedAt };
  } catch (error) {
    console.error("[settings.weekly_rhythm.save.exception]", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: "Check the days, times, location, and timezone before saving.",
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Weekly rhythm save failed.",
    };
  }
}

function friendlyWeeklyRhythmError(message: string): string {
  if (
    /weekly_rhythm|schema cache|column/i.test(message) ||
    /Could not find.*weekly_rhythm/i.test(message)
  ) {
    return "Weekly rhythm storage is not available yet. Apply migration 0005_weekly_rhythm.sql, then save again.";
  }
  return message;
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
