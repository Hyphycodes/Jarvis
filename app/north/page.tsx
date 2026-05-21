import { getSessionUser } from "@/lib/auth";
import { NorthSigned } from "./Signed";
import { NorthEmpty } from "./Empty";

export const dynamic = "force-dynamic";

export default async function NorthPage() {
  const user = await getSessionUser();
  if (!user) return <NorthEmpty />;
  return <NorthSigned />;
}
