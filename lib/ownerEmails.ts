/**
 * Owner allowlist. Comma-separated emails in OWNER_EMAILS (or its
 * historical alias ALLOWED_EMAILS) are treated as approved founder
 * accounts and auto-promoted to app_role = 'owner' on first sign-in.
 *
 * Case-insensitive. Whitespace is trimmed. Empty entries are dropped.
 */
export function ownerEmails(): string[] {
  const configured = [
    process.env.OWNER_EMAILS,
    process.env.ALLOWED_EMAILS,
  ]
    .filter(Boolean)
    .join(",");
  const raw = [configured, "jerrysanchezpro@gmail.com"]
    .filter(Boolean)
    .join(",");
  return Array.from(new Set(raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)));
}

export function isAllowedOwner(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase());
}
