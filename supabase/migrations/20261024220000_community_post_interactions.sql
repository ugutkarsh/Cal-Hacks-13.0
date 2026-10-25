-- Community post interest + replies.
-- Authorization mirrors post visibility; counts via security-definer RPCs.
-- Unique (post_id, user_id) prevents duplicate interest.

-- ---------------------------------------------------------------------------
-- Readable / open helpers (security definer — avoid RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function public.community_post_is_readable(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts cp
    left join public.profiles p on p.id = cp.owner_id
    where cp.id = p_post_id
      and (
        auth.uid() = cp.owner_id
        or (
          cp.status in ('open', 'closed')
          and cp.visibility = 'public'
        )
        or (
          cp.status in ('open', 'closed')
          and cp.visibility = 'author_discoverable'
          and coalesce(p.discoverable, false) = true
        )
      )
  );
$$;

create or replace function public.community_post_is_open_for_interaction(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts cp
    where cp.id = p_post_id
      and cp.status = 'open'
      and public.community_post_is_readable(p_post_id)
  );
$$;

create or replace function public.community_post_owner_id(p_post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cp.owner_id
  from public.community_posts cp
  where cp.id = p_post_id;
$$;

revoke all on function public.community_post_is_readable(uuid) from public;
revoke all on function public.community_post_is_open_for_interaction(uuid) from public;
revoke all on function public.community_post_owner_id(uuid) from public;
grant execute on function public.community_post_is_readable(uuid) to anon, authenticated;
grant execute on function public.community_post_is_open_for_interaction(uuid) to anon, authenticated;
grant execute on function public.community_post_owner_id(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Interests
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_interests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_post_interests_unique unique (post_id, user_id)
);

comment on table public.community_post_interests is
  'One interest row per (post, user). Identities exposed to post owner only via RLS.';

create index if not exists community_post_interests_post_idx
  on public.community_post_interests (post_id, created_at asc);

create index if not exists community_post_interests_user_idx
  on public.community_post_interests (user_id);

alter table public.community_post_interests enable row level security;

-- Own rows + post owner can list interested users.
drop policy if exists "community_post_interests_select" on public.community_post_interests;
create policy "community_post_interests_select"
  on public.community_post_interests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.community_post_owner_id(post_id) = auth.uid()
  );

drop policy if exists "community_post_interests_insert" on public.community_post_interests;
create policy "community_post_interests_insert"
  on public.community_post_interests
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.community_post_is_open_for_interaction(post_id)
  );

drop policy if exists "community_post_interests_delete" on public.community_post_interests;
create policy "community_post_interests_delete"
  on public.community_post_interests
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Accurate public counts without exposing user ids.
create or replace function public.community_post_interest_counts(post_ids uuid[])
returns table (post_id uuid, interest_count bigint)
language sql
security definer
set search_path = public
as $$
  select i.post_id, count(*)::bigint as interest_count
  from public.community_post_interests i
  where i.post_id = any (post_ids)
  group by i.post_id;
$$;

revoke all on function public.community_post_interest_counts(uuid[]) from public;
grant execute on function public.community_post_interest_counts(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_replies_body_len check (
    char_length(trim(body)) between 1 and 1000
  )
);

comment on table public.community_post_replies is
  'Threaded replies on community posts. Chronological by created_at.';

create index if not exists community_post_replies_post_created_idx
  on public.community_post_replies (post_id, created_at asc, id asc);

create index if not exists community_post_replies_author_idx
  on public.community_post_replies (author_id);

drop trigger if exists community_post_replies_set_updated_at on public.community_post_replies;
create trigger community_post_replies_set_updated_at
  before update on public.community_post_replies
  for each row execute function public.set_updated_at();

alter table public.community_post_replies enable row level security;

-- Anyone who can read the post can read its replies.
drop policy if exists "community_post_replies_select" on public.community_post_replies;
create policy "community_post_replies_select"
  on public.community_post_replies
  for select
  to anon, authenticated
  using (public.community_post_is_readable(post_id));

drop policy if exists "community_post_replies_insert" on public.community_post_replies;
create policy "community_post_replies_insert"
  on public.community_post_replies
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.community_post_is_open_for_interaction(post_id)
  );

drop policy if exists "community_post_replies_delete" on public.community_post_replies;
create policy "community_post_replies_delete"
  on public.community_post_replies
  for delete
  to authenticated
  using (author_id = auth.uid());

create or replace function public.community_post_reply_counts(post_ids uuid[])
returns table (post_id uuid, reply_count bigint)
language sql
security definer
set search_path = public
as $$
  select r.post_id, count(*)::bigint as reply_count
  from public.community_post_replies r
  where r.post_id = any (post_ids)
  group by r.post_id;
$$;

revoke all on function public.community_post_reply_counts(uuid[]) from public;
grant execute on function public.community_post_reply_counts(uuid[]) to anon, authenticated;
