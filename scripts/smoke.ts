/**
 * Smoke test for source adapters. Run with:
 *   pnpm smoke
 *
 * Each service is skipped if its env var is missing — never fails the
 * script. The exit code is 0 unless an *attempted* call throws.
 */

import { readFileSync } from "node:fs";

loadEnvFile(".env.local");
loadEnvFile(".env");

function loadEnvFile(path: string) {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

import { getCurrentWeather } from "../lib/sources/openMeteo";
import { hasGooglePlaces, searchPlaces } from "../lib/sources/googlePlaces";
import { hasMapbox, geocode } from "../lib/sources/mapbox";
import { hasTicketmaster, searchEvents } from "../lib/sources/ticketmaster";
import { hasTavily, searchWeb } from "../lib/sources/tavily";
import { hasBrave, webSearch } from "../lib/sources/brave";
import { hasSerpapi, searchProducts } from "../lib/sources/serpapi";
import { getWhiteSoxSchedule } from "../lib/sources/mlb";

type Outcome = "PASS" | "SKIP" | "FAIL";

type Row = {
  service: string;
  outcome: Outcome;
  detail?: string;
};

const HOME_LAT = Number(process.env.DEFAULT_HOME_LAT) || 41.85003;
const HOME_LNG = Number(process.env.DEFAULT_HOME_LNG) || -87.65005;

async function main() {
  const results: Row[] = [];

  results.push(
    await run("open-meteo", async () => {
      const w = await getCurrentWeather({ lat: HOME_LAT, lng: HOME_LNG });
      return `${w.temperatureF.toFixed(0)}°F`;
    }),
  );

  results.push(
    await runOptional("google-places", hasGooglePlaces(), async () => {
      const places = await searchPlaces({
        query: "quiet cigar lounge near Chicago",
        lat: HOME_LAT,
        lng: HOME_LNG,
        maxResults: 3,
      });
      return `${places.length} places`;
    }),
  );

  results.push(
    await runOptional("mapbox", hasMapbox(), async () => {
      const features = await geocode("Wicker Park Chicago");
      return `${features.length} matches`;
    }),
  );

  results.push(
    await runOptional("ticketmaster", hasTicketmaster(), async () => {
      const events = await searchEvents({
        lat: HOME_LAT,
        lng: HOME_LNG,
        radiusMiles: 25,
        size: 5,
      });
      return `${events.length} events`;
    }),
  );

  results.push(
    await runOptional("tavily", hasTavily(), async () => {
      const data = await searchWeb({
        query: "Chicago architecture exhibit this week",
        maxResults: 3,
      });
      return `${data.results.length} results`;
    }),
  );

  results.push(
    await runOptional("brave", hasBrave(), async () => {
      const data = await webSearch({ query: "Italian craftsmanship", count: 3 });
      return `${data.length} results`;
    }),
  );

  results.push(
    await runOptional("serpapi", hasSerpapi(), async () => {
      const data = await searchProducts({
        query: "leather card wallet",
        maxResults: 3,
      });
      return `${data.length} products`;
    }),
  );

  results.push(
    await run("mlb (white sox)", async () => {
      const today = new Date();
      const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const games = await getWhiteSoxSchedule({
        startDate: today.toISOString().slice(0, 10),
        endDate: week.toISOString().slice(0, 10),
      });
      return `${games.length} games`;
    }),
  );

  print(results);

  const failed = results.some((r) => r.outcome === "FAIL");
  process.exit(failed ? 1 : 0);
}

async function run(service: string, fn: () => Promise<string>): Promise<Row> {
  try {
    const detail = await fn();
    return { service, outcome: "PASS", detail };
  } catch (error) {
    return {
      service,
      outcome: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runOptional(
  service: string,
  configured: boolean,
  fn: () => Promise<string>,
): Promise<Row> {
  if (!configured) {
    return { service, outcome: "SKIP", detail: "no key" };
  }
  return run(service, fn);
}

function print(results: Row[]) {
  const width = Math.max(...results.map((r) => r.service.length));
  console.log("");
  console.log("Source smoke results");
  console.log("───────────────────────────────────────────────");
  for (const r of results) {
    const label = r.service.padEnd(width, " ");
    const outcome =
      r.outcome === "PASS"
        ? "[32mPASS[0m"
        : r.outcome === "SKIP"
          ? "[2mSKIP[0m"
          : "[31mFAIL[0m";
    console.log(`  ${label}  ${outcome}  ${r.detail ?? ""}`);
  }
  console.log("");
}

main().catch((error) => {
  console.error("smoke script failed:", error);
  process.exit(1);
});
