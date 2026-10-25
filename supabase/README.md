# Supabase setup (Trailmap)

## Apply the migration

**Option A — Supabase Dashboard (recommended for hackathon)**

1. Open your project → **SQL Editor**.
2. Paste and run [`migrations/20261024120000_init.sql`](./migrations/20261024120000_init.sql).
3. Confirm tables under **Table Editor**: `profiles`, `places`, `activities`, `activity_registrations`.

**Option B — Supabase CLI**

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Environment variables

Copy `.env.example` → `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable / anon key only)
- `NEXT_PUBLIC_DATA_SOURCE` — omit or `supabase` when configured; set `demo` to force mock data

Never put the **service role** key in `NEXT_PUBLIC_*` or browser code.

## PostGIS status

**Not configured or verified in this milestone.**  
Places and activities store `latitude` / `longitude` (`double precision`) with btree indexes.

### Planned geographic upgrade (later)

```sql
create extension if not exists postgis;
alter table public.places
  add column if not exists location geography(point, 4326)
  generated always as (
    st_setspaceg(st_makepoint(longitude, latitude), 4326)
  ) stored;
create index if not exists places_location_gix on public.places using gist (location);
```

Do not claim nearby/radius queries work until this is applied and tested.

## Capacity limitation

`activity_registrations` has `unique (activity_id, user_id)` to prevent duplicate registrations.  
That does **not** enforce `activities.capacity` under concurrent inserts. A later milestone should add a transactional RPC that locks the activity row, counts `status = 'registered'`, and inserts only if under capacity.

## Auth + profiles

1. Enable **Email** provider in Supabase Dashboard → Authentication (password sign-in).
2. Apply [`migrations/20261024200000_profiles_social.sql`](./migrations/20261024200000_profiles_social.sql) after the earlier migrations — adds profile social fields, `handle_new_user` trigger, and `discoverable_profiles_public` (fuzzed coords).
3. App UI: map nav **profile** icon → sign up / sign in → edit profile. Sessions use `@supabase/ssr` cookies.
4. Existing RLS: users update only `auth.uid() = id`. Public map people pins read the discoverable view only.

## Community posts

Apply [`migrations/20261024210000_community_posts.sql`](./migrations/20261024210000_community_posts.sql) after profiles. Creates `community_posts` with RLS (public / author_discoverable / private), owner-only mutate, and indexes for bounded list filters. No seed posts — users publish from the map nav **Community** icon (`MessagesSquare`). APIs: `GET/POST /api/posts`, `GET/PATCH/DELETE /api/posts/[id]`.

Then apply [`migrations/20261024220000_community_post_interactions.sql`](./migrations/20261024220000_community_post_interactions.sql) for `community_post_interests` (unique per user/post) and `community_post_replies`, plus count RPCs. APIs: `/api/posts/[id]/interest`, `/api/posts/[id]/replies`, `/api/posts/[id]/replies/[replyId]`.

## Seed sample map data

Tables start empty after migration. Run [`seed/demo_places_activities.sql`](./seed/demo_places_activities.sql) in the SQL Editor to insert 3 places + 3 upcoming activities (no auth users / discoverable profiles).

Hard-refresh the app afterward. The nav data-source line should read **Supabase (public records)** with markers on the map.

## Apify provenance migration

After the init migration, also run:

[`migrations/20261024140000_apify_provenance.sql`](./migrations/20261024140000_apify_provenance.sql)

See [`docs/APIFY_INGEST.md`](../docs/APIFY_INGEST.md) for the ingest API and required server secrets.
