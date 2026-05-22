import { z } from "zod";

/**
 * Required env: Supabase only. Anthropic, integrations, and tuning
 * variables are intentionally optional so the build never breaks when
 * a key is missing — downstream call sites probe `hasEnv()` first.
 */
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Source integrations (all optional).
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  MAPBOX_ACCESS_TOKEN: z.string().min(1).optional(),
  TICKETMASTER_API_KEY: z.string().min(1).optional(),
  TAVILY_API_KEY: z.string().min(1).optional(),
  BRAVE_API_KEY: z.string().min(1).optional(),
  SERPAPI_KEY: z.string().min(1).optional(),

  // Default location for source queries.
  DEFAULT_HOME_LAT: z.coerce.number().optional(),
  DEFAULT_HOME_LNG: z.coerce.number().optional(),
  DEFAULT_CITY: z.string().optional(),
  DEFAULT_STATE: z.string().optional(),
  WHITE_SOX_TEAM_ID: z.coerce.number().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(
      `Invalid or missing environment variables:\n  ${missing}\n\n` +
        `Check .env.local against .env.example.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export function checkEnv(): { ok: boolean; missing: string[] } {
  const result = envSchema.safeParse(process.env);
  if (result.success) return { ok: true, missing: [] };
  return {
    ok: false,
    missing: result.error.issues.map((i) => i.path.join(".")),
  };
}

export const OPTIONAL_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "GOOGLE_PLACES_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "TICKETMASTER_API_KEY",
  "TAVILY_API_KEY",
  "BRAVE_API_KEY",
  "SERPAPI_KEY",
  "CRON_SECRET",
] as const;

export type OptionalEnvKey = (typeof OPTIONAL_ENV_KEYS)[number];

export function hasEnv(key: OptionalEnvKey): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0;
}

export type DefaultLocation = {
  lat: number;
  lng: number;
  city?: string;
  state?: string;
};

// Chicago fallback. Matches the founder seed home_city.
const FALLBACK_LOCATION: DefaultLocation = {
  lat: 41.85003,
  lng: -87.65005,
  city: "Chicago",
  state: "IL",
};

export function getDefaultLocation(): DefaultLocation {
  const env = getEnv();
  if (env.DEFAULT_HOME_LAT != null && env.DEFAULT_HOME_LNG != null) {
    return {
      lat: env.DEFAULT_HOME_LAT,
      lng: env.DEFAULT_HOME_LNG,
      city: env.DEFAULT_CITY,
      state: env.DEFAULT_STATE,
    };
  }
  return FALLBACK_LOCATION;
}

export function getWhiteSoxTeamId(): number {
  return getEnv().WHITE_SOX_TEAM_ID ?? 145;
}
