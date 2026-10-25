# FLOW — Progress Tracking

## Current task
Task 8 — AI Community Safety Assistance (report / block / triage aid).

## Status
**Safety foundations shipped: authenticated reports (post/profile/reply/message), blocks + RLS, no public report listing. Triage is deterministic keyword rules only (no LLM configured) — never a definitive judgment and never auto-penalizes. UI states make clear reporting does not guarantee removal.**

## Implement — Task 8 AI Community Safety Assistance (2026-10-24)

### Design
1. **Report** post, profile, reply, or message via `POST /api/reports` (auth required).
2. Persist minimal fields (`target_type`, `target_id`, `reason`, optional sanitized `details`) with `reporter_id = auth.uid()`.
3. No authenticated SELECT on `content_reports` (insert-only RLS + REVOKE).
4. **Block** via existing `/api/blocks` + `user_blocks` RLS; visibility via post/profile controls.
5. **Triage aid:** `lib/privacy/triage.ts` rules → `triage_hints` on insert. `isDefinitiveJudgment: false`. `shouldAutoPenalizeFromTriage` always `false`.
6. UGC sanitized (`sanitize-ugc`) — injection phrases stripped; never followed as instructions.
7. Private DMs never sent to external providers (none configured); reports store target id + reason, not full thread dumps.
8. Client shows submitted / already-reported copy without removal promises.
9. No automatic hide/ban from triage or report volume.

### LLM
**Unconfigured** for moderation. Do not claim an LLM was used. Rules triage only.

### Files
- `lib/privacy/triage.ts`, `sanitize-ugc.ts`; updates to `reports.ts`, `app/api/reports/route.ts`
- Migration `20261024270000_report_triage_hints.sql`
- UI: reply Report in `community-panel.tsx`; message + profile Report status in `messages-panel.tsx`
- Tests: `lib/privacy/triage.test.ts` (+ existing `privacy-safety.test.ts`)

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/privacy` | **23 passed** |
| `tsc --noEmit` | clean |
| Auto-penalize from AI | **never** |
| LLM moderation | **unconfigured** |

### Apply migration
Run `20261024270000_report_triage_hints.sql` for `triage_hints` / grant harden (API falls back if columns missing).

---

## Prior — Task 7 Personalized Map Discovery

## Implement — Task 7 Personalized Map Discovery (2026-10-24)

### Goal
Help users find relevant catalog activities faster on the map without losing control of filters/search.

### Policy
1. Explicit prefs + own feedback when personalization is on.
2. Rank real events (rules / optional sklearn) with soft search-intent boost.
3. **Authority:** search text / NL match ids skip soft distance clipping; For You only filters events when personalization is enabled.
4. Marker states: selected · emphasized (card hover) · relevance `high`/`medium` · default. Overlap → stack order / z-index (no spiderfy inventing positions).
5. Marker ↔ card sync unchanged (`resolveSelectionAfterFilter` + hover emphasize).
6. Controls: **For you** filter, **Ranked pins on/off**, **Reset view**, Preferences (adjust) + Clear personalization (feedback).
7. Explanations from concrete reason codes (incl. `search_intent_match`).
8. Empty/loading/error via existing map states; missing coords dropped (never invented).
9–10. Privacy: search not persisted; prefs/feedback scoped per user; map uses approximate starting point only.

### Files
- `lib/map/discovery-visibility.ts` (+ tests) — filter authority, tiers, stack order
- `lib/map/privacy.test.ts` — scoped storage / no search keys
- `lib/recommendations/rank.ts` — `searchIntent` soft boost
- Map markers / Google + fallback maps — relevance + z-index stack
- `discovery-experience.tsx`, `discovery-nav.tsx`, `discovery-overlays.tsx` — controls wiring

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/map lib/recommendations/rank.test.ts lib/selection.test.ts` | **27 passed** |
| `tsc --noEmit` | clean |
| Invented coords / popularity | **never** |

---

## Prior — Task 6 Evidence-Grounded Activity Summaries

## Implement — Task 6 Evidence-Grounded Activity Summaries (2026-10-24)

### Authorized sources (inventory)
| Source | Used? | Notes |
|--------|-------|-------|
| `EventEntity.reviews` (mock demo) | Yes | Public demo text only |
| Live Supabase/Apify events | Empty `reviews: []` | Empty state — do not invent |
| Place `rating` / `reviewCount` | Listing fact only | No review text → insufficient for paraphrase |
| Listing fields (cost, difficulty, location, amenities) | Yes | Labeled `source: "listing"` facts |
| `activity_feedback` (Task 5) | **Never** | Private RLS own-rows |
| DMs / private posts | **Never** | Unauthorized |

### Data requirements (to unlock richer summaries)
Persist public review rows on activities/places (id, author display, rating, comment, created_at) from a licensed/authorized feed — then the same pipeline summarizes them without inventing quotes.

### Files
- `types/evidence-summary.ts`
- `lib/reviews/evidence-summary.ts` / `evidence-hash.ts` / `evidence-cache.ts` / `sanitize-review-text.ts`
- `app/api/evidence-summary/route.ts` — loads entity from catalog by id; rejects feedback smuggling
- `components/postcards/evidence-summary-panel.tsx` — detail UI (facts vs paraphrase)
- Wired into event + place detail cards

### Behavior
1. Summarize only authorized public reviews on the catalog entity.
2. Positive / concern / practical themes only when keyword-supported by excerpts + review ids.
3. Show source count + date range when available; list source refs.
4. Distinguish listing facts vs keyword paraphrases; never claim safety/hours/availability beyond sources.
5. Insufficient → “Not enough feedback to summarize”.
6. Cache by `contentHash`; refresh when review text changes.
7. Engine labeled `deterministic-rules`; `llmConfigured: false`.

### Tests
- Empty live path, place aggregate-only, conflicting reviews, stale cache, prompt-injection scrub, no private feedback invention — `lib/reviews/evidence-summary.test.ts`

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/reviews` | **10 passed** |
| `tsc --noEmit` | clean |
| LLM summary | **unconfigured** — rules only |
| Invented review dataset | **not created** |

---

## Prior — Task 5 Feedback-Based Activity Personalization

## Implement — Task 5 Feedback-Based Activity Personalization (2026-10-24)

### Goal
Improve For You rankings over time from meaningful signals (save, like, dismiss, join, rate) without collecting unnecessary PII, without claiming a learned model, and without letting weak signals override explicit constraints.

### Schema
- Migration: `supabase/migrations/20261024260000_activity_feedback.sql`
  - Table `activity_feedback` (`user_id`, `activity_id`, `action`, `rating`, `activity_category`, `created_at`)
  - RLS: SELECT/INSERT/DELETE own rows only; no UPDATE (append + clear)
  - Actions: `save | like | skip | join | rate`

### Files
- `types/feedback.ts` — actions + `local-demo | supabase` storage
- `lib/feedback/validation.ts` / `signals.ts` / `mappers.ts` / `storage.ts`
- `lib/recommendations/rank.ts` — dismiss hide, exact positive boost, similar-category affinity (weights ≪ interest)
- `app/api/feedback/route.ts` — GET/POST/DELETE (auth required)
- `app/api/recommendations/route.ts` — accepts `feedback[]`; re-applies rules after sklearn when present
- UI: detail Save/Like/Dismiss; For You quick actions; Preferences → Clear personalization

### Ranking policy (honest)
1. Hard constraints (budget, distance, schedule, skill) always win.
2. Declared preferred categories outweigh feedback affinity.
3. Feedback soft weights: exact positive +5, category affinity +3 (vs interest +35).
4. Dismissed ids are hidden with reason `dismissed_by_user`.
5. Cold start (`history=[]`) = existing baseline recommender.
6. Method notes never claim a trained feedback model.

### Tests
- `lib/feedback/signals.test.ts`, `validation.test.ts`, `storage.test.ts`
- `lib/recommendations/rank.test.ts` — boost, dismiss, affinity, budget precedence, cold start, apply-to-ML

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/feedback lib/recommendations/rank.test.ts` | **20 passed** |
| `tsc --noEmit` | clean |
| Trained feedback ML | **not used** — rules only |

