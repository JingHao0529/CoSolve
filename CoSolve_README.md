# CoSolve

> CoSolve is an AI-assisted complaint-resolution workspace for customer-support teams that helps staff triage complaints, review case context, and prepare consistent, human-approved responses.

## Team Information

| Field | Details |
| --- | --- |
| **Team Name** | Job Had Four Bros |
| **Team Domain** | Domain 2 |
| **SDG Tracks** | SDG 8 — Decent Work and Economic Growth; SDG 9 — Industry, Innovation and Infrastructure; SDG 12 — Responsible Consumption and Production; SDG 16 — Peace, Justice and Strong Institutions |
| **Team Leader** | Wong Ye Yang |
| **University** | Sunway College |
| **Number of Members** | 4 |

## Links

| Resource | Link |
| --- | --- |
| GitHub Repository | [JingHao0529/CoSolve](https://github.com/JingHao0529/CoSolve) |
| Live Demo | [co-solve-complaint-resolution.replit.app](https://co-solve-complaint-resolution.replit.app) |
| RunPod Endpoint | `https://3ki1sxdqm833mw.api.runpod.ai` *(authenticated; no API keys are included in this repository)* |
| Slide Deck | https://drive.google.com/file/d/1lJ3vuyz0EWFRKTNRcLl5P67GBRpljm6R/view?usp=sharing |
| Demo Video | To be added |

---

## Overview

### Problem

Customer-support teams often receive complaints through several channels and must manually read messages, identify urgency, check customer and order context, decide a fair next action, and draft a reply. This is repetitive and can lead to slow, inconsistent resolutions. Customers may receive uneven service, while businesses lose visibility into recurring issues and spend more time on manual triage.

### Solution

CoSolve provides a single workspace for recording, reviewing, and resolving customer complaints. It uses a fine-tuned DistilBERT sentiment model hosted on RunPod to return a sentiment label, confidence score, human-review flag, and model version. Structured AI assistance supports categorisation and response drafting, while staff remain responsible for approving recommendations, compensation, and outgoing messages.

### Key Features

- **Complaint intake and case workspace** — Capture customer, message, order, rating, and source details in one case record.
- **Sentiment analysis with confidence** — Classify complaint text as positive, neutral, or negative using the fine-tuned `sentiment-distilbert-v1` model, with lower-confidence cases flagged for review.
- **Human-approved response drafting** — Generate a helpful draft response for staff to edit and approve before sending.
- **Case history and audit trail** — Record complaint events, actions, and resolution progress for accountability.
- **Authenticated staff access** — Restrict the workspace to signed-in staff users through Clerk authentication.

### Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | Drizzle ORM with the project database |
| Authentication | Clerk |
| AI / Compute | Fine-tuned DistilBERT, Hugging Face Transformers, PyTorch, RunPod GPU and Serverless |
| AI Assistance | Grafilab OpenAI-compatible language-model API |
| Hosting / Development | Replit |

## Architecture

```text
Support staff
    |
    v
Replit-hosted CoSolve web app (React + Express + database)
    |                         |
    |                         +--> Clerk authentication
    |
    +--> RunPod Serverless endpoint --> fine-tuned DistilBERT sentiment model
    |
    +--> Grafilab language-model API --> response-draft assistance
    |
    v
Human-reviewed recommendation, response, and audit trail
```

## Datasets and Model Training

The sentiment model was trained using public review datasets:

- [Womens Clothing E-Commerce Reviews](https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews)
- [Malaysia Restaurant Review Datasets](https://www.kaggle.com/datasets/choonkhonng/malaysia-restaurant-review-datasets)

The resulting model, `sentiment-distilbert-v1`, was fine-tuned on RunPod GPU compute and deployed as a RunPod Serverless endpoint. The model supports staff decision-making; it does not automatically issue refunds or send customer messages.

## How to Run

### Run on Replit

1. Open the [CoSolve Replit project](https://replit.com/@yeyanggg/CoSolve-Complaint-Resolution) or import the GitHub repository into Replit.
2. Add the required secrets in Replit. Keep keys out of source control. The application needs credentials for its external services, including RunPod, Grafilab, and Clerk.
3. Install project dependencies with `pnpm install`.
4. Start the development environment with `pnpm dev`.
5. Open the web preview and sign in with an authorised staff account.

### RunPod Sentiment Service

The deployed RunPod endpoint is authenticated. The backend sends complaint text to the sentiment service and receives the predicted sentiment, confidence, human-review indicator, and model version. Store endpoint credentials only in Replit Secrets or local environment variables; never commit them to GitHub.

## How We Use Replit

- **Development:** Replit is the shared environment used to build and iterate on the React frontend, Express API, database integration, authentication flow, complaint workflows, and tests.
- **Hosting:** The live prototype is deployed at [co-solve-complaint-resolution.replit.app](https://co-solve-complaint-resolution.replit.app).
- **Secrets:** Service credentials are stored in Replit Secrets rather than committed to the repository.

## How We Use RunPod

- **Training:** RunPod GPU compute was used to fine-tune the DistilBERT sentiment classifier on review datasets.
- **Inference:** The trained `sentiment-distilbert-v1` model is deployed as a RunPod Serverless endpoint.
- **Integration:** The CoSolve backend calls the endpoint to analyse complaint text and uses the returned confidence to identify cases that need human review.

## Challenges and Learnings

- **Model reliability:** Neutral and ambiguous complaints are harder to classify than clearly positive or negative text. CoSolve therefore displays confidence and routes uncertain results for staff review.
- **Service integration:** Connecting a deployed GPU model, language-model assistance, authentication, and the application workflow required clear API boundaries and safe secret management.
- **Responsible AI:** AI drafts and recommendations must be reviewable. The final design keeps people in control of customer communication and consequential decisions.

## Future Improvements

- [ ] Add industry-specific complaint policies and resolution templates.
- [ ] Add pickup scheduling for refunded items and richer post-resolution follow-up.
- [ ] Add analytics for recurring complaint causes, response time, and resolution quality.
- [ ] Expand to specialised versions for other service-heavy industries.

## Team

| Name | Role |
| --- | --- |
| Wong Ye Yang | Team Leader |
| Team member 2 | To be added |
| Team member 3 | To be added |
| Team member 4 | To be added |

## Submission Checklist

- [x] Team name, domain, and SDG tracks filled in
- [ ] Slide deck link added
- [ ] Demo video link added
- [x] Replit used for development and deployment
- [x] RunPod used for model training and serverless inference
- [x] Preliminary proposal completed
- [x] Technical tools declaration completed
- [x] Export final submission documents to PDF using the required filenames
- [x] No API keys or secrets included in this README
