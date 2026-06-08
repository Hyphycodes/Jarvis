import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Settings is now folded into the Private Layer at /account. This route
 * redirects there. Sub-routes (/settings/integrations, /settings/library)
 * remain reachable by direct URL for the owner.
 */
export default function SettingsPage() {
  redirect("/account");
}
