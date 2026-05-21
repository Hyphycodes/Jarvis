import { getSessionUser } from "@/lib/auth";
import { CircleSigned } from "./Signed";
import { CircleEmpty } from "./Empty";

export const dynamic = "force-dynamic";

export default async function CirclePage() {
  const user = await getSessionUser();
  if (!user) return <CircleEmpty />;
  return <CircleSigned />;
}
