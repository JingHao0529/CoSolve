# CoSolve fine-tuned sentiment API

This is a separate replacement for the initial binary `app.py`. It loads the fine-tuned three-class model saved at `/runpod-volume/artifacts/sentiment-distilbert-v1/model` when deployed to Runpod Serverless.

## Required environment variables

Set these in the **server environment only**. Do not place the API key in code, Git, client-side JavaScript, screenshots, or logs.

```text
COSOLVE_MODEL_DIR=/runpod-volume/artifacts/sentiment-distilbert-v1/model
COSOLVE_API_KEY=<a long random secret>
```

## Start command

```bash
python -m pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## API contract

`POST /analyze` requires an `X-API-Key` header and JSON body:

```json
{"text":"My order arrived late and cold."}
```

It returns a sentiment, confidence, and `needs_human_review`. The current model routes every neutral or lower-than-0.80-confidence prediction to human review. CoSolve should retain final control of any resolution, refund, or customer communication.

`GET /ping` does not reveal secrets and is required by Runpod's load-balancing health check.

## Replit integration, later

The Replit Express backend—not the browser frontend—will call this API with the `X-API-Key`. Store the RunPod endpoint URL and key in Replit server-side secrets. We will add failure handling so a model outage preserves the existing intake transaction and writes the current safe placeholder values instead.
