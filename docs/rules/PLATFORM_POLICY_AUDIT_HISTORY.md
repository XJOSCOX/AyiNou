# Platform policy audit history

## Scope

Platform → Audit history shows the Founder a Policy changes section for Registration and Community Statistics, including changes recorded before this release. Existing account and role history remains part of the same screen.

## Data model and API

The read-only service RPC projects existing `private.registration_policy_events` and `private.platform_boolean_policy_events` records. The private API returns up to twenty entries with changed fields, current public username when available, stable actor ID, source revision, timestamp and written reason. Indexes support recent reads of each ledger.

## Permissions and audit

The API checks the current session and PostgreSQL requires active Founder provenance, recent MFA and the original private workspace on every page. Actor attribution and reason come from the original mutation record. Policy history reads use the existing audit request budget and create no new mutation events.

## Privacy and lifecycle

The projection includes an allowlist of policy values and the original written reason. It excludes invitation credentials, email addresses from Auth records, request fingerprints and unrelated audit payloads. Source retention and lifecycle rules still govern the underlying records. The username is the current profile handle; a missing handle displays the stored actor ID.

## Localization and accessibility

All four languages label the sections, values and page controls. Timestamps use the browser locale and time zone. History uses ordered entries and labeled change values with theme tokens and wrapping for long reasons.

## Reliability and recovery

Newest-first keyset pages use the timestamp, source and revision to order ties. Encrypted cursors bind to the actor, original session and workspace, expire after five minutes and retain the initial high-water mark. Returning to the latest changes refreshes the snapshot. No new writable event ledger or historical copy is introduced.

## Validation and CI

Disposable tests reconcile changes written by both policy routes with their audit entries and verify the rendered timestamp, actor and reason. Tests also cover access denials, pagination across ties and credential redaction. Local typecheck, lint, 53 API tests, shared and localization checks, engineering standards, both production builds and three targeted Chromium tests passed.

## Documentation and operations

Open Platform → Audit history in the Founder’s original private administration workspace. Each result shows its policy, current username or actor ID, previous and new values, recorded reason and time. Older changes can be viewed with the pagination control.

## Remaining blockers

The read-only migration was applied to hosted development project `hcbxulyfmdmuyccgrujs` after the single-file dry run. The database has 92 applied migrations and zero pending. Postflight verified both indexes, service-only RPC execution, and preservation of the 2 homepage and 8 registration records. The local API was restarted and denied anonymous requests while its homepage and registration reads stayed available. There are no remaining hosted development blockers.
