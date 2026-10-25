# Sponsor alignment — Cal Hacks 13.0

Authoritative product data remains **Supabase PostgreSQL** (+ planned PostGIS). Sponsor tools are additive.

**Integrity rule:** Do not claim an API works unless configured and tested.

## Priority 1 — Meta: Bringing People Closer Together with AI

| Item | Status |
|------|--------|
| Feature | Preference-based activity ranking (deterministic weighted rules today) |
| Planned | Python + scikit-learn + FastAPI reading the **same** Supabase activities |
| Claim | Rule-based scorer is **not** a trained ML model |
| Meta API | **Not** integrated |

See `ml/README.md` for the next milestone contract.

## Priority 2 — Apify: Best Agent/App Using Public Web Data

| Item | Status |
|------|--------|
| Actors | Meetup scraper + Eventbrite/Meetup dual + `hypebridge/find-events` |
| Pipeline | Server `POST /api/ingest/apify` (`actor` meetup \| eventbrite_meetup \| find_events) → Supabase |
| Provenance | `source_type=apify`, `source_provider=meetup\|eventbrite`, `source_record_id`, `imported_at` |
| Live run | Requires `APIFY_API_TOKEN` + `SUPABASE_SERVICE_ROLE_KEY` + `INGEST_SECRET` |
| Docs | `docs/APIFY_INGEST.md` |
| Multi-sport Actor shortlist | `docs/APIFY_ACTORS_RECREATION.md` (not wired unless listed as live) |

## Priority 3 — Figma: Best Design

Map-first UI, custom markers, preview + detail postcards preserved. Apify adds only an **Imported** badge / attribution line — no redesign.

## Judge demo (Apify)

1. Apply provenance migration; set server env vars.
2. `curl` ingest endpoint; confirm JSON summary.
3. Refresh map → imported Meetup events with coordinates + **Imported** badge.
4. State clearly if the live Actor run was or was not executed in the session.
