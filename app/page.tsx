import { getSessionUser } from "@/lib/auth";
import { TodaySigned } from "./TodaySigned";
import { TodayEmpty } from "./TodayEmpty";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await getSessionUser();
  if (!user) return <TodayEmpty />;
  return <TodaySigned />;
}
