# CoSolve always-available API: deployment plan

## Recommended cost configuration

Use a **Serverless Load Balancer** endpoint with **Flex workers**.

- Active workers: `0`
- Maximum workers: `1`
- GPUs per worker: `1`
- Idle timeout: keep the Runpod default initially
- Network Volume: attach existing `cosolve-reviews`
- Region: Europe, matching the existing volume

The API URL remains stable, but a first request after idling may wait for a worker to load the model. Do **not** select an always-running active worker: it would incur 24/7 GPU charges and cannot meet the US$5 budget.

## Before deployment

1. Build this folder into a Linux/amd64 Docker image and publish it to a container registry, or deploy from an existing GitHub repository through Runpod's GitHub integration.
2. In the endpoint configuration, attach `cosolve-reviews`. Serverless mounts network volumes at `/runpod-volume`, which is the model path already used in `app.py`.
3. Add `COSOLVE_API_KEY` only as a Runpod endpoint secret/environment variable. Do not place it in the image, repository, source code, or frontend.
4. Inspect the live GPU price and expected storage charges before clicking Deploy. This package itself does not create a Runpod endpoint.

## Post-deployment

The API will have a URL like `https://ENDPOINT_ID.api.runpod.ai/analyze`. Store that endpoint URL and the same `COSOLVE_API_KEY` in **Replit server-side Secrets**. The browser frontend must never receive either secret.
