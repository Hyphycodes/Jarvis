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
end;
$$;

comment on function public.seed_founder(text) is
  'Promotes the auth user with the given email to owner and seeds founder identity, memories, and taste signals. Idempotent.';
comment on function public.seed_founder_for(uuid) is
  'Same as seed_founder but takes a user_id directly. Idempotent.';
