# Founder Verified identity eligibility

## Scope

Members can use current Founder Verified identity to submit a proposal they personally own. The recognized platform Founder also qualifies for their own proposal with active account standing and a verified authenticator. Proposal reviewers still apply the existing assignment and conflict rules. The follow-up migration treats eligible Founder Verified members as identity-verified for organization setup, proposals, project execution, verified polls, ambassador eligibility and governance prerequisites. Each workflow still evaluates its own approvals and authority. Independent identity review remains available.

## Data model and API

[The migration](../../supabase/migrations/20261123135000_founder_verified_individual_proposals.sql) adds a private identity-review route to applications and classifies prior Founder-direct approvals using recorded audit events. The partial indexes keep one open personal application per kind and distinguish the prior Founder-direct approval from a later independent decision. [The parity migration](../../supabase/migrations/20261123136000_founder_verified_identity_parity.sql) adds a shared private identity predicate and updates the existing eligibility functions. Existing endpoint paths and grants remain in place. The proposal options and member verification workspace add optional fields for the two form contexts.

## Permissions and audit

PostgreSQL checks live provenance and scope on individual proposal submission, approval and publication reads. Approval still requires an assigned and unconflicted reviewer with recent MFA. Execution, publication, governance and organization actions still require their existing role, resource and review checks. An independent application from a gold member goes through the existing two-reviewer workflow. The Founder-direct command cannot close it. The existing project and identity event ledgers record requests and decisions in the same transactions.

## Privacy and lifecycle

An independent application uses the existing restricted evidence store, evidence access rules and retention lifecycle. No extra evidence is stored, and the public badge projection keeps its existing consent rules. Held or revoked independent identity cannot fall back to gold for proposals. An active identity hold also blocks approval of a separate independent request. A later gold grant leaves that independent request open.

## Localization and accessibility

The verification form explains the independent-review path in Haitian Creole, English, French and Spanish. The existing label, form and status semantics still apply. The proposal form reads eligibility for its selected owner type.

## Reliability and recovery

Proposal commits acquire the trust lock before locking the project and retain the original optimistic version and reviewer checks. Verification intake keeps the existing shared advisory lock and duplicate protections. Restore behavior through a forward correction that preserves proposal, application and decision history.

## Validation and CI

See the [Founder browser and API scenarios](../../apps/web/e2e/founder-identity.spec.ts), [personal request tests](../../apps/web/e2e/personal-verification-requests.spec.ts) and [project privacy tests](../../apps/web/e2e/privacy.spec.ts). Hosted application hosting and CI results are tracked separately from database validation.

## Documentation and operations

The [eligibility matrix](FOUNDER_VERIFIED_IDENTITY_ELIGIBILITY.md) records the updated scope. The rollout targets AyiNou project `hcbxulyfmdmuyccgrujs` and migrations `20261123135000` and `20261123136000`. Follow the [hosted development procedure](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md) for rollout and recovery.

## Hosted validation

All 26 targeted browser regression tests passed. Type checking, web lint, translation parity, and engineering standards checks passed.

Both approved migrations are recorded on hosted AyiNou. The hosted checks returned two proposals and seven verification applications, matching the preflight counts. One historical application was classified as Founder-direct. Authenticated clients cannot execute the private identity helper directly.

The connected local app displayed Submit for review for test02’s Founder Verified account. A subsequent read-only hosted check confirmed that Lakou Reading Labs is submitted. The hosted web app was not redeployed.

## Projects interface follow-up

The directory, proposal management, review queue, new proposal form, detail page, and project work screens use consistent navigation and loading states. The Back control returns to an AyiNou history entry when available and otherwise links to a related route. Workspace tabs write their selection to browser history without additional work reads. The work overview shows the execution state and guides eligible owners or delegates to Management to start an approved project. Starting work and setting directory visibility are separate operations.

Eligible reviewers can start their own review from the queue, view the full proposal, and choose an approval decision. Assignment, recent MFA, conflict checks, and auditing still use the existing server operations. Approved proposals without a publication request show their private status to the owner. The connected app showed that state for Lakou Reading Labs and listed it in Project work. The interface update uses existing data and requires no database migration.

## Founder-owned review follow-up

The recognized Founder can route their own individual submission to an eligible independent reviewer or directly approve it with a written reason. The option applies when the Founder owns, created, and submitted the proposal. Both actions use recent TOTP, the existing review RPC, and the current proposal version. Only direct Founder assignment and approval events carry the new private audit flag. The report queue and the independent reviewer predicate retain their existing scope. Direct approval still rechecks the submitting account, associated community membership, and identity. Public listing continues to depend on the owner's publication choice and listing eligibility.

