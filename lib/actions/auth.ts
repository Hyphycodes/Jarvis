"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { magicLinkSchema } from "@/lib/schemas";

export type AuthErrorCode =
  | "invalid_email"
  | "rate_limited"
  | "send_failed";

export type MagicLinkResult =
  | { ok: true; email: string }
  | { ok: false; code: AuthErrorCode; message: string };

function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function classifySupabaseError(message: string): AuthErrorCode {
  const m = message.toLowerCase();
  if (m.includes("rate") || m.includes("too many")) return "rate_limited";
  return "send_failed";
}

export async function sendMagicLink(
  formData: FormData,
): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_email",
      message: "Enter a valid email.",
    };
  }

  const supabase = await getServerSupabase();
  const origin = siteOrigin();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
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

export async function signOut() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
