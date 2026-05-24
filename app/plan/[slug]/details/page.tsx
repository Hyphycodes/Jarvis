import { renderLightChapter } from "../_LightChapter";

export const metadata = { title: "The Details · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanDetailsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderLightChapter({ params, chapterKey: "details" });
}
