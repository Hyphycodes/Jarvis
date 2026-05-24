import { renderLightChapter } from "../_LightChapter";

export const metadata = { title: "Optional Detours · Plan · Jarvis" };
export const dynamic = "force-dynamic";

export default async function PlanDetoursPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderLightChapter({ params, chapterKey: "detours" });
}
