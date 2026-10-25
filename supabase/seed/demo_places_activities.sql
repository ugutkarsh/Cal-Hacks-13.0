-- Seed public places + upcoming activities for Trailmap map demo.
-- Run in Supabase Dashboard → SQL Editor (service role / postgres bypasses RLS).
-- Does NOT create auth users or discoverable profiles (those need Auth).

-- Clear previous seed rows with known names (safe re-run for hackathon demos)
delete from public.activities
where title in (
  'Sunrise Ridge Hike',
  'Saturday Bayfront Run',
  'Evening City Cycle Meetup'
);

delete from public.places
where name in (
  'Golden Gate Park Trails',
  'Marin Headlands Overlook',
  'Embarcadero Bike Path'
);

insert into public.places (name, description, category, latitude, longitude, image_url)
values
  (
    'Golden Gate Park Trails',
    'Shaded loops and meadow edges popular for weekend walks and group hikes.',
    'hiking',
    37.7694,
    -122.4862,
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=900&q=80'
  ),
  (
    'Marin Headlands Overlook',
    'Coastal overlooks and wind-swept ridges with bridge views.',
    'outdoor',
    37.827,
    -122.499,
    'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=900&q=80'
  ),
  (
    'Embarcadero Bike Path',
    'Flat waterfront path suited for casual rides and pace groups.',
    'cycling',
    37.7955,
    -122.3937,
    'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=900&q=80'
  );

insert into public.activities (
  title,
  description,
  category,
  place_id,
  organizer_id,
  starts_at,
  ends_at,
  capacity,
  image_url,
  source_type,
  difficulty_label
)
select
  v.title,
  v.description,
  v.category,
  p.id,
  null,
  v.starts_at,
  v.ends_at,
  v.capacity,
  v.image_url,
  'community',
  v.difficulty_label
from (
  values
    (
      'Sunrise Ridge Hike',
      'A sample group hike for people who want to explore a trail together.',
      'hiking',
      'Golden Gate Park Trails',
      now() + interval '1 day',
      now() + interval '1 day 2 hours',
      10,
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=900&q=80',
      'Beginner-friendly'
    ),
    (
      'Saturday Bayfront Run',
      'Easy social 5K along the waterfront. All paces welcome.',
      'running',
      'Embarcadero Bike Path',
      now() + interval '2 days',
      now() + interval '2 days 1 hour',
      30,
      'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=900&q=80',
      'All paces welcome'
    ),
    (
      'Evening City Cycle Meetup',
      'Casual group ride through flat neighborhoods. Lights required.',
      'cycling',
      'Embarcadero Bike Path',
      now() + interval '3 days',
      now() + interval '3 days 2 hours',
      20,
      'https://images.unsplash.com/photo-1517649763962-0c623066027c?w=900&q=80',
      'Casual · lights required'
    )
) as v(
  title,
  description,
  category,
  place_name,
  starts_at,
  ends_at,
  capacity,
  image_url,
  difficulty_label
)
join public.places p on p.name = v.place_name;

-- Quick check
select 'places' as kind, count(*)::int as n from public.places
union all
select 'activities', count(*)::int from public.activities;
