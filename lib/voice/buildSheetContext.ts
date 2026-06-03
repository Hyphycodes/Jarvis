"use client";

export function buildSheetContext(params: {
  currentRoute: string;
  visibleItem?: { name: string; type: string; slug: string; verdict_snippet?: string };
  tonightEvents?: { name: string; starts_at: string }[];
}): string {
  const { currentRoute, visibleItem, tonightEvents } = params;

  const parts: string[] = [];

  // Route context
  if (currentRoute.startsWith("/radar")) {
    if (visibleItem) {
      const verdict = visibleItem.verdict_snippet
        ? ` Verdict: ${visibleItem.verdict_snippet}`
        : "";
      parts.push(
        `User is currently viewing ${visibleItem.name} (${visibleItem.type}) on Radar.${verdict} They may be considering it.`,
      );
    } else {
      parts.push("User is on the Radar tab, browsing curated items.");
    }
  } else if (currentRoute === "/" || currentRoute.startsWith("/today")) {
    const now = new Date();
    const hour = now.getHours();
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

    if (tonightEvents && tonightEvents.length > 0) {
      const top = tonightEvents[0];
      const time = top.starts_at
        ? new Date(top.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : null;
      parts.push(
        `It's ${dayName} ${timeOfDay}. User has an event on Tonight: ${top.name}${time ? `, starts at ${time}` : ""}.`,
      );
    } else {
      parts.push(`It's a ${timeOfDay === "evening" ? "quiet" : ""} ${dayName} ${timeOfDay}. Nothing on the Tonight board.`);
    }
  } else if (currentRoute.startsWith("/plan/")) {
    const slug = currentRoute.replace("/plan/", "").split("/")[0];
    if (slug) {
      parts.push(`User is viewing an active plan (${slug}). Current plan slug: ${slug}.`);
    }
  } else if (currentRoute.startsWith("/item/")) {
    const itemId = currentRoute.replace("/item/", "").split("/")[0];
    if (visibleItem) {
      parts.push(
        `User is on the detail page for ${visibleItem.name} (${visibleItem.type}). Current item id: ${itemId}.`,
      );
    } else if (itemId) {
      parts.push(`User is on an item detail page. Current item id: ${itemId}.`);
    }
  } else if (currentRoute.startsWith("/circle")) {
    parts.push("User is on the Circle tab, reviewing inner circle updates.");
  } else if (currentRoute.startsWith("/north")) {
    parts.push("User is on North, reviewing long-arc direction and life pillars.");
  }

  return parts.join(" ").trim();
}
