# CoSolve

CoSolve is a complaint-resolution workspace for turning negative customer reviews into consistent, manager-reviewed follow-up. Review imports are classified with AI; only reviews identified as Negative enter the active complaint views.

## Product features

- **CSV and XLSX intake:** Import review exports, read populated workbook sheets, match tracked duplicates, and automatically prepare clear matches.
- **Negative-only inbox:** Runpod determines sentiment. Positive and Neutral reviews are filtered out; unknown reviews are checked first. AI errors are reported rather than treated as negative.
- **AI-assisted investigation:** Runpod provides sentiment signals. Grafilab classifies complaints, generates resolution guidance, and drafts customer responses.
- **Manager-led resolutions:** Review policy matches and proposed remedies, edit the recommendation, and approve it manually. CoSolve records compensation decisions; it does not itself transfer money through a bank.
- **Customer communication:** Edit response drafts and send through a connected Gmail account. CoSolve records send status; provider acceptance is not proof of email delivery.
- **Customer and order context:** Review available customer, order, complaint, and approved compensation history together.
- **Audit and reporting:** Track case activity, refunds, resolution performance, sentiment, recurring issues, and customer-relations health.
- **Adjustable workspace:** Switch light/dark themes and resize or collapse the sidebar.

Every signed-in user currently has manager capabilities.

### Integration scope

The current complaint intake is file-based. Live WhatsApp and Google review synchronization are not connected. Gmail sending requires a connected Gmail account. Customer and order matching uses data available in the workspace; it does not imply a live connection to an external ordering platform.

## Repository layout

| Path | Purpose |
| --- | --- |
| `artifacts/cosolve/` | CoSolve web application |
| `artifacts/api-server/` | CoSolve API and server-side workflows |
| `artifacts/cosolve-presentation/` | Editable 20-slide CoSolve product presentation |
| `artifacts/mockup-sandbox/` | Isolated component preview and canvas tooling |
| `lib/` | Shared workspace packages, including database and API contracts |
| `docs/` | Product workflow and verification documentation |
| `scripts/` | Workspace maintenance and post-merge setup |

This is a pnpm monorepo. The CoSolve app and API are configured as Replit workflows; open them from the Replit workspace to preview the application. The presentation is a separate slides artifact.

## Getting started

Use a Node.js version supported by the workspace and pnpm, then install dependencies from the repository root:

```bash
pnpm install
```

In Replit, run the configured workflows:

- **CoSolve web:** `pnpm --filter @workspace/cosolve run dev`
- **CoSolve API:** `pnpm --filter @workspace/api-server run dev`
- **Presentation:** `pnpm --filter @workspace/cosolve-presentation run dev`

The component preview server is managed separately; it is not required to run CoSolve.

## Configuration

Use Replit Secrets for credentials and environment-specific values. Never commit API keys, passwords, tokens, or `.env` files.

The AI workflow is configured for Runpod sentiment plus Grafilab classification and response drafting. Set the applicable values through Replit Secrets:

- `COSOLVE_API_KEY`
- `COSOLVE_RUNPOD_API_KEY`
- `COSOLVE_SENTIMENT_URL`
- `GRAFILAB_API_KEY`
- `GRAFILAB_MODEL`

Clerk authentication and the connected database also require their Replit-provided configuration. Do not copy secret values into this file or into Git. Connect Gmail through the app's supported Replit integration flow before sending customer email.

## Verification

Run these commands from the repository root:

```bash
# TypeScript checks across workspace packages
pnpm run typecheck

# API and CoSolve unit tests
pnpm test

# Browser test for the CSV/XLSX import and preparation flow
pnpm --filter @workspace/api-server run test:csv:browser

# Check, typecheck and build the slide presentation
pnpm --filter @workspace/cosolve-presentation validate-slides
pnpm --filter @workspace/cosolve-presentation typecheck
pnpm --filter @workspace/cosolve-presentation build
```

For database-backed integration tests, configure the development database as required by the test and app setup. Do not run development-data tests against production.

## Uploaded data and privacy

Review and complaint exports may contain customer information. Keep uploaded data out of the source repository and GitHub. The repository ignores the attached review CSV export pattern; check your GitHub repository and any existing Git history before publishing other customer data. Store credentials in Replit Secrets, not in source files.
