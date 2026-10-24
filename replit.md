# CoSolve

Complaint intake, investigation, policy-guided recommendations, manager approvals, and customer-service analytics in one workspace.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cosolve/src/pages/workspace.tsx` — complaint inbox, case workspace, audit log, analytics, customers, and policies.
- `lib/api-spec/openapi.yaml` — source of truth for API contracts and generated client hooks.
- `artifacts/api-server/src/routes/cosolve/` — CoSolve API routes and AI workflows.
- `lib/db/src/schema/` — persistent customer, order, complaint, compensation, policy, and audit tables.

## Architecture decisions

- The AI classifies complaints, recommends remedies from active policies and relevant complaint history, and drafts replies. It does not fine-tune a model from the sample records.
- AI recommendations never issue compensation or send customer messages. Agents record communications; monetary remedies require a pending-approval step before resolution.
- Channel attribution and CSV imports support manual historical intake. WhatsApp and Google review accounts are not connected to this app yet.

## Product

CoSolve centralizes complaints and customer/order context, prioritizes cases, supports policy-aware investigation and manager approval, records actions, and surfaces financial exposure, recurring issues, and service health.

## User preferences

- Keep the workspace minimal and easy to scan.

## Gotchas

- The initial dataset is fictional demo data. Do not treat it as connected business records.
- CoSolve uses Clerk sign-in for workspace APIs. Clerk public metadata `role: "manager"` gates compensation approval and adjustment review; signed-in staff can request review but cannot approve. Assign managers through the API server's `set-staff-role` script.
- AI requires the shared `OPENAI_API_KEY` secret. AI calls are billed by OpenAI.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
