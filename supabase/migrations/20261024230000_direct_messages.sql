-- Secure one-to-one messaging + blocks.
-- Sender identity always auth.uid(); pair_key prevents duplicate DMs.
-- Enable Realtime on messages when using Dashboard → Replication (also added below).

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own"
  on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own"
  on public.user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Conversations (1:1 via sorted pair_key)
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Canonical "uuidA:uuidB" with uuidA < uuidB — unique DM per pair.
  pair_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_pair_key_unique unique (pair_key)
);

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc nulls last);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_len check (
    char_length(trim(body)) between 1 and 2000
  )
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc, id asc);

comment on table public.messages is
  'Private DM bodies. Readable only by conversation members via RLS.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.dm_pair_key(a uuid, b uuid)
returns text
language sql
immutable
as $$
  select case
    when a < b then a::text || ':' || b::text
    else b::text || ':' || a::text
  end;
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = p_conversation_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.users_are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks ub
    where (ub.blocker_id = a and ub.blocked_id = b)
       or (ub.blocker_id = b and ub.blocked_id = a)
  );
$$;

revoke all on function public.dm_pair_key(uuid, uuid) from public;
revoke all on function public.is_conversation_member(uuid) from public;
revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.dm_pair_key(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

-- Start or reuse a 1:1 conversation. Validates blocks + peer dm_policy.
create or replace function public.start_direct_conversation(peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  peer public.profiles%rowtype;
  key text;
  conv_id uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if peer_id is null or peer_id = me then
    raise exception 'invalid peer';
  end if;

  select * into peer from public.profiles where id = peer_id;
  if not found then
    raise exception 'peer not found';
  end if;

  if public.users_are_blocked(me, peer_id) then
    raise exception 'messaging blocked';
  end if;

  -- Respect recipient messaging preference.
  if coalesce(peer.dm_policy, 'discoverable_only') = 'nobody' then
    raise exception 'recipient does not accept messages';
  end if;
  if coalesce(peer.dm_policy, 'discoverable_only') = 'discoverable_only'
     and coalesce(peer.discoverable, false) = false then
    raise exception 'recipient does not accept messages';
  end if;

  key := public.dm_pair_key(me, peer_id);

  select c.id into conv_id
  from public.conversations c
  where c.pair_key = key;

  if conv_id is null then
    insert into public.conversations (pair_key)
    values (key)
    returning id into conv_id;

    insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, me), (conv_id, peer_id);
  else
    -- Ensure both memberships exist (e.g. after soft issues).
    insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, me)
    on conflict do nothing;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, peer_id)
    on conflict do nothing;
  end if;

  return conv_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- Keep conversation.last_message_at fresh.
create or replace function public.messages_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.messages_touch_conversation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Conversations: members only.
drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

-- No direct client inserts into conversations — use start_direct_conversation().
-- (Service role / definer function bypasses RLS.)

drop policy if exists "conversation_members_select_member" on public.conversation_members;
create policy "conversation_members_select_member"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Prevent arbitrary self-joins: no INSERT policy for clients on members.
-- Membership only via start_direct_conversation security definer.

drop policy if exists "conversation_members_update_own" on public.conversation_members;
create policy "conversation_members_update_own"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "messages_select_member" on public.messages;
create policy "messages_select_member"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "messages_insert_own_as_member" on public.messages;
create policy "messages_insert_own_as_member"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1
      from public.conversation_members m
      join public.user_blocks b
        on (b.blocker_id = m.user_id and b.blocked_id = auth.uid())
        or (b.blocker_id = auth.uid() and b.blocked_id = m.user_id)
      where m.conversation_id = messages.conversation_id
        and m.user_id <> auth.uid()
    )
  );

-- No message updates/deletes in MVP (immutable history).

-- ---------------------------------------------------------------------------
-- Realtime (no-op if publication missing in local tooling)
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
