-- Apify / import provenance for activities.
-- Apply in Supabase SQL Editor after 20261024120000_init.sql.

alter table public.activities
  add column if not exists source_record_id text,
  add column if not exists source_provider text,
  add column if not exists imported_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists import_run_id text;

comment on column public.activities.source_record_id is
  'Stable ID from external source (e.g. Meetup event id). Null for community rows.';
comment on column public.activities.source_provider is
  'External provider key, e.g. meetup via Apify. Null for community rows.';
comment on column public.activities.imported_at is
  'When this row was first imported. Not the event start time.';
comment on column public.activities.last_verified_at is
  'When this imported row was last refreshed from the source.';

-- Idempotent upserts for imported events
create unique index if not exists activities_source_identity_uidx
  on public.activities (source_provider, source_record_id)
  where source_provider is not null and source_record_id is not null;

create index if not exists activities_imported_at_idx
  on public.activities (imported_at)
  where imported_at is not null;