### Apply migration
Run `20261024260000_activity_feedback.sql` on the project Supabase before signed-in sync works.

---

## Prior — Task 4 AI Community Post Intelligence

## Implement — Task 4 AI Community Post Intelligence (2026-10-24)

### Goal
Understand natural-language activity posts (e.g. “new in SF, badminton weekends 5–9 PM”), let authors review structured fields, then recommend real venues/events/people with field-based explanations — without guessing or exposing private data.

### Configuration
- **LLM:** not configured (`OPENAI_*` / Anthropic / Gemini absent). Do not claim an LLM was used.
- **Fallback:** `engine: "deterministic-rules"` via `lib/community/extract-preferences.ts`; on failure `engine: "unavailable"` with publish still allowed.
- **Migration:** `supabase/migrations/20261024250000_community_post_budget.sql` — optional `budget_cents`.

### Requirements checklist
| # | Requirement | Status |
|---|-------------|--------|
| 1 | Extract activity, location, DOW/time, intent, skill, constraints | **DONE** (calendar dates → unsupported note; dayparts do not invent hours) |
| 2 | Preserve original; store structured separately + validation/migration | **DONE** |
| 3 | Author review/correct before publish **or update** | **DONE** (compose + edit Suggest/Confirm) |
| 4 | Recommend real venues/events/discoverable users | **DONE** (`recommend-for-post` + permissions) |
| 5 | Explain with concrete matching fields | **DONE** |
| 6 | Ambiguous / multi-activity / missing / unsupported — no guessing | **DONE** |
| 7 | No personal-trait inference; no private leak | **DONE** |
| 8 | Visibility, blocks, reports, RLS | **DONE** (existing) |
| 9 | Usable if AI fails; indicate unavailable | **DONE** |
| 10 | Tests: extract, validation, auth/privacy, matching | **DONE** (domain + journey; live Supabase optional) |
| 11 | Update FLOW.md | **DONE** |

### Architecture
1. Author writes free-text → `POST /api/posts/extract`.
2. Rules extract per-field sources (`stated` / `unknown` / `ambiguous`); draft only includes **stated** values.
3. UI shows review notes + unsupported constraints; **Confirm & fill form** (message unchanged).
4. Publish/update via existing posts API (structured columns; `budget_cents` when stated).
5. Detail → recommendations: events / venues / people with reason codes; blocks + discoverability enforced.

### Honest gaps
- No LLM — rules coverage is finite (known cities/activities).
- Soft daypart hours exist only for map NL search / meetup planner (`softDaypartHours`), never auto-stored on posts.
- Calendar dates are not persisted (DOW only).
- Venue open/bookable status not verified.

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run` extract + community journey + nl-search + meetup-plan | **103 passed** |
| `tsc --noEmit` | clean |
| LLM | **unconfigured** (rules / unavailable engines only) |

---

## Prior — Task 3 Meetup planner

## Implement — Meetup planner (2026-10-24)

### Goal
Turn requests like “Plan a casual badminton meetup for four people this Saturday evening in San Francisco” into a reviewable suggested plan with real venue/event options on the map — never invented bookings.

### Files created
- `types/meetup-plan.ts` — criteria, options, plan status, disclaimers
- `lib/meetup-plan/extract-plan.ts` — NL parse + group size + follow-ups
- `lib/meetup-plan/build-plan.ts` — catalog load + venue/event rank → plan
- `lib/meetup-plan/extract-plan.test.ts` / `build-plan.test.ts` / `share-guard.test.ts`
- `app/api/meetup-plan/route.ts` — parse / build plan
- `app/api/meetup-plan/share/route.ts` — auth + `confirm:true` → community post
- `components/map/meetup-planner-panel.tsx` — review criteria, options, share

### Files modified
- `components/navigation/discovery-nav.tsx` — **Plan meetup** action
- `components/navigation/discovery-overlays.tsx` — auth open from planner
- `components/map/discovery-experience.tsx` — planner state, map highlight, share

### Architecture
1. User enters request → **Plan meetup**.
2. Rules extract activity / city / days / time / skill / budget / group size / vibe.
3. Essential missing fields (activity, city) → `needs_info` follow-ups (no fake results).
4. On confirm → `loadMapEntities` + `recommendVenuesForPost` / `recommendEventsForPost`.
5. Options include evidence reasons + honest availability notes (hours/booking not verified).
6. Selecting an option focuses the existing map pin/card.
7. **Share as community post** only when signed in and `confirm:true` (never auto-publish). Status remains a *suggested* plan, not a booking.

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/meetup-plan` | run below |
| External Google Places | **not configured** — catalog only |
| LLM | **unconfigured** (rules parser) |

### Honest gaps
- No live court/venue availability API.
- Group size only filters known event `capacity`; venues have no capacity field.
- Schedule day/hour still uses existing UTC stand-in helpers.
- Share creates an `organize_meetup` community post — not calendar invites or RSVP sync.

---

## Prior — Task 2 Teammate compatibility

### Status (Task 2)
**Implemented end-to-end for signed-in users against `discoverable_profiles_public` + blocks.**

## Implement — Teammate compatibility (2026-10-24)

### Goal
Rank other discoverable people for shared activities using only consented profile fields (interests, skill, availability, approximate area), with explainable scores and Message actions via existing DMs.

### Files created
- `types/compatibility.ts` — weights, match DTO, normalized `%` score
- `lib/community/compatibility.ts` — `scorePeerCompatibility` / `rankCompatibleTeammates`
- `lib/community/compatibility.test.ts` — ranking, missing fields, blocks, skill mismatch, empty
- `lib/community/compatibility.integration.test.ts` — public-row mapping + block composition
- `app/api/compatibility/route.ts` — `GET` (auth required)
- `components/recommendations/teammates-panel.tsx` — map chrome panel

