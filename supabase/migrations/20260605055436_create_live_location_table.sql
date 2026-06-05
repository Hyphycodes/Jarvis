-- Live GPS location store: one row per user, upserted by the browser client
-- while the PWA is foregrounded. Server reads this as the highest-priority
-- source in founderContextPacket before falling back to profile home coords.
CREATE TABLE public.live_location (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude     float8      NOT NULL,
  longitude    float8      NOT NULL,
  accuracy_m   float8      NOT NULL,
  captured_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_location_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.live_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_live_location"
  ON public.live_location
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
