# Approval verification with real Clerk sessions

Verified in development on 2026-10-23 against the running CoSolve web and API workflows.

## Method

Two disposable Clerk users were created with verified email addresses, distinct Clerk IDs,
and actual public metadata roles of `staff` and `manager`. Each was signed in programmatically
through the testing runner's Clerk support in a separate browser context. A third context
remained anonymous. Requests used the contexts' authenticated request clients and the real
API middleware; no authentication or database substitutions were used.

Both authenticated contexts first received HTTP 200 from `/api/dashboard`.
Session cookies, passwords, and keys were not printed or saved.

## Verified results

| Action | Expected | Observed |
| --- | --- | --- |
| Anonymous public complaint intake | 201 | 201 |
| Anonymous approval request | 401 | 401 |
| Anonymous direct approval | 401 | 401 |
| Staff recommendation update | 200 | 200 |
| Staff approval request | 200 | 200 |
| Staff direct approval | 403 | 403 |
| Three simultaneous manager approvals | One 200, two 409 | One 200, two 409 |
| Manager retry after approval | 409 | 409 |
| Staff approval after manager approval | 403 | 403 |
| Staff correction request | 201 | 201 |
| Anonymous correction review | 401 | 401 |
| Staff correction review | 403 | 403 |
| Manager correction review | 200 | 200 |

Direct PostgreSQL assertions confirmed:

- Before manager approval: the case remained `Pending approval`, with no compensation and
  exactly one approval-request audit event attributed to the staff Clerk ID.
- After the concurrent and repeated approval attempts: the case was `Resolved`, with exactly
  one approved compensation of 40. Exactly one resolution audit event and one
  compensation-approved event were attributed to the manager Clerk ID.
- After correction approval: the original approved compensation remained 40. The approved
  correction was 25, with delta -15, requested by the staff identity and reviewed by the manager
  identity. Its approval audit event was also attributed to the manager.
- Cleanup removed the fixture's adjustment, compensation, audit events, complaint, and customer;
  all five fixture counts were zero. Both disposable Clerk users and all browser contexts
  were removed afterward.

## Shell integration suite

The successful pass above executed the core approval and correction journey through browser
sessions, not as a shell subprocess. The testing runner cannot securely transfer its browser
cookies into the shell's environment, so no cookie export was used to work around that boundary.
The broader date-trend, note-editing, and closure scenarios in the shell suite were not part of
this successful browser pass.

The existing shell suite remains available when dedicated browser cookie headers and the
corresponding user IDs have already been securely configured:

```sh
pnpm --filter @workspace/api-server test:approvals:integration
```

Required environment variables are `COSOLVE_TEST_STAFF_COOKIE`,
`COSOLVE_TEST_MANAGER_COOKIE`, `COSOLVE_TEST_STAFF_USER_ID`, and
`COSOLVE_TEST_MANAGER_USER_ID`. The users must be distinct and have the corresponding
development Clerk roles. `COSOLVE_TEST_BASE_URL` optionally selects the application origin;
the default is `http://localhost:80`. The test removes its uniquely identified database fixtures
in `finally`. Never put session values into this document or source control.

## Local checks and remaining UI issue

The API unit suite passed all 23 tests, and API typechecking and the API build passed.

The staff account's UI still displayed a `Manager` label because the workspace currently treats
every signed-in account as a manager for presentation. The real approval endpoints correctly
denied the staff identity. Aligning those labels and controls is separate follow-up work.
