/* Correctness checks for the venue deep-link helpers.
 * Run: pnpm exec tsx scripts/venue-links.test.ts
 */
import {
  mapsSearchUrl,
  parkingMapsUrl,
  telUrl,
  reservationLink,
} from "@/lib/plans/venueLinks";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

console.log("mapsSearchUrl");
assert(
  "encodes the query",
  mapsSearchUrl("The Promontory, Hyde Park, Chicago") ===
    "https://www.google.com/maps/search/?api=1&query=The%20Promontory%2C%20Hyde%20Park%2C%20Chicago",
);

console.log("parkingMapsUrl");
assert(
  "prefixes 'parking near'",
  parkingMapsUrl("The Promontory").includes("parking%20near%20The%20Promontory"),
);

console.log("telUrl");
assert("strips formatting", telUrl("(312) 555-1234") === "tel:3125551234");
assert("keeps leading +", telUrl("+1 312 555 1234") === "tel:+13125551234");

console.log("reservationLink");
{
  const direct = reservationLink({
    url: "https://resy.com/cities/chicago/promontory",
    platform: "resy",
    venueQuery: "The Promontory Chicago",
  });
  assert("uses direct booking url", direct?.url.includes("resy.com/cities") === true);
  assert("labels by platform", direct?.label === "Reserve · Resy");
}
{
  const search = reservationLink({
    platform: "opentable",
    venueQuery: "The Promontory Chicago",
  });
  assert("falls back to web search for platform", Boolean(search?.url.includes("google.com/search")));
  assert("opentable label", search?.label === "Reserve · OpenTable");
}
assert(
  "walk_in → no link",
  reservationLink({ platform: "walk_in", venueQuery: "X" }) === null,
);
assert(
  "none → no link",
  reservationLink({ platform: "none", venueQuery: "X" }) === null,
);
assert(
  "website-only → no reserve link",
  reservationLink({ platform: "website", venueQuery: "X" }) === null,
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
