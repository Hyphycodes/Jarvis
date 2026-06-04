import { redirect } from "next/navigation";

export const metadata = { title: "Control Room · Jarvis" };
export const dynamic = "force-dynamic";

export default function IntelligenceRedirectPage() {
  redirect("/settings/library");
}
