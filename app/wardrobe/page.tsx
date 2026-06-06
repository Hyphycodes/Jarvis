import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { loadCloset } from "@/lib/wardrobe/closet";
import { ClosetClient } from "@/components/wardrobe/ClosetClient";

export const metadata = { title: "Closet · Jarvis" };
export const dynamic = "force-dynamic";

export default async function WardrobePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wardrobe");

  const closet = await loadCloset(user.id);

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "88px 20px 120px" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
        WARDROBE
      </p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontStyle: "italic",
          color: "var(--text-primary)",
          lineHeight: 1.1,
          marginBottom: 28,
        }}
      >
        Your Closet
      </h1>
      <ClosetClient closet={closet} />
    </main>
  );
}
