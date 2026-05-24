import { renderLightChapter } from "../_LightChapter";

export const metadata = { title: "Atmosphere · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanAtmospherePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderLightChapter({ params, chapterKey: "atmosphere" });
}
