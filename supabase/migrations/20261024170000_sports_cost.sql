-- Sports category + optional ticket/membership-adjacent cost for imported events.
-- cost_cents is null when unknown; never invent prices in application code.

alter table public.activities
  add column if not exists cost_cents integer
    check (cost_cents is null or cost_cents >= 0);

comment on column public.activities.cost_cents is
  'Optional price in USD cents from source tickets (e.g. Eventbrite min). Null = unknown.';

-- Expand category checks (inline constraints from init migration).
alter table public.activities drop constraint if exists activities_category_check;
alter table public.activities
  add constraint activities_category_check check (
    category in (
      'hiking',
      'cycling',
      'running',
      'outdoor',
      'meetup',
      'climbing',
      'sports',
      'other'
    )
  );

alter table public.places drop constraint if exists places_category_check;
alter table public.places
  add constraint places_category_check check (
    category in (
      'hiking',
      'cycling',
      'running',
      'outdoor',
      'meetup',
      'climbing',
      'sports',
      'other'
    )
  );
