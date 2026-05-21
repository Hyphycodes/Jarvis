import { getSessionUser } from "@/lib/auth";
import { RadarSigned } from "./Signed";
import { RadarEmpty } from "./Empty";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const user = await getSessionUser();
  if (!user) return <RadarEmpty />;
  return <RadarSigned />;
}
