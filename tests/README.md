# Tests

The existing regression suites stay next to the TypeScript modules they exercise.
From the repository root with Node.js 24 and installed pnpm dependencies:

```sh
pnpm test
```

This runs the API unit suites (RunPod client, hybrid classification, intake,
import deduplication, email formatting, resolution policy, and staff access) and
the frontend complaint-import unit suite. Unit tests use substitutes for external
services and do not require live GPU inference.

Additional integration/browser commands are in the application package.json files.
Those require a development database and/or browser, and some require authenticated
test sessions. See `docs/approval-session-verification.md` and `docs/complaint-csv-import.md`.
Do not run them against production data.

This folder provides the template's test entry point without duplicating the suites
or replacing them with the template's illustrative Python test_utils.py.
