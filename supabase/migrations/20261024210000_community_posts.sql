-- Local community posts: natural-language messages with optional structured fields.
-- No precise home/GPS columns — city/neighborhood labels only.
-- Owner is always auth.uid(); clients cannot set owner_id to another user.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  activity text,
  category text,
  city text,
  neighborhood text,
  preferred_days text[] not null default '{}',
  time_start_hour integer,
  time_end_hour integer,
  intent text not null default 'find_teammates',
  skill_level text,
  radius_km integer,
  visibility text not null default 'public',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint community_posts_message_len check (
    char_length(trim(message)) between 1 and 2000
  ),
  constraint community_posts_activity_len check (
    activity is null or char_length(trim(activity)) between 1 and 80
  ),
  constraint community_posts_city_len check (
    city is null or char_length(trim(city)) between 1 and 80
  ),
  constraint community_posts_neighborhood_len check (
    neighborhood is null or char_length(trim(neighborhood)) between 1 and 80
  ),
  constraint community_posts_category_check check (
    category is null
    or category in (
      'hiking', 'cycling', 'running', 'outdoor', 'meetup',
      'climbing', 'sports', 'other'
    )
  ),
  constraint community_posts_intent_check check (
    intent in (
      'find_teammates',
      'find_venue',
      'join_activity',
      'organize_meetup'
    )
  ),
  constraint community_posts_skill_level_check check (
    skill_level is null
    or skill_level in ('beginner', 'intermediate', 'advanced', 'any')
  ),
  constraint community_posts_visibility_check check (
    visibility in ('public', 'author_discoverable', 'private')
  ),
  constraint community_posts_status_check check (
    status in ('open', 'closed', 'archived')
  ),
  constraint community_posts_time_start_hour_check check (
    time_start_hour is null
    or (time_start_hour >= 0 and time_start_hour <= 23)
  ),
  constraint community_posts_time_end_hour_check check (
    time_end_hour is null
    or (time_end_hour >= 0 and time_end_hour <= 23)
  ),
  constraint community_posts_radius_km_check check (
    radius_km is null
    or (radius_km >= 1 and radius_km <= 200)
  )
);

comment on table public.community_posts is
  'User-authored community posts. Labels only — no private lat/lng.';
comment on column public.community_posts.city is
  'User-stated city/neighborhood context. Not a street address.';
comment on column public.community_posts.visibility is
  'public = anyone; author_discoverable = only when author.discoverable or owner; private = owner only.';
comment on column public.community_posts.intent is
  'find_teammates | find_venue | join_activity | organize_meetup.';

-- ---------------------------------------------------------------------------
-- Indexes (bounded list + common filters)
-- ---------------------------------------------------------------------------

create index if not exists community_posts_created_at_idx
  on public.community_posts (created_at desc, id desc);

create index if not exists community_posts_owner_idx
  on public.community_posts (owner_id);

create index if not exists community_posts_status_visibility_idx
  on public.community_posts (status, visibility)
  where status = 'open';

create index if not exists community_posts_activity_idx
  on public.community_posts (lower(activity))
  where activity is not null;

create index if not exists community_posts_city_idx
  on public.community_posts (lower(city))
  where city is not null;

create index if not exists community_posts_category_idx
  on public.community_posts (category)
  where category is not null;

create index if not exists community_posts_preferred_days_gin_idx
  on public.community_posts using gin (preferred_days);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists community_posts_set_updated_at on public.community_posts;
create trigger community_posts_set_updated_at
  before update on public.community_posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.community_posts enable row level security;

-- SELECT: own posts always; public open posts; author_discoverable when author is discoverable.
drop policy if exists "community_posts_select_visible" on public.community_posts;
create policy "community_posts_select_visible"
  on public.community_posts
  for select
  to anon, authenticated
  using (
    auth.uid() = owner_id
    or (
      status in ('open', 'closed')
      and visibility = 'public'
    )
    or (
      status in ('open', 'closed')
      and visibility = 'author_discoverable'
      and exists (
        select 1
        from public.profiles p
        where p.id = community_posts.owner_id
          and p.discoverable = true
      )
    )
  );

-- INSERT: authenticated; owner_id must equal auth.uid() (never trust client owner).
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
  on public.community_posts
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- UPDATE: owner only; cannot reassign owner_id.
drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
  on public.community_posts
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- DELETE: owner only.
drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
  on public.community_posts
  for delete
  to authenticated
  using (owner_id = auth.uid());
