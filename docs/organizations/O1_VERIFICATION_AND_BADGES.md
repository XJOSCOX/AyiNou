# O1 verification and badges

## Current enforcement

Phase 5A `private.reviewed_personal_claims` requires an active account, source `review`, verified status and no publication hold. Phase 5B replaces the decision RPC and rechecks active reviewer eligibility, assignment and conflicts, plus a second distinct eligible assigned approval before approval is final. Institutional submissions require two distinct public reference hosts and decision-time snapshot checks. Reference-host counts indicate source diversity only. Claim approval can revoke current memberships and invitations and replace ownership. The claim path therefore needs a material dependency check and notice before it can be presented as routine onboarding. Verified organizations and existing representatives face separate claim restrictions.

The configured first-account bootstrap uses a singleton and creates a distinct `first_account_bootstrap` identity record. That provenance is excluded by `reviewed_personal_claims`. Preserve the founder’s administrator continuity and display official role separately. Founder Verified must not be used for self-verification or to reinterpret bootstrap provenance.

## Proposed design

Keep `public.verification_records` and the independent review path intact. Use separate private `founder_identity_cases`, `founder_identity_grants` and immutable events. Cases bind one subject, initiating actor, case revision, consent receipt, approved proof method and references. Enforce one active case and one active grant per subject with partial unique indexes. Grants record subject and issuer FK, case FK, purpose, issued time, policy version, hold and revocation metadata. Enforce issuer differs from subject, require explicitly assigned founding authority and recent MFA, and check active account, conflicts, consent and current proof in a single transaction. Founder alone does not imply authority over cases where personally conflicted. A substantiated trust hold blocks the founder capability immediately. A correction revokes or supersedes and opens a new case with a fresh proof where needed.

Use challenge design from the [database master plan](../DATABASE_MASTER_PLAN.md) if a later approved mechanism is available. Bind proof to actor, purpose, case and expiry. Consume it once under a lock, rate-limit, and store only sanitized proof receipts and nonsecret references. A live session, an email confirmation, an invitation or prior acquaintance on its own does not demonstrate both identity and present account control. Prefer a direct confirmation ceremony and a separate account-bound proof, with structured confirmation basis, conflict declaration and minimal notes. Do not solicit government-ID scans, health data, passwords or raw challenge secrets. Case access and audit access are separate permissions.

Proposed authenticated routes: GET `/api/v1/me/founder-identity`, POST `/api/v1/me/founder-identity/consent`, GET `/api/v1/admin/founder-identity` with scoped case filters, and POST `/api/v1/admin/founder-identity/:id/actions` for grant, deny, hold or revoke. Require expected version, scoped idempotency key, reason code and bounded rationale. Offer subject notification, correction and independently assigned appeal. If no neutral reviewer exists, keep appeal pending, preserve evidence and allow emergency containment; no self-adjudication.

| Designation | Visual and explanatory copy |
| --- | --- |
| Founder Verified | Distinct amber seal with explicit text “Founder Verified” and accessible tooltip “Ayinou’s founding administrator confirmed this person’s identity and account control.” |
| Identity Verified | Preserve existing reviewed badge and label. “Ayinou’s independent review process confirmed this identity.” |
| Platform administrator | Existing role indicator with explicit role label. |
| Verified organization | Organization-specific mark only for current reviewed approval. Registration confirmation is shown separately where authorized. |

Use readable labels in all four languages, separate public projections from capability checks, suppress held/revoked grants and avoid duplicate identity marks by preferring independent provenance where both apply. Identity badges make no claims about statements, authority over an organization, quality of work, institutional registration or trustworthiness. See the [capability matrix](O1_CAPABILITY_MATRIX.md).


## Founder review screen

Show only the assigned case, account-control receipt status, consent, conflict disclosure, method, rationale and grant scope. Recommended labels: “Confirm account control”, “Record how you confirmed this person’s identity”, “Declare any conflict”, “Grant Founder Verified for organization setup”, “Hold for review” and “Revoke designation”. Show the outcome and audit receipt in text. Require explicit confirmation and recent MFA at submission. Return focus to any error or the committed result. Provide the same localized copy, semantics and keyboard actions across viewport sizes.
