"""Authenticated inference service for the fine-tuned CoSolve sentiment model."""

from contextlib import asynccontextmanager
import hmac
import os
from pathlib import Path

import torch
from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field
from transformers import pipeline

# Serverless Network Volumes are mounted at /runpod-volume. Set this variable
# explicitly when testing the same app on a regular Pod.
MODEL_DIR = os.getenv("COSOLVE_MODEL_DIR", "/runpod-volume/artifacts/sentiment-distilbert-v1/model")
API_KEY = os.getenv("COSOLVE_API_KEY")
MAX_TEXT_CHARS = 2_000

classifier = None


class AnalyzeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class AnalyzeResponse(BaseModel):
    sentiment: str
    confidence: float
    needs_human_review: bool
    model_version: str


def verify_api_key(candidate: str | None) -> None:
    if not API_KEY:
        raise RuntimeError("COSOLVE_API_KEY is not configured")
    if not candidate or not hmac.compare_digest(candidate, API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


@asynccontextmanager
async def lifespan(_: FastAPI):
    global classifier
    if Path(MODEL_DIR).is_dir():
        device = 0 if torch.cuda.is_available() else -1
        classifier = pipeline("sentiment-analysis", model=MODEL_DIR, tokenizer=MODEL_DIR, device=device)
    else:
        # The initial Serverless deployment can run before its Network Volume is
        # attached. Keep /ping healthy so the endpoint can be configured, but do
        # not serve predictions until the model is mounted and a worker restarts.
        print(f"Model directory is not mounted yet: {MODEL_DIR}")
    yield
    classifier = None


app = FastAPI(title="CoSolve Fine-Tuned Sentiment API", version="1.0.0", lifespan=lifespan)


@app.get("/ping")
def ping():
    return {"status": "ok", "model_loaded": classifier is not None}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest, x_api_key: str | None = Header(default=None)):
    verify_api_key(x_api_key)
    if classifier is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model is loading")

    result = classifier(request.text.strip())[0]
    sentiment = str(result["label"]).lower()
    confidence = round(float(result["score"]), 4)
    return AnalyzeResponse(
        sentiment=sentiment,
        confidence=confidence,
        # Neutral is the least reliable class in the initial evaluation. Human review
        # is also required for predictions with insufficient confidence.
        needs_human_review=(sentiment == "neutral" or confidence < 0.80),
        model_version="sentiment-distilbert-v1",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "80")))
