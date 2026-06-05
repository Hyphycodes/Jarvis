/* Correctness checks for the image-resolver pure helpers.
 * Run: pnpm exec tsx scripts/images.test.ts
 */
import {
  isHttpUrl,
  looksLikeLogoOrIcon,
  passesAspectFilter,
  pickBestImage,
  parseOgImage,
  type ImageCandidate,
} from "@/lib/sources/images";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

console.log("isHttpUrl");
assert("accepts https", isHttpUrl("https://x.com/a.jpg"));
assert("rejects empty/relative", !isHttpUrl("") && !isHttpUrl("/a.jpg") && !isHttpUrl(null));

console.log("looksLikeLogoOrIcon");
assert("flags logo", looksLikeLogoOrIcon("https://x.com/assets/logo.png"));
assert("flags favicon", looksLikeLogoOrIcon("https://x.com/favicon.ico"));
assert("flags icon path", looksLikeLogoOrIcon("https://x.com/img/icon/star.png"));
assert("flags static map", looksLikeLogoOrIcon("https://maps.googleapis.com/maps/api/staticmap?center=x"));
assert("flags svg", looksLikeLogoOrIcon("https://x.com/a.svg"));
assert("passes real photo", !looksLikeLogoOrIcon("https://lh3.googleusercontent.com/places/abc123.jpg"));

console.log("passesAspectFilter");
assert("unknown dims trusted", passesAspectFilter({}));
assert("small square skipped", !passesAspectFilter({ width: 300, height: 300 }));
assert("small portrait skipped", !passesAspectFilter({ width: 280, height: 360 }));
assert("large landscape kept", passesAspectFilter({ width: 1200, height: 800 }));
assert("medium landscape kept", passesAspectFilter({ width: 500, height: 200 }));

console.log("pickBestImage");
{
  const cands: ImageCandidate[] = [
    { url: "https://x.com/brave.jpg", source: "brave_image", priority: 50 },
    { url: "https://places.googleapis.com/v1/photo/abc/media?key=k", source: "google_places", priority: 100 },
    { url: "https://x.com/og.jpg", source: "og:image", priority: 70 },
  ];
  const best = pickBestImage(cands);
  assert("picks highest priority", best?.source === "google_places");
}
{
  const cands: ImageCandidate[] = [
    { url: "https://x.com/logo.png", source: "brave_image", priority: 100 },
    { url: "https://x.com/real-venue-photo.jpg", source: "og:image", priority: 70 },
  ];
  const best = pickBestImage(cands);
  assert("filters logo even at higher priority", best?.source === "og:image");
}
{
  const cands: ImageCandidate[] = [
    { url: "https://x.com/tiny.jpg", source: "brave_image", priority: 100, width: 200, height: 200 },
  ];
  assert("returns null when all filtered", pickBestImage(cands) === null);
}
assert("empty → null", pickBestImage([]) === null);

console.log("parseOgImage");
assert(
  "property-first order",
  parseOgImage('<meta property="og:image" content="https://x.com/hero.jpg">') === "https://x.com/hero.jpg",
);
assert(
  "content-first order",
  parseOgImage('<meta content="https://x.com/hero2.jpg" name="twitter:image">') === "https://x.com/hero2.jpg",
);
assert("ignores non-http og:image", parseOgImage('<meta property="og:image" content="/local.jpg">') === null);
assert("null when absent", parseOgImage("<html><head><title>x</title></head></html>") === null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
