-- Privacy & safety: content reports (private), location share level,
-- persist fuzzed discovery coords, block helpers for interactions.

-- ---------------------------------------------------------------------------
-- Location share level (explicit control of how location appears publicly)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists location_share_level text not null default 'approximate';

alter table public.profiles drop constraint if exists profiles_location_share_level_check;
alter table public.profiles
  add constraint profiles_location_share_level_check check (
    location_share_level in ('hidden', 'city_only', 'approximate')
  );

comment on column public.profiles.location_share_level is
  'hidden = no public place hints; city_only = city/neighborhood labels only (no pin); approximate = fuzzed pin when discoverable.';

-- Persist only ~1km precision so RLS full-row reads cannot leak street coords.
create or replace function public.profiles_fuzz_discovery_coords()
returns trigger
language plpgsql
as $$
begin
  if new.discovery_lat is not null then
    new.discovery_lat := round(new.discovery_lat::numeric, 2);
  end if;
  if new.discovery_lng is not null then
    new.discovery_lng := round(new.discovery_lng::numeric, 2);
  end if;
  -- city_only / hidden: do not expose a pin even if discoverable.
  if new.location_share_level in ('hidden', 'city_only') then
    new.discovery_lat := null;
    new.discovery_lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_fuzz_discovery_coords on public.profiles;
create trigger profiles_fuzz_discovery_coords
  before insert or update on public.profiles
  for each row execute function public.profiles_fuzz_discovery_coords();

-- Discoverable without a pin when city_only (coords optional).
alter table public.profiles drop constraint if exists profiles_discoverable_requires_coords;
alter table public.profiles
  add constraint profiles_discoverable_requires_coords check (
    discoverable = false
    or location_share_level = 'city_only'
    or (discovery_lat is not null and discovery_lng is not null)
  );
-- hidden + discoverable is contradictory; force off when hidden.
alter table public.profiles drop constraint if exists profiles_hidden_not_discoverable;
alter table public.profiles
  add constraint profiles_hidden_not_discoverable check (
    location_share_level <> 'hidden' or discoverable = false
  );

-- Refresh public view: fuzzed pin only for approximate; city labels for city_only.
-- Must DROP first — CREATE OR REPLACE cannot insert/reorder columns (42P16).
drop view if exists public.discoverable_profiles_public;

create view public.discoverable_profiles_public
with (security_invoker = true)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  p.bio,
  case when p.location_share_level = 'hidden' then null else p.city end as city,
  case
    when p.location_share_level = 'hidden' then null
    else p.neighborhood
  end as neighborhood,
  p.interests,
  p.skill_level,
  p.availability_days,
  p.availability_start_hour,
  p.availability_end_hour,
  p.preferred_radius_km,
  case
    when p.location_share_level = 'approximate'
      then round(p.discovery_lat::numeric, 2)::double precision
    else null
  end as discovery_lat,
  case
    when p.location_share_level = 'approximate'
      then round(p.discovery_lng::numeric, 2)::double precision
    else null
  end as discovery_lng,
  p.discoverable,
  p.created_at,
  p.location_share_level
from public.profiles p
where p.discoverable = true
  and p.location_share_level in ('approximate', 'city_only');

grant select on public.discoverable_profiles_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Content reports — create-only for users; no public SELECT
-- ---------------------------------------------------------------------------

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint content_reports_target_type_check check (
    target_type in ('profile', 'post', 'reply', 'message')
  ),
  constraint content_reports_reason_check check (
    reason in (
      'spam',
      'harassment',
      'inappropriate',
      'impersonation',
      'safety',
      'other'
    )
  ),
  constraint content_reports_details_len check (
    details is null or char_length(details) <= 1000
  ),
  constraint content_reports_unique_reporter_target unique (
    reporter_id, target_type, target_id
  )
);

create index if not exists content_reports_created_idx
  on public.content_reports (created_at desc);

comment on table public.content_reports is
  'User reports. No authenticated SELECT — service role / future moderation only. No admin dashboard in app.';

alter table public.content_reports enable row level security;

-- Insert only; never expose reports via anon/authenticated SELECT.
drop policy if exists "content_reports_insert_own" on public.content_reports;
create policy "content_reports_insert_own"
  on public.content_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and reporter_id is not null
  );

-- Explicitly no SELECT/UPDATE/DELETE policies for authenticated or anon.

revoke all on table public.content_reports from anon;
grant insert on table public.content_reports to authenticated;
-- SELECT not granted to authenticated/anon — only table owner / service role.

-- ---------------------------------------------------------------------------
-- Block helpers usable from interaction RLS
-- ---------------------------------------------------------------------------

-- Deny interest/replies when blocked with post owner (keeps open-interaction helper).
drop policy if exists "community_post_interests_insert" on public.community_post_interests;
create policy "community_post_interests_insert"
  on public.community_post_interests for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.community_post_is_open_for_interaction(post_id)
    and not public.users_are_blocked(
      auth.uid(),
      public.community_post_owner_id(post_id)
    )
  );

drop policy if exists "community_post_replies_insert" on public.community_post_replies;
create policy "community_post_replies_insert"
  on public.community_post_replies for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.community_post_is_open_for_interaction(post_id)
    and not public.users_are_blocked(
      auth.uid(),
      public.community_post_owner_id(post_id)
    )
  );
