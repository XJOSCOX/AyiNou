# Founder authority consolidation

## Scope

The recognized Founder inherits operational platform powers from trusted bootstrap provenance. The new capability is a direct decision on an eligible ordinary personal identity application. The ordinary queue, Founder Verified workflow, and existing governance and organization boundaries keep their own checks.

| Capability | State | Enforcement |
| --- | --- | --- |
| Routine platform administration, account restrictions and eligible safety actions | Implemented | Live Founder provenance inherits the existing platform admin predicate. The account, reason and audit guards remain active. |
| Routine moderation, eligible reports and appeals | Implemented within platform scope | Existing moderation and moderation-appeal predicates enforce session, role, resource and conflict checks. Independently adjudicated appeals retain separate eligibility. |
| Assign verification work | Implemented | The existing admin action validates the reviewer’s active assignment, current MFA, resource eligibility and conflicts. |
| Administrator appointment | Implemented | F1.1 direct Founder authorization and separate target acceptance, MFA and a one-time credential. |
| Regular personal identity | Implemented and deployed to hosted development | The Founder can review and decide one pending blue application in the original-session admin workspace. The ordinary reviewer path retains two eligible approvals. |
| Founder Verified | Implemented | Separate proof, member acceptance, and gold grant. Eligible pending blue applications close automatically on gold issuance with history preserved. |
| Operational audit | Implemented within scope | A1A keeps existing live viewer and case restrictions. The direct blue event has distinct authority provenance. |
| Confidential evidence, ballots, privacy, legal publication, organization ownership and protected governance | Protected | Existing domain access, policy gates, conflicts and independent decisions apply. |
| Multiple Founders, succession and Rules & Permissions configuration | Deferred | Separate owner-approved design and operational work. |

## Data model and API

The existing application, review, badge and institution audit records remain authoritative. Two service-mediated endpoints read the evidence references and make a versioned Founder decision. They are available from Platform administration → Trust and verification → Application assignments. The existing documentation and data distinguish the normal blue display from the way the decision was reached.

## Permissions and audit

PostgreSQL requires active trusted Founder provenance, a live original administration workspace, recent TOTP, an eligible applicant and a conflict-free personal identity application with evidence. Self review and other claim types are outside the exception. Approvals and rejections are versioned, idempotent, and commit with the audit receipt. The receipt records actual actor, application, timestamp, policy version, decision and private reason. A1A projects state and authority under its existing scoped access. It excludes evidence and written reasons.

## Privacy and lifecycle

An authorized Founder can read existing public evidence references for the exact pending case. Ordinary reviewers retain assignment-based access. Gold retains its separate consent, account control and proof. The shared blue badge accepts either blue provenance. Project and verified-poll participation, O4 established eligibility, Founding Ambassadors and protected leadership workflows retain their existing independent identity requirements. Prior approvals, gold grants, and closure history remain intact.

## Localization and accessibility

The decision form uses the current theme, labeled evidence, reason and conflict controls, and describes each outcome in Haitian Creole, French, English and Spanish. The blue and gold controls sit in separate sections.

## Reliability and recovery

The existing review and restriction transaction lock serializes Founder and ordinary decisions. The case revision rejects stale screens. Exact retries return the original receipt. A changed request or completed application cannot create a duplicate decision. A later hold or revocation uses the existing safety workflow.

## Validation and CI

Disposable Chromium covers Founder approval and rejection, held and self cases, non-Founder and wrong-workspace denial, stale revisions, exact concurrent retries, the private approval form, badge provenance, and independent eligibility. Existing suites cover ordinary two-reviewer approval, F1.1, gold and protected workflows. All 99 Chromium tests, 51 API tests, client checks, typecheck, lint, both builds, four-language parity, engineering standards and legal integrity checks passed locally. All three GitHub jobs passed for application release `d2cafd64984f91276d02bbf36df91f9c857be3d9`. [Release CI](https://github.com/XJOSCOX/AyiNou/actions/runs/45077791635)

## Documentation and operations

Use the existing Founder sign-in and private Platform administration workspace. The Founder selects **Trust and verification**, opens the pending application and chooses **Review as Founder**. Review the evidence, give a reason, confirm the absence of a conflict and choose approve or reject. [Founder authority and powers](FOUNDER_AUTHORITY_AND_POWERS.md)

## Remaining blockers

Hosted development rollout is complete. The approved migration `20261122182000_founder_direct_blue_verification.sql` applied to `hcbxulyfmdmuyccgrujs`. Postflight verified 89 applied migrations, zero pending, one effective Founder, service-only decision access with audit RLS, and the existing pending blue application, two gold grants and standing policy. The updated local API connected to hosted Supabase and denied anonymous access to the Founder endpoint. No hosted application deployment or hosted verification decision was performed.
