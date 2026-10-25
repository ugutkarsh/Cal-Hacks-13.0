-- Privacy-conscious activity recommendation feedback.
-- Own-rows only via RLS. No PII beyond auth.uid() + catalog activity ids.
-- Soft personalization signals only — not a trained ML model.

create table if not exists public.activity_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null,
  action text not null,
  rating integer,
  -- Optional category label from the catalog at feedback time (not inferred traits).
  activity_category text,
  created_at timestamptz not null default now(),

  constraint activity_feedback_action_check check (
    action in ('save', 'like', 'skip', 'join', 'rate')
  ),
  constraint activity_feedback_activity_id_len check (
    char_length(trim(activity_id)) between 1 and 128
  ),
  constraint activity_feedback_rating_check check (
    rating is null
    or (rating >= 1 and rating <= 5)
  ),
  constraint activity_feedback_rate_requires_rating check (
    (action = 'rate' and rating is not null)
    or (action <> 'rate' and rating is null)
  ),
  constraint activity_feedback_category_len check (
    activity_category is null
    or char_length(trim(activity_category)) between 1 and 40
  )
);

comment on table public.activity_feedback is
  'Per-user activity recommendation feedback (save/like/skip/join/rate). Private; RLS own-rows only.';
comment on column public.activity_feedback.activity_id is
  'Catalog event id string — not a user identifier.';
comment on column public.activity_feedback.activity_category is
  'Optional ActivityCategory from the listing when feedback was recorded.';

create index if not exists activity_feedback_user_created_idx
  on public.activity_feedback (user_id, created_at desc);

create index if not exists activity_feedback_user_activity_idx
  on public.activity_feedback (user_id, activity_id);

alter table public.activity_feedback enable row level security;

-- SELECT own only
drop policy if exists activity_feedback_select_own on public.activity_feedback;
create policy activity_feedback_select_own
  on public.activity_feedback
  for select
  to authenticated
  using (user_id = auth.uid());

-- INSERT own only (never forge another user_id)
drop policy if exists activity_feedback_insert_own on public.activity_feedback;
create policy activity_feedback_insert_own
  on public.activity_feedback
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- DELETE own only (clear personalization)
drop policy if exists activity_feedback_delete_own on public.activity_feedback;
create policy activity_feedback_delete_own
  on public.activity_feedback
  for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE — append-only; clear + re-record instead.
revoke update on public.activity_feedback from authenticated, anon;
grant select, insert, delete on public.activity_feedback to authenticated;
