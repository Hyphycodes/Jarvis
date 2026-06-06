/* Correctness checks for the venue-image guard.
 * Run: pnpm exec tsx scripts/venue-image.test.ts
 */
import { isUsableVenueImageUrl } from "@/lib/items/venueImage";

let failures = 0;
function assert(label: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

console.log("isUsableVenueImageUrl");
// Accepts real venue / food-media photos (these are the backfilled ones).
assert("accepts venue site", isUsableVenueImageUrl("https://www.promontoryclub.com/photo.webp"));
assert("accepts the infatuation cdn", isUsableVenueImageUrl("https://res.cloudinary.com/the-infatuation/image/upload/Nadu.jpg"));
assert("accepts tripadvisor", isUsableVenueImageUrl("https://media-cdn.tripadvisor.com/media/photo-o/green-street.jpg"));
assert("accepts corner.inc", isUsableVenueImageUrl("https://cdn.corner.inc/ugc/nine-bar.jpeg"));

// Rejects stock / editorial hosts (the mismatched people photos).
assert("rejects gettyimages", !isUsableVenueImageUrl("https://media.gettyimages.com/id/2254666315/photo/nobu.jpg"));
assert("rejects shutterstock", !isUsableVenueImageUrl("https://www.shutterstock.com/image-photo/x.jpg"));
assert("rejects alamy", !isUsableVenueImageUrl("https://c8.alamy.com/comp/x/y.jpg"));

// Rejects non-image junk.
assert("rejects empty", !isUsableVenueImageUrl(""));
assert("rejects relative", !isUsableVenueImageUrl("/local.jpg"));
assert("rejects null", !isUsableVenueImageUrl(null));
assert("rejects non-string", !isUsableVenueImageUrl(42));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
