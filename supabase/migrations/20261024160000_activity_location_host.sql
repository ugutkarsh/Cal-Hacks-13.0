-- Human-readable venue + Meetup host labels for imported (and other) activities.
-- Does not invent values — ingest only writes labels present on the source record.

alter table public.activities
  add column if not exists location_label text,
  add column if not exists host_label text;

comment on column public.activities.location_label is
  'Optional display venue/address when not linked via place_id (e.g. Apify Meetup venue).';
comment on column public.activities.host_label is
  'Optional hosting group or organizer display name when organizer_id is null (e.g. Meetup group).';
