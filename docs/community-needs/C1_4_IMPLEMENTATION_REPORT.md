# C1.4 Connect Reviewed Community Needs to Projects

## Scope

Eligible project organizers can select an already-published, currently supported community need while preparing a new draft or request an association from an existing project. Saving a new project carries the selected need into the proposal page for separate confirmation. It does not submit either workflow automatically. Project ownership, submission, independent project review, publication, work, tasks, volunteering, and budgets use their existing paths.

## Data model and API

The [migration](../../supabase/migrations/20261124155300_c14_need_project_links.sql) adds a closed fixture, scoped association records, append-only events, and a private in-app notification reference. Each association pins the project content revision, initial project version, approved need snapshot, author, organizer, and originating authority. Changes to the project itself remain native project mutations. The [private API](../../apps/api/src/routes/need-project-links.ts) uses the existing authenticated session and staff workspace verification, no-store responses, and private catalog projections.

The project detail shows association status for an organizer and safe references for other authorized viewers. The Community Needs detail shows currently visible native project listings. The needs workspace lets authors grant or decline consent, withdraw it, and inspect safe history. Staff work in the existing administration or verification review workspace.

## Permissions and audit

- The organizer must be an eligible project owner or representative with native identity and submission or proposal authority and live membership in the need’s originating community. A scoped project must match that community. Existing project creation restrictions apply.
- The author must be a different active member of the originating community and explicitly consent on the exact requested versions. Author consent exposes the organizer’s purpose statement for the association. Identifying details of unpublished projects are omitted unless the author already has native project access.
- An assigned independent reviewer needs a live community review grant, recent MFA, and their original verification workspace. The reviewer checks the pinned project objectives and approved need summary and records a written rationale. Organizers, authors, need evidence and publication reviewers, conflicted project owners, project reviewers, representatives, and active project team members are excluded. Founder and administrators can assign eligible reviewers.
- PostgreSQL rechecks eligibility and versions on reads and writes. Projection rules also apply current membership and block checks. RLS protects all three new private relations. The backend gets execution on one service-only RPC.
- Creation, consent, assignment, decision, activation, withdrawal and revocation append scoped events with the mutation. The ledger retains the request receipt and role context. Private notices are bound to the author and organizer and open their authorized association workspace. The notification preview contains no unpublished project information, private case ID, evidence or written rationale.

## Privacy and lifecycle

Publication or approval never widens the other resource’s audience. Author, organizer, reviewer and community-member projections are purpose-specific. The public Projects route gains no association field. An optional organizer-supplied summary is checked for common identifying patterns and is restricted to association participants. It remains the organizer’s responsibility to describe the relationship without private details.

The published need only shows native publicly viewable projects. A private project owner may see their own approved association when they still qualify to read the linked need. Project unpublication, restriction, rejection, deletion and fragment changes to the approved need snapshot revoke applicable associations. The native lifecycle triggers preserve existing records and append events. A new request needs fresh consent and approval. Losing account or community eligibility immediately removes the reference from protected reads. No Feed post is created.

## Localization and accessibility

Haitian Creole, French, English and Spanish cover status, requests, consent, notices, and review controls. The interface uses the existing room, Projects, theme tokens, keyboard controls, confirmations and error messages. The optional need selection leaves creation and confirmation as distinct steps.

## Reliability and recovery

Commands bind an idempotency receipt to actor, target and payload, with an expected revision. One live association is permitted per project and publication pair. Locks protect shared evidence ordering and the native project revision. Duplicate commands reuse the committed receipt. If no eligible reviewer is available the request remains pending. A forward repair can pause or correct the workflow while preserving protected events, decisions and linked version receipts.

## Validation and CI

The [C1.4 browser and PostgreSQL test](../../apps/web/e2e/need-project-links.spec.ts) uses disposable data for approvals, permissions and revocation. Local standards, contracts and production builds are part of the release checks. Hosted application verification uses read-only paths and existing sessions.

## Documentation and operations

The C1.4 fixture is closed by default and also requires the C1.1–C1.3 gates. The API synthetic switch accepts only the designated disposable loopback backend outside production. The schema rollout target is AyiNou project `hcbxulyfmdmuyccgrujs`. The application release procedure is separate.

## Remaining blockers

A real pilot remains separately gated. Confirm the operating roster, moderation and support responsibilities, access recertification, privacy purpose, retention for proposals and association ledgers, export and erasure handling, and legal holds. Independent outcome certification remains outside C1.4. [Roadmap](../../ROADMAP.md) · [Audit coverage](../standards/AUDIT_COVERAGE_MATRIX.md)