### Files modified
- `components/navigation/discovery-overlays.tsx` — teammates panel + DM open from map
- `components/map/discovery-experience.tsx` — select person pin, pass compatibility into detail
- `components/postcards/detail-postcard.tsx` — compatibility reasons + Message (non-mock)

### Architecture
1. Viewer must be signed in; own profile fields become the query (never invent traits).
2. Candidates from `discoverable_profiles_public` (fuzzed pins; no `dm_policy` enum in response).
3. `loadBlockedPeerIds` excludes blocked peers.
4. Factors (configurable weights): shared interest, related activity, day/hour overlap, skill fit, area proximity. **Missing data skips the factor** (not a penalty); score = earned / applicable max → 0–100%.
5. Explanations only when backed by both sides’ data (e.g. “Both interested in badminton”).
6. UI: desktop “Compatible teammates” panel; selecting focuses map person; Message uses existing conversations API.

### Privacy
- Hidden / non-discoverable profiles never ranked.
- No exact addresses, personality, online status, or unprovided availability.
- API does not return `dm_policy` enum (only `acceptsMessages` derived in candidate mapper when available).

### Verification
| Check | Result |
|-------|--------|
| `npx vitest run lib/community/compatibility` | run below |
| Live Supabase ranking | **requires Auth + discoverable peers in DB** |
| Demo map people as compat results | **not used** (panel needs sign-in + real profiles) |

### Honest gaps
- Map mock `PersonEntity` pins remain UI demos; compatibility API ignores them.
- `acceptsMessages` on public view is derived when `dm_policy` absent (defaults open for discoverable).
- Local prefs panel is separate from profile availability — ranking uses **profile** fields only.
- Mobile: teammates panel is `md+` (same pattern as For You).

---

## Prior — Task 1 NL map search

### Status (Task 1)
**Implemented end-to-end (rules parser, not an LLM). Demo catalog verified in tests; live Supabase catalog when configured.**

## Implement — NL map search (2026-10-24)

### Goal
Users type requests like “easy hike near me this weekend”; extract activity / location / days / time / skill / budget / kinds; review criteria; search the real map catalog; show matches on the map with field-based reasons.

### Files created
- `types/nl-search.ts` — criteria + match response types
- `lib/nl-search/extract-query.ts` — wraps community extract + target kinds / near-me
- `lib/nl-search/match-catalog.ts` — ranks real `MapEntity` rows with explanations
- `lib/nl-search/run-search.ts` — parse → optional review → `loadMapEntities` → match
- `app/api/nl-search/route.ts` — `POST` server route (`llmConfigured: false`)
- `components/map/nl-search-panel.tsx` — review criteria + match list UI
- `lib/nl-search/extract-query.test.ts` — 12+ parse cases (ambiguous cities, missing location, unsupported constraints)
- `lib/nl-search/match-catalog.test.ts` — catalog integration on `MOCK_MAP_ENTITIES` + `runNlSearch`

### Files modified
- `lib/community/extract-preferences.ts` — photography; evening/after-work/morning; easy→beginner; meet people
- `lib/community/activity-affinity.ts` — hike/run surface-form matching
- `components/navigation/discovery-nav.tsx` — **Natural-language match** button (keyword filters unchanged)
- `components/navigation/discovery-overlays.tsx` — wire NL handlers
- `components/map/discovery-experience.tsx` — NL panel, match-id map filter, select focuses pin
- `.env.example` — document `/api/nl-search` rules-only

### Architecture
1. Client sends message (+ optional edited criteria / `confirm`) to `POST /api/nl-search`.
2. Server runs **deterministic-rules** extract (same family as `/api/posts/extract`) — never claims LLM.
3. If criteria are thin/ambiguous → return `needsReview` without searching.
4. On confirm / clear parse → `loadMapEntities` (demo mock **or** Supabase catalog) → `matchNlCatalog`.
5. UI highlights matching pin ids; selecting a match uses existing preview/detail cards.
6. Manual keyword search + category/kind filters keep working in parallel.

### AI / security
- No OpenAI/Anthropic keys; no client-side secrets.
- Optional sklearn recommender (`RECOMMENDER_URL`) is **not** required for this path (activity-affinity + locality + schedule/skill/budget rules).
- Empty photography query returns empty — does not invent people.

### Verification (this session)
| Check | Result |
|-------|--------|
| `npx vitest run lib/nl-search lib/community/activity-affinity.test.ts` | **pass** |
| `npx tsc --noEmit` | run with full gate below |
| Live Supabase NL search | **uses real catalog when configured**; otherwise demo mock via `forceDemo` / data source |
| LLM | **unconfigured** (intentional) |

### Known gaps
- Day/hour schedule scoring still uses UTC stand-ins (same as existing recommender schedule helpers).
- City geocode for NL is label/locality + optional prefs `startingPoint` — not a new geocoder call per query.
- No LLM upgrade path wired; add provider + env only when product chooses one.

---

## Prior — Task 9 E2E verify

### Status (Task 9)
**Verification complete (mocked gate green; live Auth/DM/Realtime not exercised).**

## Verify — Community E2E (2026-10-24)

### Files created
- `lib/community/community-journey.test.ts` — MOCKED journey (profile → NL extract → post visibility → interest/reply rate limits → people/venue/event recs → map selection → DM membership → block/report).
- `lib/community/live-supabase.integration.test.ts` — LIVE opt-in (`RUN_LIVE_SUPABASE_TESTS=1`); skipped by default (2 skipped).
- `e2e/community-smoke.spec.ts` — Playwright UI smoke (landing + discover nav); no Auth.
- `playwright.config.ts` — Playwright config + optional webServer.

### Files modified
- `package.json` — `build` uses webpack (`next build`); `build:turbo` kept; added `test:python`, `typecheck`, `verify`.
- `lib/apify/normalize-find-events.test.ts` — expect canonical meetup id `316099065`.
- Lint fixes: landing apostrophe, nav `Link`, prefer-const, unused import, eslint-disable cleanup.

### Architecture / config
- Production build: **webpack** — Turbopack `next build --turbopack` fails with `Invariant: no direct app page entry found for /api/blocks` (dev `--turbopack` still OK).
- Live Supabase probe: set `RUN_LIVE_SUPABASE_TESTS=1` + public URL/anon key.
- Playwright needs Chromium install + unrestricted network; not runnable in this agent sandbox.

### Commands / results (this session)
| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **pass** |
| `npx vitest run` | **220 passed, 2 skipped** (live supabase skipped) |
| `services/recommender .venv pytest tests -q` | **17 passed** |
| `npx eslint . --max-warnings 0` | **pass** |
| `npm run build` (webpack) | **pass** — routes include blocks/reports/messages/posts |
| `npm run build:turbo` | **FAIL** — `/api/blocks` turbopack invariant |
| `npx playwright test` | **not run** — Chromium download blocked by sandbox |
| Live Auth / Realtime / Apify actors / sklearn HTTP | **not tested live** |

