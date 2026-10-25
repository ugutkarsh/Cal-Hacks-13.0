"""FastAPI entrypoint for the Trailmap content-based recommender."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.models import HealthResponse, RecommendRequest, RecommendResponse
from app.recommender import METHOD_NOTE, rank_activities

app = FastAPI(
    title="Trailmap Recommender",
    description=(
        "Content-based activity recommendations using scikit-learn "
        "TfidfVectorizer + cosine similarity. Hard preference filters are "
        "applied separately. Not a trained outcome model."
    ),
    version=__version__,
)

# Local Next.js only — no credentials in the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        ok=True,
        service="trailmap-recommender",
        version=__version__,
        algorithm="tfidf-cosine",
    )


@app.post("/recommendations", response_model=RecommendResponse)
def recommendations(body: RecommendRequest) -> RecommendResponse:
    if len(body.activities) > 500:
        raise HTTPException(
            status_code=400,
            detail="At most 500 activities per request",
        )
    try:
        result = rank_activities(body)
    except Exception as exc:  # noqa: BLE001 — surface as 500 without secrets
        raise HTTPException(
            status_code=500,
            detail=f"Recommendation failed: {exc.__class__.__name__}",
        ) from exc
    # Ensure method_note always present
    if not result.method_note:
        result.method_note = METHOD_NOTE
    return result
