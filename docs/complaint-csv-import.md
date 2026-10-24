# Safe CSV retries

CSV import enables duplicate protection on the server. Manual form submissions do not enable it and can deliberately record a separate complaint.

## Matching rules

- Prefer an optional `sourceId` column (aliases: `externalId`, `reviewId`, `messageId`). The key is the normalized source/channel plus the trimmed, **case-sensitive** external ID. Use a distinct source/channel name for each account if its IDs are only unique within that account.
- Without an ID, the fallback fingerprints all supplied details: normalized channel, customer name/email, subject, message, order ID/value, received timestamp and rating. Text uses Unicode NFC, trimmed boundaries and normalized line endings. Only channel/customer identity ignore case and collapse whitespace; complaint content and order IDs remain case-sensitive.
- Missing dates use a stable “not supplied” value, never the server's current time. Changing a supplied field changes the fallback key. Identical complaints with no distinguishing date/order need distinct source IDs if they are genuinely separate events.
- A source ID takes precedence over content: importing an edited copy of the same external complaint skips it rather than overwriting an existing case.

The identity is SHA-256 hashed and stored separately with a unique primary key. A transaction-scoped database lock serializes simultaneous requests for the same identity. Creating the customer, incrementing its count, saving the case, its creation audit event and the import identity commit together. A failed transaction can be retried without partial records.

The results show newly imported, linked, tracked-duplicate, left-out and failed counts. “View tracked duplicates” lists each CSV record number (header is row 1), customer, subject and a link to the existing case. Quoted multiline fields count as one CSV record.

## Reviewing older imports

Choose a CSV or Excel workbook in **Complaint inbox → Review CSV / XLSX imports**. Choosing a file only previews it; no rows are saved until **Confirm selected actions**. Imports require sign-in and support up to 300 rows across all worksheets and files smaller than 10 MB. Workbook rows retain worksheet names and row numbers in results.

- **Tracked duplicate** means that exact import key is already recorded. The preview links to the existing case and skips creating another complaint. On confirmation, incomplete AI preparation can resume, as with ordinary import retries.
- **Uncertain historical matches** are suggestions, not duplicate verdicts. The source, normalized customer name, subject and message must match; a supplied email, order ID and received date also have to match. Missing dates do not exclude older cases or substitute today's date. Repeated text can therefore show several candidates, all of which remain visible for review.
- Open the candidate case to check its details. Explicitly choose **Confirm link to existing case**, **Import as a separate complaint**, or **Leave out — do not save**. A candidate is never selected automatically. Rows without candidates default to importing, but can be left out.
- A confirmed link stores the existing import identity and one **Import identity linked** audit entry attributed to the signed-in manager. It does not change the complaint, create a customer, increment complaint counts or add another **Complaint received** event. Retrying that row subsequently becomes a tracked duplicate.
- Links are authenticated and transactional. They use the same per-identity lock as normal import creation. A retry of the same link is a no-op; an identity already assigned to a different case returns a conflict rather than being reassigned. Preview again after a conflict.
- Results distinguish new imports, linked rows, tracked duplicates, deliberately omitted rows and failed row numbers. Only failed actions remain available for retry in the current review.

After confirmation, new imports and tracked retries continue through classification, resolution recommendation, manual approval-queue routing when needed, and response drafting. Progress and any failed AI stage remain visible per row. Historical link actions do **not** run this preparation or modify existing complaint fields. Approving payouts, sending replies and closing complaints remain manual.

There is no automatic merging, deletion or provenance inference, and a candidate list is not an exhaustive fuzzy search: edited text or different supplied dates will not be suggested. Use case details to investigate before importing.

### Source IDs across accounts

The source/channel is the account namespace. For exports whose IDs are only unique inside one account, use distinct values such as `Reviews: shop A` and `Reviews: shop B` **consistently on every retry**. The same `sourceId` in these two sources is a separate identity and is not a legacy match across sources. CoSolve cannot infer an account that the CSV does not supply.

For genuinely separate complaints with identical fallback details (including missing dates), add different stable `sourceId` values before importing. Repeated identical rows without distinct IDs refer to the same import identity, even when you choose to create: choosing separate does not bypass tracked retry protection. Existing fingerprints have not changed.

## Browser regression

Run `pnpm --filter @workspace/api-server test:csv:browser` with the development database available. The command requires Chromium (`CHROMIUM_PATH`, default `/repl/tools/bin/chromium`) and fails explicitly if the database or browser is unavailable.

This test bundles the real inbox and generated API client, serves the real complaint/import routes on a temporary loopback server, and supplies CSV files through Chromium's native file-input API. Clerk identity and AI preparation are test-only substitutes; it does not verify Clerk sessions, invoke paid AI, or test approval flows.

Coverage includes same-file re-selection, preview without saving, pre-confirmation duplicate counts and per-row warnings/links (including mixed files), repeated uploads with case/customer/creation-audit counts, post-confirmation tracked-duplicate disclosure and record numbers (including quoted multiline text), following an existing-case link in a new tab, mixed new/repeated rows, a temporary save failure and retry of only failed actions, disabled controls during processing, and malformed CSV clearing stale results without an API call. Uniquely namespaced database records, temporary bundles, CSV files, browser profiles and browser/server processes are removed in `finally`, including after assertion failures.
