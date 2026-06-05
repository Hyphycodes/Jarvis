-- Add image_url to places_library so resolved photos survive inbox->library conversion.
alter table public.places_library
  add column if not exists image_url text;
