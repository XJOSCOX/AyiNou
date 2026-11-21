# O1 administration, corrections and governance

## Effective baseline

`apps/api/src/routes/admin.ts` checks a live platform role and recent MFA. The Phase 2E `private.platform_admin` check includes an active account, administrator assignment and verified TOTP. Admin actions use the protected account RPC and audit ledger. The last-admin protections cover account actions and removal of the final eligible authenticator. The current startup bootstrap is bound to a configured account ID, the first eligible account and a consumed singleton. Phase 5A still requires reviewed personal verification for ordinary admin promotion. O5 must preserve these behaviors and bring any new dependency into the guard rather than add a second admin system.

## Corrections

- **Self-service:** member selects “Continue as an individual” from the organization wizard. A live subject check and expected version protect the write. Cancel or park a private draft; a completed or protected case routes to assisted resolution. Re-entry remains available later.
- **Assisted:** capture a member-authenticated confirmation or an approved support verification receipt bound to subject, scope and expiry. Expose an admin preview showing coarse dependencies, then allow a recent-MFA admin to submit a reason, explicit confirmation, target revision and idempotency key. Use `GET /api/v1/admin/organization-onboarding/:id/correction-preview` and `POST /api/v1/admin/organization-onboarding/:id/corrections`. An admin never changes the actor’s password, MFA, Auth ID or profile in this transaction.
- **Reject protected cases:** check active/pending ownership or claim decisions, representatives and staff, invitations, participants, organization-owned projects, polls, legal or privacy holds, partner commitments and external obligations. Recheck version and dependencies inside the write under coordinated locks. A blocked case receives a private receipt and separate resolution plan with owner/member consent, eligible independent review, an agreed transfer or closure sequence, and preserved snapshots. A path correction only edits intent and audit, even when a related draft is parked. The member receives a safe in-app notice with a receipt and appeal contact, without evidence or moderator notes.

## Proposed operating model

| Role | Proposed routine authority | Escalation boundary |
| --- | --- | --- |
| Bootstrap founding administrator | Existing account management and applicable moderation; assisted onboarding; routine settings; bounded institution profile correction with owner consent; assigned/unconflicted report triage; nominate reviewers; FV decisions only with delegated scope | No independent badge, ownership transfer, legal authorization, ballot access or privacy evidence from role alone. No self-verification. Existing report decision and reviewer assignment rules continue until specifically revised. |
| Platform Administrator | Scoped platform operations and eligible restrictions; request high-impact actions | Cannot allocate authority to itself or give a custom organization role global power |
| Super Administrator | Proposed governance capability for initiating mode changes, succession and role recovery | No unilateral self-promotion, override of independent review, or unilateral irreversible action |
| Specialized reviewer | Assigned evidence and decision access in a named domain, time-limited where appropriate | Conflict checks at assignment and decision; platform administration alone does not satisfy review |
| Organization manager | Existing owner/foundational/delegated actions on one organization | No platform powers or case access by association |

Add one private governance state row with version and explicit `bootstrap`, `distributed` and time-limited `recovery` modes. Keep mode independent of administrator count. Use named authority grants bound to existing role assignments, effective windows, and revocation and audit history. Transition by recorded proposal, eligible approvals and audited execution. Enroll two independently eligible administrators before distributed mode. No automatic return to bootstrap. Preserve existing continuity until successor acceptance, MFA verification and a tested recovery checkpoint. Backfill no new authority from a badge.

Use separate versioned proposal and distinct-approver records for high-impact changes. Require a second active eligible administrator with recent MFA for permanent admin removal/suspension, high-trust role grant, successor appointment, governance mode change, permanent organization ownership override and lifting a critical emergency restriction. An eligible platform admin can place a narrow, expiring emergency restriction with rationale and notice. Reevaluate conflicts, grants, subject eligibility and proposal digest on execution. A proposer, target or materially interested party cannot satisfy the second approval. Independent legal, verification, privacy and organization approval chains remain required in their own domains.

If a second admin is unavailable, ordinary operations continue and high-impact approvals remain pending. Design a future recovery channel with separately appointed custodians, provider-backed recovery, scoped time limit, second proof and mandatory retrospective review. Avoid shared accounts or broad fallback credentials, preserve last-admin continuity, and require a rehearsal before activation. Irreversible actions need a versioned plan, holds/dependencies recheck and separate approval under the applicable domain. Software roles do not constitute the future nonprofit board or convey corporate signing authority.


## Founder and Administrator roles

The canonical Founder is derived from the existing committed bootstrap receipt and its matching immutable audit event. Eligible Founders receive routine Administrator capabilities under the normal session and MFA rules. Founder issuance remains separately gated and requires formal Founder provenance as well as O3 scope. Founder transfer, new support and program scopes, and O5 execution require distinct governance decisions. Preserve the unused Super Administrator concept for compatibility while review considers formally reserving it. [Founder authority and powers](../governance/FOUNDER_AUTHORITY_AND_POWERS.md) · [Capability matrix](../governance/FOUNDER_CAPABILITY_MATRIX.md)

## O5 administrative corrections and governance

O5 implements member-authorized correction, independent governance proposals and a narrow temporary claim-approval hold. Administrator appointment, suspension, removal, mode changes and operational recovery remain gated pending approved execution and recovery procedures. See [O5 implementation](O5_IMPLEMENTATION_REPORT.md).
