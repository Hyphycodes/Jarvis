/**
 * Specialist source seeds + domain config per sub-library (per radar-curation-engine.md
 * PARTS 3 & 5). Each sub-library scouts from sources that are experts in *that*
 * specific thing — fishing a stocked pond, not the open ocean — so candidates
 * arrive already higher quality. The specialist brief drives the scout prompt and
 * (later) the council's axis weighting.
 */

export type SubLibraryConfig = {
  /** Table name = sub-library id. */
  subLibrary: string;
  lane: string;
  label: string;
  /** Example sub_types the scout should tag candidates with. */
  subTypes: string[];
  /** Specialist editorial sources to fish from first (scout may discover more). */
  specialistSources: string[];
  /** Domain-expertise brief — what "good" means here (PART 5). */
  brief: string;
};

export const DINING_SUBLIBRARIES: Record<string, SubLibraryConfig> = {
  dining_restaurants: {
    subLibrary: "dining_restaurants",
    lane: "dining",
    label: "Restaurants",
    subTypes: [
      "new_opening", "neighborhood_gem", "reservation_worthy", "chicago_classic",
      "natural_wine", "omakase", "steakhouse", "trattoria", "tasting_menu", "second_stop",
    ],
    specialistSources: [
      "Eater Chicago", "The Infatuation Chicago", "Chicago Magazine dining",
      "Chicago Reader food", "Michelin Guide Chicago", "neighborhood food blogs",
    ],
    brief:
      "You know Chicago dining block-level. You judge real culinary identity vs trend-chasing, " +
      "chef pedigree, natural wine programs, and 'no pretense' in the room and service. You prize " +
      "energy over scene. No tourist traps, no see-and-be-seen, no Instagram bait.",
  },
  dining_bars: {
    subLibrary: "dining_bars",
    lane: "dining",
    label: "Bars",
    subTypes: [
      "cocktail_bar", "natural_wine_bar", "listening_bar", "neighborhood_tavern",
      "hotel_bar", "dive_with_soul", "jazz_lounge",
    ],
    specialistSources: [
      "Punch", "Imbibe", "Eater Chicago bars", "The Infatuation bars", "Chicago Reader",
    ],
    brief:
      "You judge serious cocktail programs vs bottle-service-adjacent rooms, good bar food, and " +
      "convivial vs just-loud. Soul over flash. A great listening bar or a real neighborhood tavern " +
      "beats a hyped nightclub every time.",
  },
  dining_cafes: {
    subLibrary: "dining_cafes",
    lane: "dining",
    label: "Cafes",
    subTypes: ["specialty_coffee", "slow_morning", "bakery_cafe", "work_friendly", "espresso_bar"],
    specialistSources: ["Sprudge", "neighborhood coffee guides", "Eater Chicago coffee"],
    brief:
      "You judge specialty coffee vs performance latte art, and slow-morning rooms worth sitting in. " +
      "Real sourcing and craft over aesthetics-for-the-feed.",
  },
};

export function diningSubLibraryIds(): string[] {
  return Object.keys(DINING_SUBLIBRARIES);
}
