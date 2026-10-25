# Apify event ingestion

## Actors

### A — Meetup outdoor (existing)

| Field | Value |
|-------|--------|
| Actor | [`epicscrapers/meetup-events-scraper`](https://apify.com/epicscrapers/meetup-events-scraper) |
| Request `actor` | omit or `"meetup"` |
| Source | Public Meetup.com event search |

### B — Eventbrite + Meetup recreation

| Field | Value |
|-------|--------|
| Actor | [`seemuapps/eventbrite-meetup-events-scraper`](https://apify.com/seemuapps/eventbrite-meetup-events-scraper) |
| Request `actor` | `"eventbrite_meetup"` or `"recreation"` |
| Source | Public Eventbrite + Meetup |
| Defaults | SF + sports keywords (badminton, volleyball, open gym, …) |
| Pricing | See Actor Store page (~$5 / 1,000 events) |

### C — Multi-platform Find Events

| Field | Value |
|-------|--------|
| Actor | [`hypebridge/find-events`](https://apify.com/hypebridge/find-events) |
| Request `actor` | `"find_events"` or `"hypebridge"` |
| Source | Meetup, Eventbrite, Luma, RunSignup, … (allowlist) |
| Defaults | `category: sports_fitness`, `timeWindow: this_month`, details on |
| Pricing | Orchestration + child crawler fees (see Actor page) |

### D — Eventbrite-only (sports browse)

| Field | Value |
|-------|--------|
| Actor | [`crawlerbros/eventbrite-scraper`](https://apify.com/crawlerbros/eventbrite-scraper) |
| Request `actor` | `"eventbrite"` or `"eventbrite_only"` |
| Source | Eventbrite browse (location slug + category) |
| Defaults | `location: ca--san-francisco`, `category: sports-and-fitness` |
| Target table | `activities` |

### E — RunSignup races

| Field | Value |
|-------|--------|
| Actor | [`hypebridge/runsignup-race-scraper`](https://apify.com/hypebridge/runsignup-race-scraper) |
| Request `actor` | `"runsignup"` or `"races"` |
| Source | RunSignup public race listings |
| Defaults | `states: ["CA"]`, `maxRaces: 40` |
| Notes | City/state geocoded via Nominatim when lat/lng absent |
| Target table | `activities` (`source_provider=runsignup`) |

### F — ClassPass studios → places

| Field | Value |
|-------|--------|
| Actor | [`scrapersdelight/classpass-studios-scraper`](https://apify.com/scrapersdelight/classpass-studios-scraper) |
| Request `actor` | `"classpass"` or `"studios"` |
| Source | ClassPass venue directory |
| Defaults | `locations: ["San Francisco, CA"]`, `maxResults: 30` |
| Target table | `places` (not timed activities) |

Actors are not affiliated with those platforms. Use public listings only; comply with source ToS.

## Schema prerequisites

Run in order (if not already applied):

1. `supabase/migrations/20261024140000_apify_provenance.sql`
2. `supabase/migrations/20261024160000_activity_location_host.sql`
3. `supabase/migrations/20261024170000_sports_cost.sql` — `sports` category + `cost_cents`
4. `supabase/migrations/20261024180000_places_provenance.sql` — ClassPass place upsert identity

## Environment (server-only)

```bash
APIFY_API_TOKEN=...
SUPABASE_SERVICE_ROLE_KEY=...
INGEST_SECRET=...   # long random string
```

Never put these in `NEXT_PUBLIC_*`.

## Run ingest

### Meetup (hiking / outdoor)

```bash
export INGEST_SECRET="$(grep '^INGEST_SECRET=' .env.local | cut -d= -f2-)"

curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"meetup","location":"San Francisco","query":"hiking","maxResults":15,"days":21,"eventType":"PHYSICAL","topicCategoryId":"684"}'
```

### Eventbrite + Meetup sports / recreation

```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"eventbrite_meetup","location":"San Francisco, CA","dateRange":"this-month","maxItemsPerSource":40}'
```

Optional body fields: `keywords` (string array), `includeEventbrite`, `includeMeetup`, `freeOnly`, `onlineOnly`.

### Find Events (multi-platform sports)

```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"find_events","city":"San Francisco, CA","category":"sports_fitness","timeWindow":"this_month","maxEvents":40,"getEventDetails":true}'
```

Optional: `platforms` array (default meetup, eventbrite, runsignup, luma).

### Eventbrite-only (sports-and-fitness)

```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"eventbrite","location":"ca--san-francisco","category":"sports-and-fitness","maxItems":40}'
```

### RunSignup races (CA)

```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"runsignup","states":["CA"],"maxRaces":40}'
```

### ClassPass studios → places

```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"actor":"classpass","locations":["San Francisco, CA"],"maxResults":30}'
```

Response includes `imported`, `updated`, `skipped`, `failed`, and `descriptionsEnriched` (activity Actors only).

After Apify returns each event, ingest **fetches the public source page** and replaces the short Apify summary when a longer description is found (JSON-LD / page HTML). Re-run the same curl to refresh existing rows. Failures do **not** load mock data. Idempotent on `(source_provider, source_record_id)`.

## Map display

Imported activities appear via the existing Supabase map loader when they have coordinates. Postcards show **Imported**, venue/host when stored, ticket cost when `cost_cents` is set, and Eventbrite/Meetup attribution. Filter category **Sports** for recreation imports. No UI redesign.

## Near-realtime refresh on app open / location change

Apify is **not** a live GPS stream. Optional auto-refresh:

1. Set in `.env.local` (server):
   ```bash
   AUTO_INGEST_ON_OPEN=true
   AUTO_INGEST_MIN_INTERVAL_MINUTES=1
   ```
2. Restart `npm run dev` (required after env change).
3. Open the app **or** set a city in Preferences → Save — client calls `POST /api/ingest/refresh`.
4. Server resolves a **city name** and runs **all wired Actors in parallel**: Eventbrite+Meetup, Find Events, RunSignup, ClassPass (Eventbrite-only skipped if not rented). Public-page description enrich is on.
5. Preferences → search city → **Set** triggers fetch automatically (no curl). Map reloads when done; far pins stay hidden.

Rate limits: ~1 minute per geo bucket. Changing city forces a new fetch. Manual curls still work with `INGEST_SECRET`.

## Live verification

Live runs are only proven after migrations + secrets + successful curl / auto-refresh with `ok: true`. Unit tests use fixtures only.
