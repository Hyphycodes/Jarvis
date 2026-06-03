export function sourceKeyFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sourceNameFromUrl(url?: string | null): string | null {
  const key = sourceKeyFromUrl(url);
  if (!key) return null;
  return key
    .split(".")
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
}
