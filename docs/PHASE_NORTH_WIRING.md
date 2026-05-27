# North Wiring — Deferred

The `LIFE_CATEGORIES` and `NEXT_REPS` arrays in `app/(tabs)/north/Signed.tsx` are currently hardcoded reference data used for visual design validation. Future wiring should pull live data from the `north_pillars` and `north_signals` Supabase tables (both already exist in the schema). The `NorthPayload` type in `lib/ai/types` defines the expected shape for when that wiring is implemented.
