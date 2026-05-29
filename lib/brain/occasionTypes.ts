export const OCCASION_TYPES = [
  "refined_dinner",
  "casual_hang",
  "big_night_out",
  "ritual_maintenance",
  "cultural_anchor",
  "date_night",
  "guys_night",
  "weekday_after_work",
  "weekend_day_move",
  "weekend_night_move",
  "family_time",
  "creative_session",
] as const;

export type OccasionType = (typeof OCCASION_TYPES)[number];
