-- F2 enrichment engine: record the outcome of an enrichment pass so we can
-- distinguish "filled" from "no confident Google Places match" without guessing.
alter table public.places_library
  add column if not exists enrichment_status text;
