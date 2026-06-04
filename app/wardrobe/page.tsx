import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Wardrobe · Jarvis" };
export const dynamic = "force-dynamic";

type WardrobeItem = {
  id: string;
  category: string;
  color: string | null;
  formality: string | null;
  description: string;
  activity_tags: string[];
  condition: string;
};

export default async function WardrobePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/wardrobe");

  const supabase = getSupabaseServiceClient();
  const { data } = await supabase
    .from("wardrobe_items")
    .select("id, category, color, formality, description, activity_tags, condition")
    .eq("user_id", user.id)
    .neq("condition", "retired")
    .order("created_at", { ascending: false });

  const items = (data ?? []) as WardrobeItem[];

  const CATEGORIES = [
    "tops",
    "bottoms",
    "shoes",
    "outerwear",
    "accessories",
    "headwear",
  ] as const;
  const grouped = new Map<string, WardrobeItem[]>();
  for (const cat of CATEGORIES) grouped.set(cat, []);
  for (const item of items) {
    const arr = grouped.get(item.category) ?? [];
    arr.push(item);
    grouped.set(item.category, arr);
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "88px 20px 120px" }}>
      <p
        style={{
          fontSize: "11px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: "8px",
        }}
      >
        WARDROBE
      </p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "32px",
          fontStyle: "italic",
          color: "var(--text-primary)",
          lineHeight: 1.1,
          marginBottom: "32px",
        }}
      >
        Your Closet
      </h1>

      {items.length === 0 ? (
        <p style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: 1.6 }}>
          No items cataloged yet. Drop clothing photos in chat to build your wardrobe.
        </p>
      ) : (
        <div>
          {CATEGORIES.map((cat) => {
            const catItems = grouped.get(cat) ?? [];
            if (!catItems.length) return null;
            return (
              <section key={cat} style={{ marginBottom: "32px" }}>
                <p
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                    marginBottom: "12px",
                  }}
                >
                  {cat}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "12px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                        {[
                          item.color,
                          item.formality,
                          item.activity_tags.slice(0, 2).join(" / "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "16px" }}>
            {items.length} item{items.length === 1 ? "" : "s"} cataloged
          </p>
        </div>
      )}
    </main>
  );
}
