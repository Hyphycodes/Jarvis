export type SeasonalContext = {
  season:
    | "winter"
    | "early_spring"
    | "spring"
    | "early_summer"
    | "summer"
    | "late_summer"
    | "fall"
    | "late_fall";
  monthName: string;
  expectedVibes: string[];
  notableWindows: string[];
  weatherPosture: string;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Chicago-specific seasonal context keyed by 0-indexed month.
// Feb (1) and Dec (11) are covered by the winter block.
const SEASON_MAP: Record<number, Omit<SeasonalContext, "monthName">> = {
  // January — deep winter
  0: {
    season: "winter",
    expectedVibes: [
      "indoor dining",
      "fireside lounges",
      "date-night warmth",
      "whiskey weather",
      "museum runs",
    ],
    notableWindows: [
      "restaurant week (late Jan)",
      "NBA / Blackhawks home games",
      "Art Institute programming",
    ],
    weatherPosture: "deep cold — outdoor plans need strong motivation",
  },
  // February — late winter
  1: {
    season: "winter",
    expectedVibes: [
      "indoor dining",
      "Valentine's-adjacent programming",
      "jazz clubs",
      "cabin fever energy",
    ],
    notableWindows: [
      "Chicago Restaurant Week (early Feb)",
      "NBA All-Star / trade deadline energy",
      "craft spirits events",
    ],
    weatherPosture: "still cold, occasional mild break — layers required",
  },
  // March — early spring
  2: {
    season: "early_spring",
    expectedVibes: [
      "longer days arriving",
      "cabin fever breaking",
      "first outdoor ambitions",
      "St. Patrick's weekend energy",
    ],
    notableWindows: [
      "St. Patrick's Day dyeing of the river",
      "NCAA tournament watch parties",
      "spring menu launches",
    ],
    weatherPosture: "still cold but lengthening days — selective outdoor exposure",
  },
  // April — spring
  3: {
    season: "spring",
    expectedVibes: [
      "blooming city",
      "first outdoor dining",
      "lighter evenings",
      "baseball season opening",
      "neighborhood walks returning",
    ],
    notableWindows: [
      "White Sox / Cubs opening day",
      "spring menu rollouts",
      "gallery openings (post-Expo)",
      "Whalon Lake season opening",
    ],
    weatherPosture: "jacket weather — patio season cautiously opening",
  },
  // May — spring into early summer
  4: {
    season: "early_summer",
    expectedVibes: [
      "patio season opening in earnest",
      "warm evenings emerging",
      "outdoor markets and fairs",
      "Chicago Marathon training energy",
    ],
    notableWindows: [
      "Memorial Day weekend",
      "Chicago-area food festivals starting",
      "rooftop season opening",
      "lakefront bike paths active",
    ],
    weatherPosture: "warm enough for outdoor — light layers for evening",
  },
  // June — early summer
  5: {
    season: "early_summer",
    expectedVibes: [
      "rooftop energy",
      "lakefront activation",
      "long evenings",
      "outdoor music beginning",
      "cigar-weather evenings",
    ],
    notableWindows: [
      "Chicago Pride",
      "Taste of Chicago (early June)",
      "outdoor concert season opening",
      "Sox home stands",
    ],
    weatherPosture: "warm and comfortable — full outdoor activation",
  },
  // July — summer peak
  6: {
    season: "summer",
    expectedVibes: [
      "lakefront fully active",
      "rooftop season peak",
      "light evenings until 9 PM",
      "weekend getaway energy",
      "park BBQ culture",
    ],
    notableWindows: [
      "Lollapalooza (early August)",
      "Chicago Blues Festival",
      "4th of July lakefront",
      "Sox All-Star energy",
    ],
    weatherPosture: "hot — patio and rooftop preferred, lakefront breezes",
  },
  // August — late summer
  7: {
    season: "late_summer",
    expectedVibes: [
      "last call patio energy",
      "end-of-summer urgency",
      "outdoor music closing acts",
      "White Sox late-season",
      "golden-hour evenings",
    ],
    notableWindows: [
      "Lollapalooza (early Aug)",
      "Chicago Air and Water Show",
      "White Sox late-season home games",
      "restaurant summer menus ending",
    ],
    weatherPosture: "warm fading to comfortable — enjoy outdoor while it lasts",
  },
  // September — fall
  8: {
    season: "fall",
    expectedVibes: [
      "jacket weather returning",
      "cultural programming heavy",
      "football season energy",
      "cigar weather ideal",
      "fall menu launches",
    ],
    notableWindows: [
      "EXPO Chicago (mid-Sept)",
      "Chicago Jazz Festival (Labor Day weekend)",
      "Bears home games starting",
      "fall menu launches across the city",
    ],
    weatherPosture: "jacket evenings — outdoor still viable, especially midday",
  },
  // October — fall peak
  9: {
    season: "fall",
    expectedVibes: [
      "peak fall color",
      "Whalon Lake fall walks",
      "harvest dinner energy",
      "whiskey and leather",
      "Bears / college football Saturdays",
    ],
    notableWindows: [
      "Chicago Marathon (mid-Oct)",
      "Frieze Chicago possibility",
      "halloween-adjacent programming",
      "end-of-patio-season farewell dinners",
    ],
    weatherPosture: "cool and crisp — layers, great outdoor window before cold sets in",
  },
  // November — late fall
  10: {
    season: "late_fall",
    expectedVibes: [
      "early dark evenings",
      "holiday programming starting",
      "layered menswear season",
      "indoor culture",
      "NBA / Blackhawks home season in full swing",
    ],
    notableWindows: [
      "Chicago Restaurant Week preview deals",
      "holiday market openings (Christkindlmarket late Nov)",
      "Thanksgiving weekend restaurant programs",
    ],
    weatherPosture: "cold with occasional mild days — primarily indoor orientation",
  },
  // December — winter
  11: {
    season: "winter",
    expectedVibes: [
      "holiday programming",
      "year-end reflection",
      "private dinners",
      "Christkindlmarket",
      "indoor luxury",
    ],
    notableWindows: [
      "Christkindlmarket (through Dec 24)",
      "New Year's Eve programming",
      "restaurant holiday menus",
      "gallery year-end shows",
    ],
    weatherPosture: "cold — indoor luxury and purposeful outdoor excursions only",
  },
};

export function getSeasonalContext(date: Date = new Date()): SeasonalContext {
  const month = date.getMonth();
  const base = SEASON_MAP[month];
  return {
    ...base,
    monthName: MONTH_NAMES[month],
  };
}
