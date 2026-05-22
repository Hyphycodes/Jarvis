-- =====================================================================
-- Jarvis · founder seed
-- Idempotent. Run after the founder has signed up via magic link.
-- =====================================================================
-- Usage:
--   1. Sign up the founder via /login (Supabase magic link / OTP).
--   2. Run:  select public.seed_founder('founder@your-email.com');
--      (or pass a uuid if you already know auth.users.id)
--
-- This:
--   • promotes the matching profiles row to app_role = 'owner'
--   • upserts founder_profile with the durable identity
--   • inserts the high-signal memory_items
--   • inserts the starter taste_signals
-- =====================================================================

create or replace function public.seed_founder(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = p_email limit 1;
  if v_user_id is null then
    raise exception 'No auth.users row found for email %. Sign up first via /login.', p_email;
  end if;

  perform public.seed_founder_for(v_user_id);
end;
$$;

create or replace function public.seed_founder_for(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sparrow_plan_id uuid;
  v_pillar_jarvis_id uuid;
  v_pillar_italy_id uuid;
  v_pillar_capital_id uuid;
  v_person_marco_id uuid;
  v_person_alex_id uuid;
  v_person_lucia_id uuid;
begin
  -- 1. Promote profile to owner
  update public.profiles
     set app_role     = 'owner',
         display_name = coalesce(display_name, 'Founder'),
         home_city    = coalesce(home_city, 'Chicago / Bolingbrook, IL'),
         timezone     = coalesce(timezone, 'America/Chicago')
   where id = p_user_id;

  if not found then
    raise exception 'No profiles row for user_id %. The auth.users trigger should have created it.', p_user_id;
  end if;

  -- 2. Upsert founder_profile (durable identity)
  insert into public.founder_profile (
    user_id,
    faith_values,
    life_direction,
    current_focus,
    values,
    pinned_principles,
    vibe_keywords,
    avoid_keywords,
    dealbreakers,
    luxury_style,
    energy_preference,
    social_preference,
    budget_posture,
    food_preferences,
    music_preferences,
    venue_preferences,
    style_preferences,
    travel_preferences,
    active_projects,
    financial_goals,
    creative_goals,
    health_goals,
    travel_goals,
    cultural_growth_edges
  ) values (
    p_user_id,
    'Strong personal faith. Faith and intentionality are non-negotiable.',
    'Long-term Italy chapter, with Umbria as a serious candidate. Ownership, craftsmanship, and a quieter life on chosen ground.',
    'Building Jarvis. Sharpening taste. Investing with intention.',
    array['faith', 'family', 'intentionality', 'ownership', 'precision', 'authenticity', 'discipline'],
    array[
      'Italy matters — long-term direction includes a serious Italy chapter, possibly Umbria',
      'Prefers one strong recommendation over long lists',
      'Quality over quantity, always',
      'Subtle luxury, never flashy',
      'Faith and intentionality are non-negotiable'
    ],
    array['cinematic', 'refined', 'intentional', 'atmospheric', 'warm', 'classy', 'hidden', 'culturally aware'],
    array['generic', 'corny', 'touristy', 'loud', 'basic', 'influencer-style', 'hypebeast', 'trendy-for-trendy''s-sake', 'Yelp-style'],
    array['loud rooms with no soul', 'menus designed for tourists', 'service that performs instead of attending'],
    'subtle',
    'elevated but relaxed',
    'intimate · rooms with weight',
    'spends with intention; not driven by price',
    array['craftsmanship-oriented cooking', 'seasonal menus', 'natural wine', 'tasting that doesn''t perform'],
    array['classic soul', 'jazz', 'house with taste', 'vinyl-led rooms'],
    array['quiet cigar lounges', 'hidden hotel bars', 'rooms with weight', 'craftsmanship-led venues'],
    array['tailored, never formal', 'quiet luxury', 'considered fabrics'],
    array['Italy', 'Mediterranean', 'craftsmanship destinations', 'rugged + refined trips'],
    array['Jarvis', 'real estate investing', 'creative production', 'music / DJ', 'land ownership'],
    array['build long-term capital base', 'acquire income-producing property', 'fund the Italy chapter'],
    array['ship Jarvis', 'develop a body of music work', 'produce something that lasts'],
    array['steady fitness', 'mobility', 'longevity over aesthetics'],
    array['serious Italy chapter (Umbria a candidate)', 'craftsmanship pilgrimages', 'rugged nature trips'],
    array['opera', 'jazz lineage', 'architecture exhibits', 'craftsmanship traditions', 'hosting', 'rugged nature']
  )
  on conflict (user_id) do update set
    faith_values          = excluded.faith_values,
    life_direction        = excluded.life_direction,
    current_focus         = excluded.current_focus,
    values                = excluded.values,
    pinned_principles     = excluded.pinned_principles,
    vibe_keywords         = excluded.vibe_keywords,
    avoid_keywords        = excluded.avoid_keywords,
    dealbreakers          = excluded.dealbreakers,
    luxury_style          = excluded.luxury_style,
    energy_preference     = excluded.energy_preference,
    social_preference     = excluded.social_preference,
    budget_posture        = excluded.budget_posture,
    food_preferences      = excluded.food_preferences,
    music_preferences     = excluded.music_preferences,
    venue_preferences     = excluded.venue_preferences,
    style_preferences     = excluded.style_preferences,
    travel_preferences    = excluded.travel_preferences,
    active_projects       = excluded.active_projects,
    financial_goals       = excluded.financial_goals,
    creative_goals        = excluded.creative_goals,
    health_goals          = excluded.health_goals,
    travel_goals          = excluded.travel_goals,
    cultural_growth_edges = excluded.cultural_growth_edges,
    updated_at            = now();

  -- 3. Seed memory_items (idempotent: only insert if not already present by content)
  insert into public.memory_items (user_id, content, kind, confidence, source, is_pinned)
  select p_user_id, c.content, c.kind, c.confidence, 'seed', c.pinned
  from (values
    ('Prefers refined but relaxed environments over formal or stiff ones', 'preference', 0.85, false),
    ('Values atmosphere, story, and conversation potential in venues', 'preference', 0.85, false),
    ('Responds well to craftsmanship-oriented experiences', 'pattern', 0.8, false),
    ('Dislikes overly trendy or influencer-driven recommendations', 'pattern', 0.85, false),
    ('Long-term direction includes a serious Italy chapter, with Umbria as a candidate', 'identity', 0.9, true),
    ('Prefers subtle luxury over flashy luxury', 'principle', 0.9, true),
    ('Values faith, intentionality, and ownership as durable principles', 'identity', 0.9, true),
    ('Often prefers one strong recommendation over long undifferentiated lists', 'principle', 0.85, true),
    ('Has active interests in real estate investing, creative production, music, watches, cigars, travel, fitness, land ownership, design, art, and architecture', 'identity', 0.85, false),
    ('Responds well to spaces that feel warm, cinematic, culturally aware, and hidden', 'pattern', 0.8, false),
    ('Prefers quality over quantity in recommendations and experiences', 'principle', 0.85, true),
    ('Likes a balance of ruggedness and refinement', 'preference', 0.8, false),
    ('Dislikes generic Yelp-style recommendations', 'pattern', 0.85, false),
    ('Values originality, precision, and authenticity', 'principle', 0.85, true),
    ('Wants recommendations to align with taste while occasionally stretching into deeper cultural territory', 'principle', 0.85, true)
  ) as c(content, kind, confidence, pinned)
  where not exists (
    select 1 from public.memory_items m
    where m.user_id = p_user_id and m.content = c.content
  );

  -- 4. Seed taste_signals
  insert into public.taste_signals (user_id, trait, direction, category, weight, confidence, source)
  select p_user_id, t.trait, t.direction, t.category, t.weight, t.confidence, 'seed'
  from (values
    ('quiet cigar lounge',              'positive', 'venue',      1.2, 0.7),
    ('walkable second stop',            'positive', 'plan_shape', 1.0, 0.6),
    ('refined but not stiff',           'positive', 'atmosphere', 1.2, 0.7),
    ('good conversation atmosphere',    'positive', 'atmosphere', 1.3, 0.75),
    ('craftsmanship-oriented experience','positive','venue',      1.2, 0.7),
    ('hidden culturally aware venue',   'positive', 'venue',      1.1, 0.65),
    ('warm cinematic room',             'positive', 'atmosphere', 1.2, 0.7),
    ('loud trendy lounge',              'negative', 'venue',      1.2, 0.7),
    ('long drive for weak payoff',      'negative', 'plan_shape', 1.0, 0.65),
    ('generic Yelp-style restaurant',   'negative', 'food',       1.3, 0.75),
    ('corporate/hypebeast aesthetic',   'negative', 'style',      1.2, 0.7),
    ('basic influencer spot',           'negative', 'venue',      1.2, 0.7),
    ('touristy experience with no depth','negative', 'venue',     1.2, 0.7)
  ) as t(trait, direction, category, weight, confidence)
  where not exists (
    select 1 from public.taste_signals s
    where s.user_id = p_user_id and s.trait = t.trait and s.direction = t.direction
  );

  -- 5. Seed Sparrow plan (idempotent on title)
  select id into v_sparrow_plan_id
    from public.plans
   where user_id = p_user_id and title = 'Sparrow Tonight'
   limit 1;

  if v_sparrow_plan_id is null then
    insert into public.plans (
      user_id, title, category, date, location_line, summary,
      live_enabled, live_label, key_stats, quote_card, status
    ) values (
      p_user_id,
      'Sparrow Tonight',
      'dining',
      to_char(now() at time zone 'America/Chicago', 'FMMonth FMDD, YYYY'),
      'West Loop, Chicago · 8:30 PM',
      'Rain clears by 7:10pm. Best arriving after sunset.',
      false,
      'BEGIN',
      jsonb_build_object(
        'leave_by', '7:42 PM',
        'weather', '61° clearing',
        'parking', 'Valet — arrive before 8:15',
        'nearby_person', 'Marco C. in West Loop'
      ),
      jsonb_build_object(
        'text', 'Quiet night. Deep food. Good for long conversation and even better for listening.',
        'source', 'J.'
      ),
      'active'
    ) returning id into v_sparrow_plan_id;
  end if;

  -- 6. Seed plan sections (idempotent on (plan_id, section_id))
  insert into public.plan_sections (user_id, plan_id, section_id, title, subtitle, icon, content, sort_order)
  select p_user_id, v_sparrow_plan_id, s.section_id, s.title, s.subtitle, s.icon, s.content, s.sort_order
  from (values
    (
      'before_you_go', 'Before You Go',
      'What to wear, bring, and know before you leave.', 'jacket',
      jsonb_build_object(
        'attire', array['Tailored layer', 'Dark trousers', 'Subtle textures'],
        'bring', array['Cash for valet tip', 'Reservation confirmation', 'Light jacket'],
        'know',  array['Rain clears by 7:10pm', 'Valet runs at $18', 'Tasting menu runs ~2 hours']
      ), 1
    ),
    (
      'the_move', 'The Move',
      'The flow of the night, step by step.', 'wine',
      jsonb_build_object(
        'steps', array[
          '7:42 PM — Leave home. Take Eisenhower east.',
          '8:15 PM — Valet at Sparrow. Walk in calm.',
          '8:30 PM — Reservation under your name. Corner two-top.',
          '10:15 PM — Walk to The Aviary for a single drink.',
          '11:30 PM — Wind down. Cigar lounge if open, otherwise home.'
        ]
      ), 2
    ),
    (
      'atmosphere', 'Atmosphere',
      'Energy, music, lighting, and the mood.', 'record',
      jsonb_build_object(
        'mood', 'Low light, brick room, slow tempo.',
        'music', 'Vinyl-led — jazz lineage, soul, occasional house with taste.',
        'energy', 'Conversation-forward. Not for groups over four.'
      ), 3
    ),
    (
      'details', 'The Details',
      'Address, reservation, contacts, and intel.', 'pin',
      jsonb_build_object(
        'address', '12 N Carpenter St, Chicago, IL 60607',
        'reservation', 'Confirmed · party of 2',
        'parking', 'Valet at front',
        'hours', '5:00 PM – 11:00 PM',
        'contacts', array['Host: Diane', 'Chef: Marc'],
        'chef', 'Marc — known for seasonal tasting menus'
      ), 4
    ),
    (
      'optional_detours', 'Optional Detours',
      'Places worth considering along the way.', 'sign',
      jsonb_build_object(
        'detours', array[
          'The Aviary — quiet drink before or after',
          'Salt Shed — only if the headline lands',
          'Time Out Market — late-night second stop'
        ]
      ), 5
    ),
    (
      'after', 'After',
      'How the night can end well.', 'moon',
      jsonb_build_object(
        'options', array[
          'Cigar at Maxwell Lounge if open',
          'Slow drive home, windows down',
          'Voice memo: what landed, what didn''t'
        ]
      ), 6
    )
  ) as s(section_id, title, subtitle, icon, content, sort_order)
  where not exists (
    select 1 from public.plan_sections ps
    where ps.plan_id = v_sparrow_plan_id and ps.section_id = s.section_id
  );

  -- 7. Seed today_timeline_items (idempotent on (user_id, time, title))
  insert into public.today_timeline_items (user_id, plan_id, time, title, status, expandable, details, sort_order)
  select p_user_id, v_sparrow_plan_id, t.time, t.title, t.status, t.expandable, t.details, t.sort_order
  from (values
    ('7:00 AM',  'Morning quiet',                 'pending', false, null, 1),
    ('10:30 AM', 'Deep work block — Jarvis',     'pending', false, null, 2),
    ('1:00 PM',  'Lunch + walk',                  'pending', false, null, 3),
    ('4:30 PM',  'Pre-evening reset',             'pending', false, null, 4),
    ('7:42 PM',  'Leave for Sparrow',             'pending', true,  'Valet by 8:15. Tasting starts at 8:30.', 5),
    ('8:30 PM',  'Sparrow · West Loop',           'pending', true,  'Corner two-top. ~2 hours.', 6),
    ('11:00 PM', 'Wind down',                     'pending', false, null, 7)
  ) as t(time, title, status, expandable, details, sort_order)
  where not exists (
    select 1 from public.today_timeline_items ti
    where ti.user_id = p_user_id and ti.time = t.time and ti.title = t.title
  );

  -- 8. Seed north_pillars (idempotent on (user_id, title))
  insert into public.north_pillars (user_id, title, description, progress, active_signals)
  values
    (p_user_id, 'Jarvis',
     'Ship the private operating system. Sharpen every surface.',
     0.35, array['build', 'taste', 'memory'])
  on conflict do nothing;

  insert into public.north_pillars (user_id, title, description, progress, active_signals)
  values
    (p_user_id, 'Italy chapter',
     'Long-term direction — Umbria a serious candidate. Ownership, craft, quieter ground.',
     0.15, array['italy', 'land', 'craft'])
  on conflict do nothing;

  insert into public.north_pillars (user_id, title, description, progress, active_signals)
  values
    (p_user_id, 'Capital base',
     'Build durable income property and fund the Italy chapter.',
     0.25, array['real_estate', 'capital'])
  on conflict do nothing;

  select id into v_pillar_jarvis_id from public.north_pillars where user_id = p_user_id and title = 'Jarvis' limit 1;
  select id into v_pillar_italy_id from public.north_pillars where user_id = p_user_id and title = 'Italy chapter' limit 1;
  select id into v_pillar_capital_id from public.north_pillars where user_id = p_user_id and title = 'Capital base' limit 1;

  insert into public.north_signals (user_id, pillar_id, title, summary, action, source)
  select p_user_id, ns.pillar_id, ns.title, ns.summary, ns.action, ns.source
  from (values
    (v_pillar_jarvis_id,  'Universal Index online',   'Surfaced items now persist with full lifecycle.', 'Validate dispatch end-to-end',  'manual'),
    (v_pillar_italy_id,   'Umbria scouting list',     'Three candidate towns worth a closer look.',      'Build short list this month',   'manual'),
    (v_pillar_capital_id, 'Off-market lead — South Loop', 'Two-unit deal worth a walkthrough.',         'Schedule a walkthrough',        'manual')
  ) as ns(pillar_id, title, summary, action, source)
  where not exists (
    select 1 from public.north_signals s
    where s.user_id = p_user_id and s.title = ns.title
  );

  -- 9. Seed circle_people (idempotent on (user_id, name))
  insert into public.circle_people (user_id, name, category, role, closeness_score, last_interaction, next_action, current_thread, notes)
  select p_user_id, cp.name, cp.category, cp.role, cp.closeness_score, cp.last_interaction, cp.next_action, cp.current_thread, cp.notes
  from (values
    ('Marco C.', 'homies',       'longtime friend', 0.9,
     '2 days ago', 'Pick a Sparrow night', 'Talking about Italy logistics',
     array['Already lived in Florence', 'Knows craftsmanship circles in Umbria']),
    ('Alex R.',  'real_estate',  'broker',          0.7,
     'Last week',  'Walk the South Loop two-unit', 'Off-market deal queue',
     array['Brings deals worth looking at', 'Quiet operator']),
    ('Lucia M.', 'italy',        'Umbria contact',  0.6,
     '3 weeks ago', 'Plan an introduction visit', 'Land ownership conversations',
     array['Lives outside Perugia', 'Open to hosting'])
  ) as cp(name, category, role, closeness_score, last_interaction, next_action, current_thread, notes)
  where not exists (
    select 1 from public.circle_people p
    where p.user_id = p_user_id and p.name = cp.name
  );

  select id into v_person_marco_id from public.circle_people where user_id = p_user_id and name = 'Marco C.' limit 1;
  select id into v_person_alex_id  from public.circle_people where user_id = p_user_id and name = 'Alex R.'  limit 1;
  select id into v_person_lucia_id from public.circle_people where user_id = p_user_id and name = 'Lucia M.' limit 1;

  insert into public.circle_updates (user_id, person_id, title, summary, suggested_action, urgency, source)
  select p_user_id, cu.person_id, cu.title, cu.summary, cu.suggested_action, cu.urgency, cu.source
  from (values
    (v_person_marco_id, 'Marco is in West Loop tonight',
     'Schedule overlaps with the Sparrow window. Could grab a drink before or after.',
     'Text Marco about a 10:30 PM drink', 'medium', 'manual'),
    (v_person_alex_id,  'New off-market deal arrived',
     'Two-unit, South Loop. Numbers look workable.',
     'Schedule a walkthrough this week', 'medium', 'manual'),
    (v_person_lucia_id, 'Umbria intro visit window',
     'Lucia mentioned an open week in September.',
     'Block the September window before it closes', 'low', 'manual')
  ) as cu(person_id, title, summary, suggested_action, urgency, source)
  where not exists (
    select 1 from public.circle_updates u
    where u.user_id = p_user_id and u.title = cu.title
  );

  -- 10. Seed surfaced_items for Radar (idempotent on (user_id, destination, title))
  insert into public.surfaced_items (
    user_id, destination, source, source_id, type, category,
    title, subtitle, description, location_name, address,
    starts_at, expires_at, payload, score, status, reasons, tags
  )
  select p_user_id, 'radar', 'system', si.source_id, si.type, si.category,
         si.title, si.subtitle, si.description, si.location_name, si.address,
         si.starts_at, si.expires_at, si.payload, si.score, 'discovered', si.reasons, si.tags
  from (values
    (
      'seed-bar-1', 'place', 'places',
      'Maxwell Lounge', 'Quiet cigar room · Wicker Park',
      'Low-lit, brick room with vinyl. Walk-in friendly after 10pm.',
      'Wicker Park', '1240 N Damen Ave',
      null::timestamptz, null::timestamptz,
      jsonb_build_object('hours', '6 PM – 2 AM'),
      0.74,
      array['Quiet cigar lounge matches your venue taste', 'Open late tonight'],
      array['quiet', 'cigars', 'atmospheric', 'late']
    ),
    (
      'seed-event-1', 'event', 'events',
      'Jazz at Constellation', 'Saturday · Brad Mehldau Trio',
      'Vinyl-led jazz lineage in a small room. Tickets still available.',
      'Lincoln Square', '3111 N Western Ave',
      (now() + interval '2 days')::timestamptz, (now() + interval '2 days')::timestamptz,
      jsonb_build_object('source_url', 'https://constellation-chicago.com'),
      0.81,
      array['Jazz lineage matches your music taste', 'Small-room atmosphere'],
      array['jazz', 'small_room', 'music', 'atmosphere']
    ),
    (
      'seed-restaurant-1', 'restaurant', 'dining',
      'Daisies', 'Italian, hand-cut pasta · Logan Square',
      'Seasonal craft kitchen. Open kitchen. Tasting menu Wednesdays.',
      'Logan Square', '2523 N Milwaukee Ave',
      null::timestamptz, null::timestamptz,
      jsonb_build_object('cuisine', 'Italian'),
      0.78,
      array['Craftsmanship-oriented kitchen', 'Italian — aligns with long arc'],
      array['italian', 'seasonal', 'craft', 'pasta']
    ),
    (
      'seed-culture-1', 'culture', 'culture',
      'Architecture Biennial preview', 'Cultural Center · This weekend',
      'Free preview Friday evening. Quiet rooms, architectural drawings.',
      'Loop', '78 E Washington St',
      (now() + interval '3 days')::timestamptz, (now() + interval '6 days')::timestamptz,
      jsonb_build_object('admission', 'Free'),
      0.7,
      array['Architecture is on your cultural growth list', 'Quiet evening rooms'],
      array['architecture', 'cultural', 'quiet', 'free']
    ),
    (
      'seed-place-1', 'place', 'places',
      'Lost Lake', 'Tiki room with weight · Logan Square',
      'Hidden room, vinyl-led, no scene. Best after 10pm.',
      'Logan Square', '3154 W Diversey Ave',
      null::timestamptz, null::timestamptz,
      jsonb_build_object('vibe', 'hidden'),
      0.66,
      array['Hidden, culturally aware venue', 'Late-night quiet room'],
      array['hidden', 'late', 'vinyl', 'atmospheric']
    ),
    (
      'seed-real-estate-1', 'real_estate', 'opportunity',
      'Two-unit · South Loop', 'Off-market lead · via Alex R.',
      'Brick two-unit, well-kept, mid-market. Walkthrough this week.',
      'South Loop', null,
      null::timestamptz, (now() + interval '7 days')::timestamptz,
      jsonb_build_object('contact', 'Alex R.'),
      0.72,
      array['Aligned with capital base pillar', 'Off-market — early window'],
      array['real_estate', 'off_market', 'opportunity']
    )
  ) as si(
    source_id, type, category,
    title, subtitle, description, location_name, address,
    starts_at, expires_at, payload, score, reasons, tags
  )
  where not exists (
    select 1 from public.surfaced_items s
    where s.user_id = p_user_id
      and s.destination = 'radar'
      and s.title = si.title
  );
end;
$$;

comment on function public.seed_founder(text) is
  'Promotes the auth user with the given email to owner and seeds founder identity, memories, and taste signals. Idempotent.';
comment on function public.seed_founder_for(uuid) is
  'Same as seed_founder but takes a user_id directly. Idempotent.';
