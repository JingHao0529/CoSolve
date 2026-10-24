# Application source map

CoSolve is a React/Express TypeScript application organised as pnpm workspaces.
The submission template's Python `src/main.py` and `src/utils.py` examples are
adapted to the existing application rather than replacing it.

| Responsibility | Source |
| --- | --- |
| React entry point | [`../artifacts/cosolve/src/main.tsx`](../artifacts/cosolve/src/main.tsx) |
| Workspace UI | [`../artifacts/cosolve/src/pages/workspace.tsx`](../artifacts/cosolve/src/pages/workspace.tsx) |
| Express entry point | [`../artifacts/api-server/src/index.ts`](../artifacts/api-server/src/index.ts) |
| Complaint routes and AI clients | [`../artifacts/api-server/src/routes/cosolve/`](../artifacts/api-server/src/routes/cosolve/) |
| Database schema | [`../lib/db/src/schema/`](../lib/db/src/schema/) |
| OpenAPI contract | [`../lib/api-spec/openapi.yaml`](../lib/api-spec/openapi.yaml) |
| Generated client and validation | `../lib/api-client-react/`, `../lib/api-zod/` |

Original workspace paths are preserved for imports, package scripts, TypeScript
references, and Replit configuration. The Python service at `../app.py` is the
RunPod inference service, not the Replit application.