### Journey coverage (mocked domain vs live)
| Step | Mocked tests | Live |
|------|--------------|------|
| 1–2 Profile create / interests / location / availability | journey + profiles tests | not |
| 3–5 NL post + extract + visibility | journey + extract + visibility | not |
| 6 Interest + reply | journey + interaction validation | not |
| 7–8 Recs + map selection | journey + recommend-* + selection | ML HTTP mocked/fallback only |
| 9–10 DM + unauthorized | journey + messaging tests | Realtime not live |
| 11 Block / report / ownership | journey + privacy-safety | RLS live probe skipped |
| 12 Apify + map + sklearn service | apify/normalize + rank + python pytest | Apify actors not invoked |

### Known issues / unfinished
- No two-account manual/live E2E against configured Supabase Auth.
- Playwright smoke exists but browsers not installed in this environment.
- Turbopack production build broken for new API routes; use webpack `npm run build`.
- Moderation dashboard still absent (reports insert-only).
- Apply migrations `…230000` + `…240000` if not already on the project.

## Implement — Privacy & safety (2026-10-24)
### Shipped
1. Migration `20261024240000_privacy_safety.sql` — `content_reports` (insert-only RLS, no public SELECT), `location_share_level`, fuzz trigger, block-aware interest/reply INSERT policies, refreshed `discoverable_profiles_public`.
2. Blocks: `GET/POST/DELETE /api/blocks`; enforced on messaging, interest, replies, people recommendations.
3. Reports: `POST /api/reports` only; `GET` returns 403; no public listing.
4. Hide/close own posts via status PATCH UI (archive = hide from discovery; close = no new interactions).
5. In-process rate limits on post/reply/interest/message/conversation/report/block.
6. Profile UI: discovery + DM policy + location share level (approximate / city_only / hidden).
7. Tests `lib/privacy/privacy-safety.test.ts` — hidden/private/archived/blocked exclusion, reports private, rate limits, safe errors.

### Incomplete before real public launch (documented, not claimed done)
- No staff moderation dashboard / triage queue (reports stored only for future service-role access).
- Rate limits are single-Node memory (not Redis/multi-instance).
- Profiles table RLS still allows authenticated SELECT of discoverable rows; app + public view fuzz, but column grants / view-only access should be tightened for production.
- No auto-hide from report volume; no appeal flow; no email abuse alerts.
- Existing DM threads after `nobody` / undiscoverable remain readable to members (new starts blocked).
- Apply SQL migrations in Dashboard; enable Realtime publication for messages if live chat is required.

## Implement — 1:1 messaging (2026-10-24)
### Inspection
- Auth: `@supabase/ssr` cookie sessions; ownership from `auth.uid()`.
- Profiles already have `dm_policy` (everyone | discoverable_only | nobody).
- Browser client uses anon key only (no service role).

### Shipped
1. `supabase/migrations/20261024230000_direct_messages.sql` — `user_blocks`, `conversations` (unique `pair_key`), `conversation_members`, `messages`, RLS, `start_direct_conversation()`, Realtime publication attempt.
2. `lib/messaging/*` + `GET/POST /api/messages/conversations` + `GET/POST /api/messages/conversations/[id]` — membership checks; sender always session user; body max 2000.
3. UI: `MessagesPanel` + MessageCircle in nav; Message CTAs from post author, interested users, people recs.
4. Browser Realtime subscribe on `messages` + poll fallback.
5. Vitest `lib/messaging` — **19 passed** (membership/pair_key, unauthorized access errors, blocks/dm_policy rules, persistence mapping, duplicate pair key, validation).

### Security notes
- No client INSERT on conversations/members (only security-definer RPC).
- Messages SELECT/INSERT require membership; INSERT forces `sender_id = auth.uid()`.
- Private message bodies never on public post/profile queries.
- Blocks checked in API + RLS insert policy.

### Realtime report
- **Code wired** for postgres_changes on `public.messages` when Supabase client is configured.
- **Not live-tested** in this session against two Auth accounts on a running Supabase project (migration must be applied first; Dashboard Replication / publication required for INSERT events).

## Fix — Localize post recommendations (2026-10-24)
- Far badminton hits (e.g. Boston) were included because activity re-add skipped distance.
- Hard locality filter: geocoded radius (default 35 km) or same-city label on events, venues, and people.

## Fix — Post recs ignored asked sport (2026-10-24)
- **Bug:** Badminton post got nearby “sports” noise (bachata, pilates, F45) because category match was enough.
- **Change:** activity-first filters (`activity-affinity`): exact badminton/club/court first; if none, labeled similar (pickleball/tennis). People require that activity (or related) on interests/bio/open post. UI Exact/Similar badges.

## Fix — Network error loading recommendations (2026-10-24)
- **Cause:** `RECOMMENDER_URL` set but uvicorn not running → `fetchMlRecommendations` threw `ECONNREFUSED`; post recommendations route returned 500.
- **Change:** catch ML failures in `recommend-events.ts` and fall back to labeled deterministic rules (same as `/api/recommendations`). Route try/catch; clearer client error text.

## Implement — Post recommendations (2026-10-24)
### Inspection
- Events: existing FastAPI TF-IDF when `RECOMMENDER_URL` set; else labeled rules.
- Catalog: Supabase activities + places + discoverable profiles (fuzzed coords).
- No venue open/bookable verification in schema.

### Shipped
- `lib/community/post-to-preferences.ts` — post fields → match query / UserPreferences.
- `recommend-events.ts` — real events via ML client or rules; URL dedupe; source URL; no invented rows.
- `recommend-places.ts` — real venues; text/category/radius; **never** claims open/bookable.
- `recommend-people.ts` — discoverable-only; interest/schedule/skill/radius evidence; `activelyLooking` only with open post.
- `recommend-for-post.ts` + `GET /api/posts/[id]/recommendations`.
- UI: post detail Recommendations (events / venues / people) → Map / View profile / express interest on post.
- Tests: people privacy/radius/skill/empty; venues relevance/radius/empty; events dedupe/empty.

### Genuinely implemented
| Method | Status |
|--------|--------|
| Event ranking (rules) | **Yes** — deterministic weighted rules on catalog |
| Event ranking (sklearn TF-IDF) | **When `RECOMMENDER_URL` is up** — otherwise labeled `rules-fallback` |
| Venue filters | **Yes** — deterministic; not ML |
| People overlap | **Yes** — deterministic on discoverable profiles |
| City geocode for radius | **Yes** — Nominatim server helper (approx) |
| Verified venue hours/booking | **No** — explicitly disclaimed |
| Private messaging transport | **No** — only shows if profile accepts messages |
| Fake users/venues to fill UI | **Never** |

### Verification
| Check | Result |
|-------|--------|
| `vitest` lib/community | **58 passed** |
| `tsc --noEmit` | clean |

