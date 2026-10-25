# Apify Actors for multi-sport recreation (verified list)

Trailmap already ingests Meetup via `epicscrapers/meetup-events-scraper`.  
Multiple Actors **can** feed the same Supabase `activities` / `places` tables if each has its own normalizer + `source_provider` + `source_record_id` upsert. Do **not** claim any Actor below works in this app until you wire it, run it, and see rows.

Integrity: Actors are community Store products; check pricing, ToS of the source site, and field coverage before paying for a run.

---

## What you want vs what scrapers usually return

| Goal | Realistic via Apify? | Notes |
|------|----------------------|--------|
| Nearby badminton / volleyball / open gym **events** | Yes (keyword + sports category search) | Best on Meetup + Eventbrite (+ multi-source hubs) |
| **Clubs / studios** that host play | Partially | ClassPass-style studio directories; not every local YMCA |
| **Membership / drop-in prices** | Partially | Ticket `minPrice`/`maxPrice` on events is common; full club membership tiers are often missing or ClassPass credits only — never invent |
| Recurring open-gym schedules | Partially | ClassPass upcoming classes; not a universal “every gym API” |

---

## Tier A — Best next integrations for Trailmap (map events)

### 1. Already live in this repo
| | |
|--|--|
| **Actor** | [`epicscrapers/meetup-events-scraper`](https://apify.com/epicscrapers/meetup-events-scraper) |
| **Source** | Meetup.com public events |
| **Useful fields** | title, dateTime, venue lat/lon, url, group, fee, description (~500 chars) |
| **Sports fit** | Query keywords: `badminton`, `volleyball`, `basketball`, `soccer`, `tennis`, `pickleball`, `open gym`, `pickup` + category Travel & Outdoor / Sports |
| **Pricing** | Pay-per-event (see Actor page) |

### 2. Eventbrite + Meetup in one run (prices + organizers) — **wired in Trailmap**
| | |
|--|--|
| **Actor** | [`seemuapps/eventbrite-meetup-events-scraper`](https://apify.com/seemuapps/eventbrite-meetup-events-scraper) |
| **Source** | Eventbrite + Meetup |
| **Useful fields** | startAt, lat/lng, minPrice/maxPrice, isFree, venue, organizerName/Url, source (`eventbrite`\|`meetup`), eventId |
| **Sports fit** | `keywords`: badminton, volleyball, pickup basketball, open gym, indoor soccer, … |
| **Pricing** | ~$5 / 1,000 events (Store page) |
| **App** | `POST /api/ingest/apify` with `"actor":"eventbrite_meetup"` — see `docs/APIFY_INGEST.md`. Live success only after you run it. |

Example input (from Actor docs):

```json
{
  "location": "San Francisco, CA",
  "keywords": [
    "badminton",
    "volleyball",
    "pickleball",
    "basketball open gym",
    "pickup soccer",
    "tennis meetup"
  ],
  "dateRange": "this-month",
  "includeEventbrite": true,
  "includeMeetup": true,
  "onlineOnly": false,
  "maxItemsPerSource": 100
}
```

### 3. Multi-platform hub (one Actor, many sources) — **wired in Trailmap**
| | |
|--|--|
| **Actor** | [`hypebridge/find-events`](https://apify.com/hypebridge/find-events) |
| **Sources** | Eventbrite, Meetup, Luma, RunSignup, Fever, Dice, … (auto-routed by city) |
| **Useful fields** | title, startDateTimeUtc, venue/address, priceMin/priceMax, platform, sourceUrl, optional coords via details |
| **Sports fit** | `category`: `sports_fitness` (also `wellness`) |
| **Pricing** | Orchestration (~$2 / 1k delivered) **+** child crawler fees |
| **App** | `POST /api/ingest/apify` with `"actor":"find_events"` — see `docs/APIFY_INGEST.md`. Live success only after you run it. |

Example:

```json
{
  "city": "San Francisco, CA",
  "category": "sports_fitness",
  "timeWindow": "this_month",
  "maxEvents": 50,
  "getEventDetails": true,
  "platforms": ["meetup", "eventbrite", "runsignup"]
}
```

### 4. Eventbrite-only (deep sports category) — **wired in Trailmap**
| | |
|--|--|
| **Actor** | [`crawlerbros/eventbrite-scraper`](https://apify.com/crawlerbros/eventbrite-scraper) |
| **Source** | Eventbrite |
| **Useful fields** | name, dates, venue, coords, organizer, category, ticket URL |
| **Sports fit** | `category`: `sports-and-fitness`, location slug e.g. `ca--san-francisco` |
| **Pricing** | See Actor page |
| **App** | `POST /api/ingest/apify` with `"actor":"eventbrite"` — see `docs/APIFY_INGEST.md`. Live success only after you run it. |

### 5. Races / endurance (running, triathlon) — **wired in Trailmap**
| | |
|--|--|
| **Actor** | [`hypebridge/runsignup-race-scraper`](https://apify.com/hypebridge/runsignup-race-scraper) |
| **Source** | RunSignup |
| **Useful fields** | Race fees, sub-events, city/state (geocoded when no lat/lng) |
| **Fit** | Running / endurance only — not badminton |
| **App** | `POST /api/ingest/apify` with `"actor":"runsignup"`. Live success only after you run it. |

### 6. Alternate Eventbrite+Meetup
| | |
|--|--|
| **Actor** | [`snow_leo_data/eventbrite-scraper`](https://apify.com/snow_leo_data/eventbrite-scraper) |
| **Notes** | Docs list Sports & Fitness + Tournament / Race formats; verify live output before wiring |

---

## Tier B — Gyms / clubs / memberships (venues, not one-off events)

These map better to **`places`** (or a future `venues` + membership table) than to timed `activities`.

| Actor | Source | What you get | Membership price? | Geo fit |
|-------|--------|--------------|-------------------|---------|
| [`scrapersdelight/classpass-studios-scraper`](https://apify.com/scrapersdelight/classpass-studios-scraper) — **wired → `places`** (`"actor":"classpass"`) | ClassPass | Studios/gyms, GPS, activities, amenities, optional class schedule + credits | ClassPass credits / schedule — **not** full club annual dues | Global ClassPass cities |
| [`crawlerbros/classpass-scraper`](https://apify.com/crawlerbros/classpass-scraper) | ClassPass | Search + studio details + upcoming classes | Similar — credits/classes | Global ClassPass cities |
| [`ahmed_jasarevic/classpass-scraper`](https://apify.com/ahmed_jasarevic/classpass-scraper) | ClassPass + Mindbody | Claims class packs / memberships / drop-in | Verify a paid test run before trusting | Depends on Mindbody sites |

**France-only federation directories** (skip for Bay Area demo):  
`corent1robert/ffbad-clubs-scraper` (badminton), `corent1robert/ffvolley-clubs-scraper` (volleyball), plus other FF* club scrapers.

**No verified Playtomic Actor** found in Store search at time of writing — do not invent one.

---

## Suggested keyword pack (events)

Use with Tier A keyword Actors (Meetup / Eventbrite):

```
badminton, volleyball, pickleball, basketball, open gym, pickup basketball,
indoor soccer, futsal, tennis, table tennis, squash, climbing gym, yoga,
martial arts, boxing, swimming, ultimate frisbee, cricket, rugby social
```

Keep physical/in-person only; drop online-only rows in the normalizer (same rule as current Meetup ingest).

---

## How multi-scraper ingest should work in Trailmap

1. Keep **Supabase** as the only app DB.
2. One protected ingest path per Actor (or one router with `actorId` + adapter).
3. Each row: `source_type=apify`, `source_provider=<meetup|eventbrite|classpass|…>`, `source_record_id`, `source_url`, `imported_at`.
4. Upsert on `(source_provider, source_record_id)` — already the pattern for Meetup.
5. Expand `category` enum only when UI filters need it (`badminton`, `volleyball`, …) — until then map into existing `hiking|cycling|running|outdoor|meetup|climbing|other`.
6. **Never** invent membership prices; store null / “unknown” when missing.
7. Deduplicate across platforms later (title + start + approx coords) — optional; do not claim cross-source merge until implemented.

---

## Recommended integrate order (for you)

1. **`seemuapps/eventbrite-meetup-events-scraper`** — sports keywords + ticket prices (biggest product win).  
2. Keep **`epicscrapers/meetup-events-scraper`** for outdoor/Meetup depth you already have.  
3. **`hypebridge/find-events`** with `sports_fitness` + platform allowlist — if budget allows.  
4. **`crawlerbros/eventbrite-scraper`** if you want Eventbrite-only volume.  
5. **ClassPass studio Actor** — only after events pipeline is solid; treat as places + optional class times.

After you pick Actors from this list, we can add normalizers + ingest routes without changing the map-first UI.
