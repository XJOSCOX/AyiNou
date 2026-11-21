# O2 organization signup and resumable intent

Baseline `8651b9aa998b43eaaae5b16c73169cc4c5bf20eb` on `main`.

## Signup and resume

Registration opens with two radio choices above the existing personal fields. Individual is the default. Organization describes future identity and authority checks. Both send the same Supabase Auth signup, referral attribution and confirmation request, followed by the same four personal onboarding steps. The successful callback still routes to personal onboarding. Its completion screen and the Institutions hub both link to the new protected `/organization-onboarding` page.

The protected page reloads the authenticated owner's current intent. It shows the setup checkpoint and the distinction between pending setup eligibility and applying for a review. After the personal steps, the member can start or save the intent and can open the existing identity verification screen. No additional personal or organization data is needed for these O2 checkpoints. A member can leave at any point and return on a different browser. The client ties requests to the current Auth subject, cancels stale work on session change and retries a lost response with its original command key.

Continuing as an individual takes a second explicit confirmation. It saves a cancelled intent and receipt without changing the personal account or any institution relationship. Ownership or a pending/approved claim returns a dependency warning for the future O5 workflow. The cancellation is intentionally conservative because O2 does not link an intent to a specific organization.

## Database and API

`20261121020000_o2_organization_intents.sql` adds a private signup choice queue, intent table and versioned command receipt table. An Auth trigger captures the signup hint only at insertion and consumes it at email confirmation. Individual signup needs no intent row. No backfill is required. Each subject has at most one open intent. The four persisted stages are `selected`, `drafting`, `awaiting_identity` and `cancelled`. Cancelled history and receipts stay associated with the Auth subject, with no new time-based retention policy.

| Endpoint | Request and behavior |
| --- | --- |
| `GET /api/v1/me/organization-onboarding` | Returns the current intent or null. |
| `PUT /api/v1/me/organization-onboarding` | Saves a draft/identity checkpoint with ID, expected version and UUID request ID. New intents use null ID and version zero. |
| `POST /api/v1/me/organization-onboarding/:id/change-path` | Cancels the current intent with expected version and UUID request ID. |

All three tables enable RLS and deny direct application-role grants. Service-only SQL RPCs recheck live session, including account restrictions and applicable MFA assurance. Commands serialize by Auth subject, verify the intent ID and version, and write the receipt atomically. Reusing a command key with different input fails. Read responses and errors are uncached. Cross-subject IDs return a nondisclosing 404. The UI is localized in Haitian Creole, French, English and Spanish.

## Scope and dependent decisions

The existing Phase 5D `institution_save_for_api` can create an active institution and owner through `POST /api/v1/institutions`. O2 adds no new caller of that command. O4 must gate the legacy and future create paths together and recheck personal identity and authority for claims. O3 needs approved scope, identity proof, consent, conflict handling, appeal and separate provenance for Founder Verified. A referral code does not supply any pilot admission credential. The planned 18+ invitation-only pilot, production contact delivery, legal publication decisions and real privacy processing remain separate.

See the [O1 capability matrix](O1_CAPABILITY_MATRIX.md) and [owner decision brief](O1_OWNER_DECISION_BRIEF.md).

## Validation

The full local Chromium suite passed 47 tests against disposable Supabase and local email delivery. O2 coverage includes both signup choices, email callback, referral confirmation, profile persistence, four locales and responsive layouts, a committed write with lost response, fresh-browser resume, correction, subject isolation, duplicate keys, stale and competing writes, denied direct grants, protected ownership and revoked sessions. Typecheck, lint, 47 API tests, seven client tests, shared contract and translation parity checks, L5 validation, Legal Center checks and both production builds passed.

The hosted read-only preflight confirmed the expected session and institution functions. The dry run listed only the O2 migration on project `hcbxulyfmdmuyccgrujs`. At commit preparation the hosted write awaited the Supabase CLI’s explicit production consent.
