import { renderLightChapter } from "../_LightChapter";

export const metadata = { title: "After · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanAfterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderLightChapter({ params, chapterKey: "after" });
}