## Implement — NL post → structured prefs (2026-10-24)
### Inspection
- **No LLM provider** in repo/env (`OPENAI_*` / Anthropic / Gemini absent).
- Existing “AI”: FastAPI TF-IDF recommender (`RECOMMENDER_URL`) + HTML description enrich — neither extracts post structure.
- **Approach:** clearly labeled **deterministic** server parser (`engine: deterministic-rules`). Not an LLM. `llmConfigured: false` on API.

### Shipped
- Types: `types/community-extract.ts` — per-field `stated | inferred | unknown | ambiguous`; local hours; no precise addresses.
- Parser: `lib/community/extract-preferences.ts` + sanitize/confirm in `extract-validation.ts`.
- API: `POST /api/posts/extract` (message + optional IANA zone hint; hours never converted to UTC for storage).
- UI: Community compose → “Suggest details from message” → review sources → “Confirm & fill form” (message intact) → edit → publish.
- Safety: user text never drives SQL/prompts/permissions; invented skill/budget/radius/streets stripped on sanitize.
- Tests: example badminton/SF post, missing details, ambiguous cities, time formats, invalid model JSON, confirmation merge.

### Limitation (reported)
No supported AI chat provider is configured. Extraction is rules-only until one is added and wired.

### Verification
| Check | Result |
|-------|--------|
| `vitest` lib/community | **44 passed** |
| `tsc --noEmit` | clean |

## Implement — Post replies & interest (2026-10-24)
### Goal
Authenticated users express/withdraw interest and add/delete replies on visible open posts. Counts from real rows. Unique (post, user) interest. Owner sees interested users subject to discoverability. Private/archived/unavailable posts reject unauthorized interaction (RLS + server checks, not UI-only).

### Shipped
- Migration: `supabase/migrations/20261024220000_community_post_interactions.sql`
  - `community_post_interests` unique `(post_id, user_id)`; SELECT own + post owner; INSERT only when post open+readable; DELETE own.
  - `community_post_replies`; SELECT if post readable; INSERT open+readable; DELETE own author.
  - Helpers + count RPCs (`community_post_interest_counts`, `community_post_reply_counts`).
- Lib: `interaction-validation`, `interaction-mappers`, `interaction-counts`, `post-access`; visibility helpers for interact/list/delete.
- APIs: `POST/DELETE/GET /api/posts/[id]/interest`, `GET/POST /api/posts/[id]/replies`, `DELETE .../replies/[replyId]`; detail GET includes real counts.
- UI: Community detail — interest toggle, owner interested list (privacy-redacted), chronological replies + own delete.
- Tests: duplicate interest detection, ownership, visibility gates, invalid replies, privacy mapping.

### Apply migration
Run `20261024220000_community_post_interactions.sql` in SQL Editor **after** community_posts migration.

### Verification
| Check | Result |
|-------|--------|
| `vitest` lib/community | **32 passed** |
| `tsc --noEmit` | clean |
| Live two-account interact | **blocked until interaction migration applied** |

## Implement — Community posts (2026-10-24)
### Goal
Authenticated users publish natural-language posts (optional activity, place, schedule, intent, skill, radius). Community view browses/filters with bounded pagination. Owner-only edit/delete; server ignores forged owner ids. No fake public seed posts. Map/Apify unchanged.

### Shipped
- Migration: `supabase/migrations/20261024210000_community_posts.sql` — table, checks, indexes, RLS (`public` / `author_discoverable` / `private`), owner-only mutate, `owner_id = auth.uid()` on insert.
- Types: `types/community-post.ts`; `DbCommunityPost*` in `types/database.ts`.
- Lib: `lib/community/{validation,mappers,visibility,query}.ts` + vitest (validation, visibility/ownership, filters/pagination).
- API: `GET/POST /api/posts` (list limit≤50 + keyset cursor; create); `GET/PATCH/DELETE /api/posts/[id]` (owner filter; forged owner ids ignored).
- UI: nav Community icon → `CommunityPanel` (list/filter/compose/detail/edit/delete; public author peek via `/api/profiles/[id]`). Map/Apify untouched.
- Docs: `supabase/README.md` community section.

### Visibility / privacy
- Posts never store lat/lng — city/neighborhood labels only.
- Non-discoverable authors redacted to “Community member” for other viewers.
- Archived + private = owner-only (RLS + pure helpers).

### Apply migration
Paste/run `20261024210000_community_posts.sql` in Supabase SQL Editor (after profiles migration). Until applied, APIs return 503 with apply hint.

### Verification
| Check | Result |
|-------|--------|
| `vitest` lib/community | **23 passed** |
| `tsc --noEmit` | clean |
| Live publish/edit/delete | **blocked until migration applied** |

## Fix — 110 fetched but ~20 visible / seeming duplicates (2026-10-24)
- **Why ~20:** “For you” auto-on ranked only ~20 events; distance filter also hides far pins. Fetched count ≠ map pins.
- **Why clones:** Eventbrite ids stored as `2003…` vs `eventbrite:2003…` broke upsert identity.
- **Change:** canonicalize source ids + URL fallback upsert; map-side URL dedupe; stop forcing For you on; status/nav show loaded vs visible counts; removed known duplicate row in Supabase.

## Fix — Discovery pin → Ecuador (2026-10-24)
- Cause: Nominatim first-hit on ambiguous names can be outside the US.
- Change: `/api/geocode` appends USA + `countrycodes=us` (unless query names another country); rank prefers US/CA; profile pin rejects Ecuador labels and suggests “City, CA”.

## Privacy — private search + visible people (2026-10-24)
- Search query: React state only (never localStorage/server); cleared on account change / sign-out.
- Prefs + feedback: storage keys scoped by auth user id (`trailmap.*.v1:user:<id>`).
- People layer: wider metro radius; For You does not hide people/places.
- Copy: search privacy note; discoverable = others can see public profile only.

## Implement — Landing page (2026-10-24)
- `/` → `LandingPage` (brand-first hero, product sections, motions).
- Top-right **Sign in** / **Register** → existing `AuthPanel`; on success → `/discover`.
- CTAs: Get started (register), Browse the map (anon ok), Create profile / Sign in.
- `/discover` → existing `DiscoveryExperience` (unchanged map/Apify/profile).
- Trailmap title in nav links home.

## Implement — User profiles (2026-10-24)
### Auth inspection (before)
- No middleware / `@supabase/ssr` / login UI / `handle_new_user`. Env already had Supabase URL + anon (+ service role).

### Shipped
- Migration: `supabase/migrations/20261024200000_profiles_social.sql` (city, neighborhood, skill, availability, radius, dm_policy, updated_at, bootstrap trigger, `discoverable_profiles_public`).
- `@supabase/ssr` browser + server clients; `middleware.ts` session refresh.
- API: `GET/PATCH /api/profile` (own; ignores forged ids); `GET /api/profiles/[id]` (own vs public discoverable).
- UI: nav profile icon → `AuthPanel` + `ProfilePanel` (fits existing overlay chrome).
- Map people pins fuzz ~1km; legacy column fallback until migration applied.
- Validation/access unit tests; live RLS ownership verified against project.

