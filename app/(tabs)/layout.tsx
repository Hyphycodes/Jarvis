import { getSessionUser } from "@/lib/auth";
import { TabShell } from "@/components/TabShell";
import {
  loadRadarSurface,
  loadTodaySurface,
} from "@/lib/dispatch/loadSurface";
import { TodaySigned } from "./TodaySigned";
import { TodayEmpty } from "./TodayEmpty";
import { RadarSigned, type RadarSignedItem } from "./radar/Signed";
import { RadarEmpty } from "./radar/Empty";
import { CircleSigned } from "./circle/Signed";
import { CircleEmpty } from "./circle/Empty";
import { NorthSigned } from "./north/Signed";
import { NorthEmpty } from "./north/Empty";

export const dynamic = "force-dynamic";

export default async function TabsLayout({
  children: _children,
}: {
  children: React.ReactNode;
}) {
  // The page files under (tabs) all return null — their job is just to
  // register the URL. The actual content is rendered by TabShell as
  // four simultaneously-mounted slides so swiping doesn't unmount tabs.
  void _children;

  const user = await getSessionUser();
  const signedIn = !!user;

  const [todayPayload, radarCards] = signedIn
    ? await Promise.all([loadTodaySurface(), loadRadarSurface()])
    : [null, []];

  const radarItems: RadarSignedItem[] = radarCards.map((card) => ({
    id: card.id,
    title: typeof card.title === "string" ? card.title : "Untitled",
    description: card.summary,
    category: card.category,
    neighborhood: card.neighborhood ?? null,
    startsAt: card.datetime ?? null,
  }));

  return (
    <TabShell
      today={
        signedIn ? (
          <TodaySigned payload={todayPayload ?? undefined} />
        ) : (
          <TodayEmpty />
        )
      }
      radar={signedIn ? <RadarSigned items={radarItems} /> : <RadarEmpty />}
      circle={signedIn ? <CircleSigned /> : <CircleEmpty />}
      north={signedIn ? <NorthSigned /> : <NorthEmpty />}
    />
  );
}
