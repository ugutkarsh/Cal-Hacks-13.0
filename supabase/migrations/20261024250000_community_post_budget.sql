-- Persist explicitly stated budget on community posts (USD cents).
-- Never invent budget; null means unknown / not stated.

alter table public.community_posts
  add column if not exists budget_cents integer;

alter table public.community_posts
  drop constraint if exists community_posts_budget_cents_check;

alter table public.community_posts
  add constraint community_posts_budget_cents_check check (
    budget_cents is null
    or (budget_cents >= 0 and budget_cents <= 1000000)
  );

comment on column public.community_posts.budget_cents is
  'Optional author-stated max budget in USD cents. Null when not stated — never invented.';