### Verification
| Check | Result |
|-------|--------|
| `vitest` profiles + mappers | **21 passed** |
| `tsc --noEmit` | clean |
| `npm run build` | success (`/api/profile`, `/api/profiles/[id]`, middleware) |
| Live RLS self-update | pass (display_name/bio) |
| Live RLS hijack other user | **0 rows**; Bob name unchanged |
| Social columns / view / trigger | **not applied yet** — SQL Editor required |
| Email signup session | confirm-email on in project (`hasSession: false` until confirm); use Auth panel “check email” path or disable confirm for demo |

### Blocker for full field set
Paste/run `supabase/migrations/20261024200000_profiles_social.sql` in Dashboard SQL Editor, then new fields + auto profile-on-signup + fuzzed public view go live. Until then API persists legacy fields only.

## Audit — Community features readiness (2026-10-24)
### Already present
- Schema: `profiles` (opt-in discoverable approx pins), `places`, `activities` (`source_type` includes `community`), `activity_registrations` + RLS.
- Map UI: Places / Events / People toggles; `PersonEntity` + person postcard (“Follow coming with auth”).
- Prefs + feedback: localStorage only.
- Apify ingest + description enrich (HTML scrape, not LLM).
- FastAPI TF-IDF recommender: **events only**.

### Missing (needed for product list)
- Auth UI / session middleware (policies need `auth.uid()`); no `@supabase/ssr`, no `on_auth_user_created` → `profiles` trigger.
- Community posts, replies, interest expressions (DB + API + UI).
- NLP extraction of activity/location/availability from free text (**no LLM** in repo — HTML scrape + regex only).
- Place + compatible-user recommendations (For You = events only; FastAPI `interest_text` unused by Next).
- Private messaging; blocks; reports; richer privacy controls.

### Schema / RLS watch-outs (from audit)
- Discoverable `profiles` SELECT exposes full row incl. stored `discovery_lat/lng` (UI says approximate; no fuzz column).
- `places` authenticated INSERT with no owner; Apify writes via service role.
- `activities` INSERT allows `organizer_id is null`; registrations: own-row only + public count RPC (no organizer attendee list; no capacity RPC).
- No messages/posts/blocks/reports tables; no Realtime/storage buckets; PostGIS not enabled.

### UI reuse (keep map-first; do not redesign)
- Shell: `discovery-experience` → nav / map / preview→detail postcards / For You / prefs overlay.
- Stubs already in copy: person “Follow coming with auth”; place “Save place coming with auth”.
- Nav prefs gear ≠ user profile. Join + feedback are local-only (`demo-registration`, `feedback/storage`).
- APIs today: recommendations, geocode, enrich-description, ingest apify/refresh — no auth/posts/chat.
- `npm run test:e2e` exists but no Playwright specs in repo yet.

### Do not break
- Apify upsert identity `(source_provider, source_record_id)`; enrich allowlist; cost honesty; service-role secrets off browser.
- Existing postcard/map chrome; Supabase as sole DB; labeled rules-fallback when recommender down.
- Recommender CORS is localhost:3000 only — prod hosting needs an explicit update.

### Next
Implementation task after audit approval — start with auth + profile bootstrap/privacy, then posts/RLS.

## Fix — False Free when description has a fee (2026-10-24)
- **Bug:** Listing shows Free / “within budget” while About says `Fee: $18 per person`.
- **Cause:** Scrapers mark `isFree: true` or omit structured price; we stored `cost_cents=0`.
- **Change:** `resolveCostCents` / `inferCostCentsFromText` in `lib/apify/import-draft.ts`; wired through Eventbrite/Meetup/find-events normalizers; `mapActivityRow` reconciles existing DB rows so UI shows `$18` (or Cost unknown) instead of Free without re-ingest.
- **Verified:** vitest `import-draft.cost`, `normalize-eventbrite-meetup`, `mappers` (Fee: $18 → 1800¢).

## Verify — ML pipeline (2026-10-24)
### Data path (real catalog)
- Supabase `activities`: **340** total, **337** `source_type=apify` (meetup/eventbrite/runsignup/luma).
- Next `loadMapEntities` → filter events → `eventToMlPayload` → FastAPI.
- Live Next call: `catalogSize: 322`, `dataMode: supabase`, `source: sklearn`, `method: tfidf-cosine`.

### Algorithm
- Confirmed code uses `sklearn.feature_extraction.text.TfidfVectorizer` + `cosine_similarity` in `services/recommender/app/recommender.py`.

### Personalization (live Apify rows)
- Hiking interest top: “Weekly Hikes at Reinhardt Redwood Regional Park” (hiking).
- Sports interest top: “HIIT on the Hudson” / Zumba / pickleball-style rows.
- `topChanged: true` across interest sets.

### Constraints
- Free-only (`max_budget_cents: 0`): **44 excluded**, 5 ranked (unknown costs not hard-failed).
- Distance/schedule/skill reasons appear on live Next tops (`within_distance`, `schedule_fit`, `budget_unknown`, `skill_fit`).

### Failure / security
- Missing prefs → Next **400** `{ok:false}`.
- Invalid lat → FastAPI **422**.
- Empty catalog → **200** empty ranked.
- Health payload has no secrets.
- Unavailable ML → route returns labeled `rules-fallback` (code path; connection-refused simulated).

### Commands run
| Command | Result |
|---------|--------|
| `pytest` (recommender) | **17 passed** |
| `vitest lib/recommendations` | **8 passed** |
| `tsc --noEmit` | clean |
| `npm run build` | **success** (includes `/api/recommendations`) |
| Live FastAPI + Next + Supabase | **pass** (see above) |

### Files changed this pass
- `services/recommender/app/models.py` — distance ceiling
- `services/recommender/tests/test_recommender.py` — large radius test
- `lib/recommendations/ml-client.ts` — timeout + catalog cap + error detail
- `app/api/recommendations/route.ts` — clamp prefs; use normalized `prefs` (fixed 500 from stale var)
- `components/map/discovery-experience.tsx` — remove unused eslint-disable
- Cleared corrupted `.next` and restarted `npm run dev` (ENOENT buildManifest)

### Final live recheck after restart
- `POST /api/recommendations` missing prefs → **400**
- Happy path → `source: sklearn`, `dataMode: supabase`, `catalogSize: 320`, `method: tfidf-cosine`, 3 ranked real ids

### Not claimed / blockers
- Browser click→map pin not automated (Playwright not run); selection wiring inspected + API returns real catalog ids used by For You `onSelectActivityId`.
- Ingest category noise (`sports` for non-sports titles) hurts ranking quality — separate from ML correctness.
- Keep `uvicorn` on `:8001` + `npm run dev`; otherwise UI labeled rules-fallback.
- **Next recommended task:** improve Apify→category mapping / sports keyword quality, or add Playwright smoke for For You → map select.

## Implement — sklearn content-based recommender (2026-10-24)

### Phase 1 findings
- Catalog: `public.activities` (Apify upsert). For You ranks **events**.
- Prefs: localStorage `UserPreferences` (categories, budget, distance, schedule, skill, starting point).
- Prior For You: deterministic `lib/recommendations/rank.ts` only.

