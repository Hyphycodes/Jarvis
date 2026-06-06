/**
 * Stock / editorial photo libraries. Discovery sometimes name-matches a venue
 * to one of these and lands an unrelated people-or-generic shot (e.g. a Getty
 * red-carpet photo for a restaurant). Those are worse than a tasteful
 * placeholder, so we never surface them as a venue hero.
 */
const UNRELIABLE_IMAGE_HOSTS = [
  "gettyimages",
  "shutterstock",
  "istockphoto",
  "alamy",
  "depositphotos",
  "dreamstime",
  "123rf",
];

/**
 * True when a URL is a plausible venue photo: an http(s) image that is not from
 * a known stock/editorial host. Used to gate library images before they become
 * a card's hero.
 */
export function isUsableVenueImageUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return !UNRELIABLE_IMAGE_HOSTS.some((bad) => host.includes(bad));
}
