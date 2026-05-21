"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/ssr-server";
import { magicLinkSchema } from "@/lib/schemas";

export type MagicLinkResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function sendMagicLink(formData: FormData): Promise<MagicLinkResult> {
  const parsed = magicLinkSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email." };
  }

  const supabase = await getServerSupabase();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, email: parsed.data.email };
}

export async function signOut() {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