### Architecture
1. Browser → `POST /api/recommendations` with prefs.
2. Next loads real events via `loadMapEntities` (Supabase/demo).
3. Server POSTs catalog+prefs to FastAPI `RECOMMENDER_URL` (`http://127.0.0.1:8001`).
4. FastAPI: hard filters + **TfidfVectorizer + cosine similarity**; returns ids/scores/reasons (`method: tfidf-cosine`).
5. UI hydrates ids onto existing entities; For You / map selection unchanged visually.
6. If service down/unset → labeled `rules-fallback` / deterministic rules (not fake ML).

### Files created
- `services/recommender/` — FastAPI app, constraints, recommender, tests, README, requirements
- `app/api/recommendations/route.ts`
- `lib/recommendations/ml-client.ts`, `fetch-recommendations.ts`, tests
- Updated: `types/recommendations.ts`, `discovery-experience.tsx`, `for-you-panel.tsx`, postcards, `.env.example`, `ml/README.md`, `.gitignore`, `FLOW.md`

### Algorithm (honest)
- scikit-learn `TfidfVectorizer` (1–2 grams) on title+description+category; cosine similarity vs preference query built from declared categories (+ light expansions).
- **Not** trained on outcomes / feedback.

### Constraints
- Hard when evaluable: budget, distance, schedule, skill.
- Unknown cost/coords/times → `*_unknown` reasons; not invented matches.

### Config
- `RECOMMENDER_URL=http://127.0.0.1:8001` (server-only)
- Run: `cd services/recommender && source .venv/bin/activate && uvicorn app.main:app --port 8001`

### Verification run
- `pytest` in `services/recommender`: **16 passed**
- `vitest` recommendations: **8 passed**
- `curl /health` → ok tfidf-cosine; sample POST ranked hike > volleyball for hiking interest
- `tsc --noEmit`: fixed nullability issues in discovery + ml-client test

### Remaining
- Keep uvicorn running alongside `npm run dev` for live ML For You.
- No new Supabase migration required.
- Outcome learning / feedback training not implemented (and not claimed).

## Fix — On-demand full description (2026-10-24)
- **Problem:** UI showed “Show less” but text still ended mid-sentence (`11:00am...`) — Apify stored a truncated Meetup summary; enrich during ingest often kept it.
- **Fix:** `preferRicherDescription` accepts any longer extract when summary looks truncated; detail card calls `POST /api/enrich-description` on open to load full public page text.

## Fix — Full auto multi-scraper + descriptions (2026-10-24)
- **Ask:** Description cut off (`***AI…`); only ~6 Seattle events; want all scrapers automatic on location Set (no curl).
- **Refresh:** parallel Eventbrite+Meetup, Find Events, RunSignup, ClassPass; re-enable page description enrich.
- **UI:** Set city → save + fetch immediately; About defaults expanded; strip markdown; hint when source truncated.
- **Note:** crawlerbros Eventbrite-only still skipped (Apify rental/permissions).

## Fix — Auto-ingest cooldown + speed (2026-10-24)
- **Bug:** `AUTO_INGEST_MIN_INTERVAL_MINUTES=2` was treated as invalid (`< 15`) and forced to **180 min** → “retry in ~179 minutes”.
- **Fix:** honor 1-min (floor 15s); default 1 min; retry copy shows seconds when < 1 min.
- **Speed:** refresh runs one Actor only, `maxItemsPerSource: 12`, `enrichDescriptions: false`; client cooldown 1 min.

## Fix — Location change fetches that city's events (2026-10-24)
- **Problem:** Changing prefs location only re-ranked SF data; non-SF looked empty.
- **Change:** `/api/ingest/refresh` resolves a place name (label or reverse geocode), runs Eventbrite+Meetup + Find Events for that city; prefs Save / manual location forces refresh; map hides far markers; client cooldown is per geo bucket; manual locationSource not overwritten by browser on open.

## Fix — ClassPass Cloudinary images (2026-10-24)
- **Error:** `classpass-res.cloudinary.com` not in `next.config` images
- **Change:** allow `classpass-res.cloudinary.com` + `**.cloudinary.com` in `next.config.ts`

## Implement — Eventbrite-only / RunSignup / ClassPass (2026-10-24)
- **Actors:** `crawlerbros/eventbrite-scraper`, `hypebridge/runsignup-race-scraper`, `scrapersdelight/classpass-studios-scraper`
- **API:** `"actor":"eventbrite"` | `"runsignup"` | `"classpass"` on `POST /api/ingest/apify`
- **Files:** types + normalize/run + ingest + places upsert + migration `places_provenance` + tests + docs
- **Curl:** see `docs/APIFY_INGEST.md` sections D–F

## Fix — Location by place name (2026-10-24)
- **Ask:** Ask for location name; keep my-location; allow other cities.
- **Files:** `app/api/geocode/route.ts`, `lib/location/geocode-place.ts`, `preferences-panel.tsx` `StartingLocationSection`.

## Implement — hypebridge/find-events (2026-10-24)
- **Files:** `types/apify-find-events.ts`, `normalize-find-events.ts`, `run-find-events-actor.ts`, `ingest.ts`, API route, tests, docs
- **Defaults:** `sports_fitness`, platforms meetup/eventbrite/runsignup/luma, `getEventDetails: true`
- **Curl:** `"actor":"find_events","city":"San Francisco, CA"`

## Feature — Auto nearby refresh (2026-10-24)
- **Ask:** Fetch on every app open + show by user location.
- **Reality:** Apify is minutes + paid — use stale-aware auto refresh, not every reload.
- **Files:** `app/api/ingest/refresh/route.ts`, `lib/ingest/auto-refresh-*`, `lib/location/browser-geolocation.ts`, discovery-experience + map center, prefs “Use my location”, `.env.example`.
- **Enable:** `AUTO_INGEST_ON_OPEN=true` + restart.

## Fix — Full event descriptions (2026-10-24)
- **Problem:** Apify Actors return short summaries; UI showed little detail.
- **Change:** `lib/apify/enrich-event-description.ts` — server fetch of source URL; JSON-LD + HTML extract; wired in `ingest.ts` (`descriptionsEnriched` count). Re-ingest to update DB.

## Fix — About description clip (2026-10-24)
- **Cause:** Expanded state used `max-h-40`, cutting mid-sentence even after Read more.
- **Change:** `detail-postcard.tsx` — expanded shows full stored text; card scrolls. Note that Actor descriptions are summaries.

## Fix — Smaller category sticker markers (2026-10-24)
- **Ask:** Smaller markers; stickers for hike/sports/etc.; keep orange/green/blue by kind.
- **Change:** `map-marker.tsx` h-7; Lucide icons by category; legend shows event sticker row. Files: `marker-styles.ts`, `map-legend.tsx`, google + fallback maps.

## Research — multi-recreation Actors (2026-10-24)
- Shortlist: `docs/APIFY_ACTORS_RECREATION.md`

