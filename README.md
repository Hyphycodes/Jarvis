# Jarvis

A private AI lifestyle operating system for one user.

> This repository is the **foundation pass**. Product surfaces (Today,
> Radar, Circle, North, Index, Voice dock) are intentionally not built
> yet. Design direction lands later. See `docs/tier-1-scope.md`.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + auth)
- Anthropic API
- Vercel (deploy target)
- pnpm

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill placeholders, or use the values already in .env.local
pnpm dev
```

Open <http://localhost:3000>. Visit `/health` to confirm env vars load.

## Scripts

| script           | description                          |
| ---------------- | ------------------------------------ |
| `pnpm dev`       | Local dev server                     |
| `pnpm build`     | Production build                     |
| `pnpm start`     | Run the built app                    |
| `pnpm typecheck` | `tsc --noEmit`                       |
| `pnpm lint`      | Next.js lint                         |

## Environment variables

Defined in `.env.example`. All required keys are validated at runtime by
`lib/env.ts` (zod); the app fails loudly if any required value is missing.

| variable                          | required | notes                               |
| --------------------------------- | -------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | yes      | Supabase project URL                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | yes      | Supabase anon key (client-safe)     |
| `SUPABASE_SERVICE_ROLE_KEY`       | yes      | Server only. Bypasses RLS.          |
| `ANTHROPIC_API_KEY`               | yes      | Anthropic / Claude API key          |
| `CRON_SECRET`                     | yes      | Shared secret for scheduled jobs    |
| `NEXT_PUBLIC_SITE_URL`            | **yes for auth** | Public origin, used in magic-link `emailRedirectTo` |

Real values live in Vercel and are committed nowhere. `.env.local` ships
with non-secret placeholders so the app boots locally without network.

### Auth setup (Supabase)

1. **Vercel env vars** — set these for both Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` — your production origin, e.g.
     `https://jarvis-five-gamma.vercel.app` (no trailing slash). Without
     this, magic-link emails point to `localhost:3000` and lead nowhere.
2. **Supabase Auth settings** (Dashboard → Authentication → URL
   Configuration):
   - **Site URL** — same value as `NEXT_PUBLIC_SITE_URL`.
   - **Redirect URLs** — add an entry for `${SITE_URL}/auth/callback`
     (and any preview origins you use, plus
     `http://localhost:3000/auth/callback` for local dev).
3. **Apply the schema** — run `supabase/migrations/0001_init.sql` in the
   SQL Editor, then `supabase/seed.sql` to load the seed helper.
4. **Sign up the founder** — visit `/login`, enter your email, click the
   magic link. You should land on `/profile`.
5. **Promote to owner + populate identity** — in Supabase SQL Editor:

   ```sql
   select public.seed_founder('your-email@example.com');
   ```

   (The function looks up `auth.users` by email and is idempotent — safe
   to re-run.) Visit `/settings` to confirm role, profile rows, and
   memory/signal counts.

If sign-in stalls, `/settings` is your diagnostic surface — it shows
whether the session is active, whether profile/founder rows exist, and
whether the required env vars are present (including the final
**Callback URL** the app is computing for magic links).

### Testing login end-to-end

There are two sign-in modes on `/login`:

- **Magic Link** — enter your email, click the link in the email.
- **Password** — sign in to an existing account, or create a new one.
  Supabase may require email confirmation for new accounts (a
  confirmation link is sent automatically).

To verify:

1. Visit `/login`. Choose Magic Link or Password.
2. Complete sign-in. You should land on `/settings`.
3. `/settings` should show:
   - your email + user id
   - role (`viewer` initially; `owner` after seeding)
   - session **Active**
   - Auth & Environment values matching what you set in Vercel
4. If you're the founder, run the seed command in Supabase SQL Editor:
   ```sql
   select public.seed_founder('your-email@example.com');
   ```
5. Refresh `/settings`. Role should now read `owner`, founder_profile
   should be **Yes**, and memory/signal counts should be populated.
6. Sign out from `/settings`. You're redirected back to `/login`.

The seed helper accepts the **email**, not a UUID — internally it
looks up `auth.users` and is idempotent, so it's safe to re-run.

Settings live inside the **North** tab as an "Account & Settings"
row near the bottom. There is no floating settings icon on Today.

## Folder layout

```
/app           Next.js routes
/components    UI primitives (built later)
/theme         design tokens (built later)
/lib/ai        provider-agnostic AI wrappers
/lib/directory taste graph, places, people, standards
/lib/memory    long-term memory layer
/lib/research  external API adapters + research cache
/lib/tools     tool implementations for the AI layer
/lib/cache     caching primitives
/lib/scoring   relevance and surfacing logic
/jobs          background curation jobs
/docs          vision, principles, architecture
```

## Docs

Start with [docs/vision.md](docs/vision.md), then read in this order:

1. `docs/product-principles.md`
2. `docs/design-language.md`
3. `docs/architecture.md`
4. `docs/ai-orchestration.md`
5. `docs/schema-plan.md`
6. `docs/tier-1-scope.md`

## Deploy

Push to `main`. Vercel is configured with the env vars above.
