# Personal verification request limits

## Scope

A member can have one pending personal request across Identity Verified and public-figure verification. After that case closes, the member may request a designation they do not already hold. Current Founder Verified and independent identity both block another identity request. A public-figure designation follows its own review criteria. Institution, representative and ownership workflows keep their existing checks.

## Data model and API

The existing verification workspace response retains its application list and adds eligibility for each personal request type. It uses the same database decision helper as submission. The existing submission route returns a specific conflict for a pending request or a designation already held. The migration leaves historical applications and evidence intact, including older overlapping pending requests.

## Permissions and audit

The service validates the current member and the database checks the live eligibility state. Personal submission takes the existing trust lock before the actor lock, serializing requests with independent review and Founder grant decisions. Accepted submissions use the existing application and event transaction. Blocked attempts add no case or submission event.

## Privacy and lifecycle

The member sees their own eligibility state and existing application history. No underlying evidence or other member data is added to the response. Closed requests and supersession history remain available subject to existing privacy policy.

## Localization and accessibility

The existing Verification form explains disabled personal requests in Haitian Creole, French, English and Spanish. Members can still select a different available request type, read past decisions, and use the existing appeals workflow.

## Reliability and recovery

Concurrent submissions are rechecked in PostgreSQL. The form reloads authoritative eligibility after a conflict or successful submission. A new request becomes available after the last pending personal case closes, if the designation is still available.

## Validation and CI

Disposable Chromium scenarios cover concurrent cross-type attempts, disabled forms, reopening eligibility after a decision, independently verified and Founder Verified denial, and preservation of older application history.

## Documentation and operations

Deploy the matching API and web with the additive migration after the exact hosted approval. The existing policy, grant and reviewer settings stay in place.

## Remaining blockers

Hosted rollout requires separate approval for the exact migration after validation.