## Implement — seemuapps/eventbrite-meetup-events-scraper (2026-10-24)
- **Actor:** `seemuapps/eventbrite-meetup-events-scraper` (Eventbrite + Meetup, sports keywords, ticket prices)
- **Files:** `types/apify-eventbrite-meetup.ts`, `lib/apify/import-draft.ts`, `normalize-eventbrite-meetup.ts`, `run-eventbrite-meetup-actor.ts`, `upsert-imported-activity.ts`, `ingest.ts`, `app/api/ingest/apify/route.ts`, mappers + `sports` filter, `20261024170000_sports_cost.sql`, docs
- **API:** `POST /api/ingest/apify` with `"actor":"eventbrite_meetup"`
- **UI:** existing map/postcards; Sports category; cost from `cost_cents` when present
- **Next:** apply SQL migration; curl recreation ingest; then optional `hypebridge/find-events`

## Fix — Meetup image host (2026-10-24)
- **Error:** `hostname "secure.meetupstatic.com" is not configured under images`
- **Change:** `next.config.ts` — allow `secure.meetupstatic.com` / `**.meetupstatic.com`

## Fix — Detail postcard date/location/description/host (2026-10-24)
- **Problem:** Weekday-only time; no location row; description visually truncated; organizer showed generic "Organizer".
- **UI:** `formatEventWhen` includes month/day; MapPin meta row; Read more → fixed-height scroll; Meetup link for Actor’s 500-char description cap; show Meetup `group.name` as Host group.
- **Data:** Migration adds `location_label`, `host_label`; normalize/ingest write venue + group when present.
- **Files:** `detail-postcard.tsx`, `lib/utils.ts`, `normalize-meetup.ts`, `ingest.ts`, `mappers.ts`, `supabase-map.ts`, types, tests, `20261024160000_activity_location_host.sql`.

## Problem
Ingest public recreational Meetup events via a verified Apify Actor into Supabase without redesigning the map-first UI, and keep provenance + idempotent upserts.

## Audit (Step 1)
1. **Works:** Map-first homepage, markers, postcards, search/filters, demo/Supabase data modes, preferences + rule-based recommendations, Maps with `DEMO_MAP_ID`.
2. **Mock-only:** Demo seed/fixtures when `DATA_SOURCE=demo` or Supabase empty; attendee counts / reviews remain unknown when not in DB.
3. **Supabase:** Configured for public reads (`NEXT_PUBLIC_SUPABASE_*`); schema in `supabase/migrations/`; provenance migration added (must be applied in project).
4. **Apify:** No prior integration; now implemented server-side against Actor `epicscrapers/meetup-events-scraper`.
5. **Smallest plan:** migrate provenance → normalize/ingest → `POST /api/ingest/apify` → map via existing loader → tests. Blocker for live: three server secrets + migration apply.

## Verified Actor (Step 2)
| Field | Value |
|-------|--------|
| Actor | `epicscrapers/meetup-events-scraper` |
| Source | Public Meetup.com event search |
| Docs | https://apify.com/epicscrapers/meetup-events-scraper |
| Fields used | `id`, `title`, `dateTime`, `endTime`, `url`, `venue.lat`/`lon`, `description`, `fee` |
| Credentials | Apify API token (paid store usage) |
| Not claimed | Live dataset write until secrets + curl succeed |

## Changed files
- `FLOW.md` — this log
- `supabase/migrations/20261024140000_apify_provenance.sql` — provenance columns + unique upsert index
- `types/apify-meetup.ts`, `types/database.ts`, `types/map-entities.ts` — Actor + DB provenance types
- `lib/apify/run-meetup-actor.ts` — Apify client Actor call
- `lib/apify/normalize-meetup.ts` — validate/normalize; reject incomplete
- `lib/apify/ingest.ts` — upsert places/activities; summary counts
- `lib/apify/*.test.ts` — fixture tests (normalize, ingest, auth failure)
- `lib/supabase/admin.ts` — server-only service-role client
- `app/api/ingest/apify/route.ts` — Bearer `INGEST_SECRET` protected endpoint
- `lib/data/mappers.ts`, `lib/data/supabase-map.ts` — map `provenance: "apify"`; relation unwrap for tsc
- `components/postcards/preview-postcard.tsx`, `detail-postcard.tsx` — Imported badge + attribution (existing visual system)
- `docs/APIFY_INGEST.md`, `docs/SPONSOR_ALIGNMENT.md`, `ml/README.md`, `supabase/README.md`, `.env.example`, `package.json` (`apify-client`)

## Schema / migrations
- `20261024140000_apify_provenance.sql`: `source_provider`, `source_record_id`, `imported_at`, `last_verified_at`, `import_run_id`; unique `(source_provider, source_record_id)` for idempotent upserts.
- Community vs imported: `source_type` / `source_provider` distinguish rows; import time ≠ event start.

## Environment (server-only)
```
APIFY_API_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
INGEST_SECRET=
```
Never `NEXT_PUBLIC_*`.

## How to run ingest
```bash
curl -sS -X POST http://localhost:3000/api/ingest/apify \
  -H "Authorization: Bearer $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"location":"San Francisco","query":"hiking","maxResults":15,"days":21,"eventType":"PHYSICAL","topicCategoryId":"684"}'
```
See `docs/APIFY_INGEST.md`.

## Commands / tests executed
- `npx tsc --noEmit` — pass
- `npm run lint` — pass
- `npm run build` — pass (`/api/ingest/apify` dynamic)
- `npm test` — **48/48** pass (fixtures labeled; not live proof)

## Live integration results
**Not run.** `.env.local` lacks Apify token, service role, and ingest secret. No claim of stored Meetup rows from Apify.

## UI preservation
Map-first homepage, colors, typography, markers, postcard layout, and interactions unchanged. Only small **Imported** badge + Meetup-via-Apify freshness copy on existing postcard chrome.

## Next milestone (ML)
Python + scikit-learn + FastAPI ranking over the same Supabase activities; label model vs rules vs mock. Documented in `ml/README.md`. Current app uses deterministic `lib/recommendations/rank.ts` only.

## Outstanding blockers
1. Apply `20261024140000_apify_provenance.sql` in the Supabase project.
2. Set `APIFY_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `INGEST_SECRET` in `.env.local` (still unset).
3. Execute curl ingest and confirm rows in `activities` with `source_provider = 'apify'`.

## Incident — curl Internal Server Error (2026-10-24)
- **Symptom:** `POST /api/ingest/apify` returned plain `Internal Server Error` (not JSON).
- **Cause:** Two `next dev` processes (ports 3000 + 3001) corrupted shared `.next` (`ENOENT` on `_buildManifest.js.tmp.*`).
- **Fix:** Kill both listeners, `rm -rf .next`, restart a single `npm run dev` on 3000.
- **Also:** `$INGEST_SECRET` was unset in the shell and `.env.local` lacked the three server secrets — after server fix, expect `401` until secrets are set.
