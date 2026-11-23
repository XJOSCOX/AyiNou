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

Disposable tests reconcile changes written by both policy routes with their audit entries and verify the rendered timestamp, actor and reason. Tests also cover access denials, pagination across ties and credential redaction. Local checks gate the hosted deployment.

## Documentation and operations

Open Platform → Audit history in the Founder’s original private administration workspace. Each result shows its policy, current username or actor ID, previous and new values, recorded reason and time. Older changes can be viewed with the pagination control.

## Remaining blockers

The additive read projection requires hosted deployment and verification against existing policy histories. No hosted audit records need to be copied or changed.
