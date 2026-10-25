# Trailmap recommender (scikit-learn)

Content-based recommendations using **TfidfVectorizer + cosine similarity**.

This is a real scikit-learn feature pipeline. It does **not** learn from user
outcomes over time. Hard budget / distance / schedule / skill filters are
applied separately when both preference and activity data exist.

## Run locally

```bash
cd services/recommender
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

- Health: `GET http://127.0.0.1:8001/health`
- Docs: `http://127.0.0.1:8001/docs`
- Recommend: `POST http://127.0.0.1:8001/recommendations`

The Next.js app should call this via **server-side** `RECOMMENDER_URL`
(default `http://127.0.0.1:8001`). The browser never sends the catalog with
secrets.

## Tests

```bash
cd services/recommender
pytest -q
```

Test fixtures are synthetic and marked as such. The running product uses the
real Supabase/Apify catalog supplied by Next.js.
