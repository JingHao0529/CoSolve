# RunPod sentiment service

The canonical service implementation is [`../app.py`](../app.py). The existing root
Dockerfile still copies and runs that file. `handler.py` is a convenience entry point
for the submission folder; it starts the same FastAPI HTTP service, not a queue worker.

## Deployment and model volume

Build from the repository root with `docker build -t cosolve-sentiment .`.
The root `requirements.txt`, Dockerfile and `app.py` retain their existing contents.
No deployment or endpoint changes are required by this repository organisation.

Keep the existing Network Volume attached to the endpoint. The service reads
`COSOLVE_MODEL_DIR`, defaulting to:

```text
/runpod-volume/artifacts/sentiment-distilbert-v1/model
```

The model weights remain on the volume and are not committed to GitHub. Keep
`COSOLVE_API_KEY` in the endpoint environment and in Replit server-side Secrets.
The optional `PORT` defaults to 80 for this Python service.

## API

- `GET /ping`: reports service health and whether the model is loaded.
- `POST /analyze`: accepts `{"text":"Customer complaint"}` with `X-API-Key`.
- The response contains `sentiment`, `confidence`, `needs_human_review`, and `model_version`.
- Without the model mounted, `/ping` stays available and inference returns HTTP 503.

For local Python execution, install the root requirements, set the service environment
variables, and run `python runpod/handler.py`. Python does not automatically load `.env`.
On a machine without the volume, explicitly set `COSOLVE_MODEL_DIR` to a local model directory.

## Replit integration

For this custom sentiment service, configure `COSOLVE_SENTIMENT_URL` with the endpoint
base URL or `/analyze` URL, `RUNPOD_API_KEY` with the RunPod token and `COSOLVE_API_KEY`
with the service key. Leave `RUNPOD_BASE_URL` and `RUNPOD_ENDPOINT_ID` unset in this mode:
the existing client gives those OpenAI-compatible options priority.

The React frontend and Express backend run on Replit. RunPod runs only model inference.
See [`../SERVERLESS_PLAN.md`](../SERVERLESS_PLAN.md) for the existing deployment notes.
