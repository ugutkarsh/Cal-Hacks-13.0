# Trailmap

Map-first social discovery for recreational **places**, **events**, and **people** who opt into discovery. Built for Cal Hacks 13.0.

The home screen is an interactive map — not a social feed.

## Milestone 1 (current)

- Full-viewport discovery map
- Nav: brand, search, category filters, entity-type toggles, profile stub
- Custom markers for places, events, and discovery-opted people
- Preview postcard → detailed postcard (Join/Register for events)
- Loading / empty / error states
- Mock data clearly labeled; people pins are **not** live location
- Google Maps when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set; otherwise a usable local fallback

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js App Router, React, TypeScript, Tailwind |
| UI primitives | shadcn-style components (`components/ui`) |
| Map | `@vis.gl/react-google-maps` |
| Backend (authority) | Supabase + PostgreSQL + PostGIS (stubs in M1) |
| Auth / storage / realtime | Supabase (later) |
| ML (later) | Python, scikit-learn, FastAPI |
| Tests | Vitest, Playwright |

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without a Maps key, the canvas fallback still supports the full marker → postcard flow.

### Environment

See `.env.example`. Browser-safe vars only use the `NEXT_PUBLIC_` prefix. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `APIFY_API_TOKEN` to the client.

Data source:

- Without Supabase env → **demo** (labeled mock markers).
- With Supabase URL + anon key → **supabase** public reads (apply `supabase/migrations/20261024120000_init.sql` first).
- Force demo while keys exist: `NEXT_PUBLIC_DATA_SOURCE=demo`.
- Supabase query failures do **not** silently fall back to mock; the UI offers Retry or Use demo data.

See [`supabase/README.md`](./supabase/README.md) for migration + RLS notes.

## Project layout

```
app/                    routes & layout
components/map/         map, markers, states, experience shell
components/postcards/   preview + detail
components/navigation/  search & filters
components/ui/          shared primitives
lib/data/               data access (mock → Supabase later)
lib/supabase/           browser client stub
data/mock/              labeled sample entities
types/                  shared TypeScript types
docs/SPONSOR_ALIGNMENT.md
FLOW.md                 change progress log
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local Next.js |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright (install browsers first) |

## Data integrity

- Single source of truth: Supabase/PostGIS once wired; mock until then.
- UI badges mark `provenance: "mock"`.
- Person entities include `presenceNote` stating pins are not live GPS.

## Sponsors

See [docs/SPONSOR_ALIGNMENT.md](docs/SPONSOR_ALIGNMENT.md). Meta ML, Apify ingestion, and Figma design alignment are planned without claiming unverified integrations.
