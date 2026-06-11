-- Circle depth: a person profile holds their important dates, a running gift
-- list, and a contact rhythm — everything that hangs off a person.
-- important_dates: [{ "label": "birthday", "date": "MM-DD" | "YYYY-MM-DD" }]
-- gift_ideas:      [{ "idea": "...", "note": "...", "added_at": iso }]

alter table public.circle_people
  add column if not exists important_dates jsonb not null default '[]'::jsonb,
  add column if not exists gift_ideas jsonb not null default '[]'::jsonb,
  add column if not exists contact_rhythm_days integer,
  add column if not exists last_seen_at timestamptz;
