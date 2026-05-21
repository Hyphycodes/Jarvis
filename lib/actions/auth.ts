"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { magicLinkSchema } from "@/lib/schemas";
import { siteOrigin, authCallbackUrl } from "@/lib/siteOrigin";
import { safeNextPath } from "@/lib/navigation";

export type AuthErrorCode =
  | "invalid_input"
  | "invalid_credentials"
  | "rate_limited"
  | "needs_confirmation"
  | "send_failed";

export type MagicLinkResult =
  | { ok: true; email: string }
  | { ok: false; code: AuthErrorCode; message: string };

export type PasswordResult =
  | { ok: true; signedIn: boolean; email: string }
  | { ok: false; code: AuthErrorCode; message: string };

function classifySupabaseError(message: string): AuthErrorCode {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("too many")) return "rate_limited";
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "invalid_credentials";
  if (m.includes("confirm") || m.includes("email link is invalid"))
    return "needs_confirmation";
  return "send_failed";
}

// ---------------------------------------------------------------------------
// Magic link
// ---------------------------------------------------------------------------
export async function sendMagicLink(
  formData: FormData,
): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Enter a valid email.",
    };
  }

  const supabase = await getServerSupabase();
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: authCallbackUrl(next),
    },
  });

  if (error) {
    return {
      ok: false,
      code: classifySupabaseError(error.message),
      message: error.message,
    };
  }
  return { ok: true, email: parsed.data.email };
}

// ---------------------------------------------------------------------------
// Email + password
// ---------------------------------------------------------------------------
const passwordSchema = z
  .object({
    email: z.string().email("Enter a valid email."),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters."),
  })
  .strict();

function parsePasswordForm(formData: FormData) {
  return passwordSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
}

export async function signInWithPassword(
  formData: FormData,
): Promise<PasswordResult> {
  const parsed = parsePasswordForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return {
      ok: false,
      code: classifySupabaseError(error.message),
      message: error.message,
    };
  }
  return { ok: true, signedIn: !!data.session, email: parsed.data.email };
}

export async function signUpWithPassword(
  formData: FormData,
): Promise<PasswordResult> {
  const parsed = parsePasswordForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }
  const supabase = await getServerSupabase();
  const next = safeNextPath(String(formData.get("next") ?? ""), "/");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: authCallbackUrl(next),
    },
  });
  if (error) {
    return {
      ok: false,
      code: classifySupabaseError(error.message),
      message: error.message,
    };
  }
  return {
    ok: true,
    signedIn: !!data.session,
    email: parsed.data.email,
  };
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------
export async function signOut() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// Re-export so callers needing the computed origin can use them too.
export { siteOrigin, authCallbackUrl };
