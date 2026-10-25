-- Provenance for imported places (e.g. ClassPass studios).

alter table public.places
  add column if not exists source_type text not null default 'community'
    check (source_type in ('community', 'apify', 'import', 'system')),
  add column if not exists source_provider text,
  add column if not exists source_record_id text,
  add column if not exists source_url text,
  add column if not exists imported_at timestamptz,
  add column if not exists last_verified_at timestamptz;

comment on column public.places.source_provider is
  'External provider slug when imported (e.g. classpass).';

create unique index if not exists places_source_identity_uidx
  on public.places (source_provider, source_record_id)
  where source_provider is not null and source_record_id is not null;