The [disposable browser scenario](../../apps/web/e2e/founder-identity.spec.ts) exercised both choices, stale versions, self-assignment denials, an unassigned administrator, a verified ordinary owner, and the stored Founder audit flag. Migration `20261123137000_founder_own_project_review` was applied on hosted AyiNou. A subsequent dry run found no pending migrations. The two project rows and eight historical events matched the preflight snapshots after accounting for the new default flag. The connected local browser showed both controls for Centre Digital Skills Workshops, which remained submitted.

## Proposal revisions and publication

Editing approved content creates a private revision. The canonical approval continues to supply the public directory, media, project work and associated workflows during review. An authorized owner or assigned independent reviewer reads the pending revision through the existing project detail boundary. Revision submission and review reuse current authorization and optimistic version checks. Approval promotes the candidate to the canonical revision and requires the owner to confirm publication of the new content.

The owner can list an unchanged approved proposal or remove it from the directory. The confirmation describes what the directory will disclose. The authenticated publication endpoint rechecks owner submission authority, directory eligibility and the current version, and records the operation in the project ledger. The migration carries forward existing approved publication choices. Pending revisions and evidence use the existing private storage and retention boundaries. Rollback should preserve the canonical revision, pending history and audit events. When a revised proposal is approved, the new revision stays private until the owner confirms its publication. The old listing is removed at promotion.

Migration `20261123138000_project_reapproval_and_publication` was applied to hosted AyiNou. Both project records and all nine historical project events matched the preflight snapshots after excluding the new columns. The existing directory listing choice was preserved, and a follow-up dry run found no pending migrations. The disposable regression exercised publish, unpublish, amendment privacy, reapproval, and republishing. The connected local app confirmed the edit warning and publication controls on the existing approved proposal.

## Projects directory and verification display

The directory uses full-width project links with compact filters and thumbnails from existing covers. Project reads return identity badges only when existing profile audience and disclosure checks allow them. The migration changes the read projection and adds no new records, permissions, or audit events.

Migration `20261124143000_project_owner_badges` is recorded on hosted AyiNou. The follow-up dry run found no pending migrations. The inventory fingerprint, five project records, and one directory listing matched the preflight results. The connected local directory showed the gold Founder Verified badge beside the owner of Lakou Reading Labs.

## Review previews

Eligible reviewers with recent authenticator verification can open a read-only preview from the review queue before any assignment. The preview serves the submitted revision and its cover through dedicated guarded reads. Drafts and restricted proposals are excluded. Existing review decisions and the public directory continue to use their own access rules and revision views. Previewing creates no assignment, status change, or review event.

The disposable browser test opened the submitted description and cover before assignment. It also verified anonymous and conflicted denials and kept a pending amendment separate from the public revision. Hosted AyiNou recorded migration `20261124144000_project_review_preview` with no remaining migrations. The proposal inventory fingerprint and publication count matched preflight. The connected local app denied the reviewer preview for the proposal owner and displayed the submitted proposal through their usual owner view.

## Approving from the preview

Approval controls appear below the submitted proposal. After recent MFA and reviewer checks, the preview returns a signed proof tied to the current proposal version, revision, actor and session. The approval command verifies it under the existing proposal lock. A reassignment or edit requires a fresh preview. The private signing key carries no member information, and the application stores no preview history. Approval still records its versioned decision event.

The disposable browser test approved both Founder-owned and assigned submissions from the preview. API tests rejected missing, forged, stale, and other-reviewer proof. Hosted AyiNou recorded migration `20261124145000_project_approval_requires_preview`. The dry run found no pending migrations, and the proposal inventory fingerprint and listing count matched preflight.

## Publication badges in proposal management

Manage proposals shows the review status of the working revision and the directory listing status of the canonical version. When a revision is pending, the earlier public version is identified explicitly. The browser regression verified private approval, publication, unpublishing and a public version with a pending revision. The connected app displayed the Published and Rejected icons on existing proposals.

Hosted AyiNou recorded migration `20261124146000_project_management_publication_status`. The proposal inventory and two existing listing flags matched preflight, and the final dry run found no pending migrations.

## Remaining blockers

The hosted database changes are live. The hosted web application deployment and release CI are separate from verification against the connected local web application.
