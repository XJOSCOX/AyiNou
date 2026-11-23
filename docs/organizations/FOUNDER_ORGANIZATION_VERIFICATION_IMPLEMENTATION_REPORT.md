# Founder review of ordinary organizations

## Scope

The recognized Founder can see pending ordinary organization applications in Trust and verification, including applications submitted for their own organization. They may assign the request to independently eligible reviewers or directly approve or reject it.

## Data model and API

A forward migration extends the existing assignment queue and Founder decision RPC. The existing private administration evidence and decision endpoints use the same request contract. The optional queue field canRelease controls whether reviewer assignments can be removed.

## Permissions and audit

A direct decision requires trusted Founder provenance, an active account, the original private administration session, recent MFA, written reason, and current application revision. The Founder can delegate a conflicted ordinary organization case to an eligible, unconflicted reviewer. Removing reviewers on conflicted cases remains prohibited. Government, claims, representative and personal conflict rules remain in their existing paths. Approval and rejection record distinct Founder events in the institution audit ledger and existing unified audit projection. Direct approval creates no independent vote.

## Privacy and lifecycle

The assignment summary shows organization and applicant context within existing administrative access. Evidence remains in the private Founder review and assigned reviewer workspaces. Public verification is updated with the approval, and no evidence or reason is placed in public responses. Independent project eligibility excludes Founder-direct organization decisions.

## Localization and accessibility

All four languages identify organization approval, evidence review and the acknowledgment. Existing keyboard-accessible controls and private workspace recovery are reused.

## Reliability and recovery

The command locks the organization and application using the existing review lock. It verifies current ownership, unchanged institutional details, and two reference domains. The existing Founder direct verification switch also controls the organization decision. A retry with the same decision returns the original receipt. A new decision and its audit event commit together. A forward migration can remove the extra permission while preserving decisions and receipts.

## Validation and CI

Disposable Supabase and Chromium exercise the Founder acting on an owned organization, review delegation, government exclusion, ordinary Administrator denial, workspace isolation, stale revisions, concurrent replay, audit attribution, public badge state, and existing personal and organization review.

## Documentation and operations

The existing Founder administration path is Members → Trust and verification → Application assignments → Review as Founder. Deploy the reviewed migration after verifying the hosted project and the exact dry run. Check the target and catalog without making a real verification decision.

## Remaining blockers

A pending request still requires an explicit decision. Independent project eligibility continues to require independent organization verification.
