create index if not exists circle_updates_person_id_idx        on public.circle_updates (person_id);
create index if not exists current_events_library_place_id_idx on public.current_events (library_place_id);
create index if not exists current_events_source_id_idx        on public.current_events (source_id);
create index if not exists decision_runs_refined_into_idx      on public.decision_runs (refined_into);
create index if not exists north_signals_pillar_id_idx         on public.north_signals (pillar_id);
create index if not exists places_library_source_id_idx        on public.places_library (source_id);
create index if not exists plan_sections_user_id_idx           on public.plan_sections (user_id);
create index if not exists today_timeline_items_plan_id_idx    on public.today_timeline_items (plan_id);
