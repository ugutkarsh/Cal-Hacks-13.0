# ML recommendation service

## Status

Implemented under `services/recommender/` (FastAPI + scikit-learn).

## Contract with the app

- **Database:** same Supabase `activities` catalog — no second DB. Next.js loads events and POSTs them to the recommender.
- **Inputs:** declared preferences (budget, distance, schedule, interests, skill) + real activity fields.
- **Algorithm:** `TfidfVectorizer` + cosine similarity (content-based). Hard filters are separate.
- **Output:** ranked activity ids with relevance scores + evidence-based reasons; method `tfidf-cosine`.
- **Fallback:** if `RECOMMENDER_URL` is unset or the service is down, Next.js uses deterministic rules and labels `rules-fallback` / `deterministic-weighted-rules` — never silent fake ML.

## Run

```bash
cd services/recommender
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Set in `.env.local`:

```bash
RECOMMENDER_URL=http://127.0.0.1:8001
```

App path: browser → `POST /api/recommendations` → FastAPI `/recommendations`.

## Honest scope

This does **not** learn from feedback over time. It ranks by text similarity to declared interests after hard constraints.
