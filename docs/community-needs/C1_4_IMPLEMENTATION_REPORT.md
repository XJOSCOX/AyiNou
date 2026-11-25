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

Publication or approval never widens the other resource’s audience. Author, organizer, reviewer and community-member projections are purpose-specific. The public Projects route gains no association field. The required organizer purpose is checked for common identifying patterns and is restricted to association participants. It remains the organizer’s responsibility to describe the relationship without private details.

The published need only shows native publicly viewable projects. A private project owner may see their own approved association when they still qualify to read the linked need. Project unpublication, restriction, rejection, deletion and changes to the approved need snapshot revoke applicable associations. The native lifecycle triggers preserve existing records and append events. A new request needs fresh consent and approval. Losing account or community eligibility immediately removes the reference from protected reads. No Feed post is created.

## Localization and accessibility

Haitian Creole, French, English and Spanish cover status, requests, consent, notices, and review controls. The interface uses the existing room, Projects, theme tokens, keyboard controls, confirmations and error messages. The optional need selection leaves creation and confirmation as distinct steps.

## Reliability and recovery

Commands bind an idempotency receipt to actor, target and payload, with an expected revision. One live association is permitted per project and publication pair. Locks protect shared evidence ordering and the native project revision. Duplicate commands reuse the committed receipt. If no eligible reviewer is available the request remains pending. A forward repair can pause or correct the workflow while preserving protected events, decisions and linked version receipts.

## Validation and CI

Type checking, lint, the loopback build, and the HTTPS production build passed. All 64 unit and API tests passed. The shared-contract, API route, Spanish catalog, and engineering-standard checks passed.

Eight browser tests ran against disposable Supabase. The [C1.4 test](../../apps/web/e2e/need-project-links.spec.ts) checked the native draft flow, separate consent, reviewer eligibility and conflicts, concurrent decisions, visibility to project and community readers, private notifications, and revocation after withdrawal or lifecycle changes. It exercised English, Haitian Creole, French and Spanish at desktop and narrow mobile widths. The other seven covered C1.1–C1.3, Ouest navigation, project work and moderation. Synthetic records were confined to the disposable database.

## Hosted rollout

On November 24, 2026 (America/Chicago), AyiNou project `hcbxulyfmdmuyccgrujs` received only `20261124155300_c14_need_project_links.sql` from tested commit `6c7bca5a4671daa645cdb399e5b871d28be8e7bc`. The working file and staged Git blob matched SHA-256 `edfc8522e98e0faae8fa3ed1abd2c4e596098f7a86e962a095e65e11037ba9e9`.

| Check | Verified result |
| --- | --- |
| Preflight | Confirmed the linked AyiNou project, 133 prior migrations including C1.1–C1.3, and one pending migration. The final dry run listed the exact C1.4 file with no seeds or roles. |
| Migration history | All 133 prior entries matched. The installed C1.4 migration brings the total to 134. A fresh dry run reported zero pending migrations. |
| Record preservation | All 51 read-only count and fingerprint pairs matched, including existing accounts and eligibility, communities and memberships, needs, cases, publication history, moderation, sanctions, appeals, Founder policies, projects, notifications and audit. The existing `community_need_submit` capability matched. |
| Catalog preservation | All 253 prior relation ACL/RLS entries, 29 policies and 127 triggers matched. Of 733 prior routine definitions, 732 matched. The existing notification visibility routine gained a branch for the new notice kind with unchanged grants and execution context. Four new triggers implement scoped invalidation and private notices. |
| Authorization | All three C1.4 tables have RLS and zero effective direct table or column grants for anonymous, authenticated, authenticator and service roles. The scoped API RPC grants execute to `service_role` only outside ownership, uses an empty search path, and binds reads and writes to session, workspace, role and resource. All nine helper routines retain owner-only execution. |
| Activation | All four C1.1–C1.4 fixture gates are empty. There are zero C1.4 associations, history events or notices. No real intake, independent need review, publication, or association requests are enabled. |

## Connected application

The matching local Fastify and stable Next.js builds were restarted on loopback against the verified hosted database. The 25 read-only HTTP probes confirmed health, public communities and Projects reads, login redirects for protected guest pages, and unauthorized guest membership and moderation reads. Six association reads returned the expected disabled status with private, no-store and noindex headers. Intake, evidence review and publication returned their respective disabled statuses.

In the local browser after the rollout, Test02 saw closed intake and an unavailable association workspace. Ouest showed the account's existing joined status and the Discussion and Members tabs worked. Projects, Manage proposals and Project work were present. J0SC0X used the existing authenticator flow and saw the same closed intake and unavailable association workspace. The authenticated Platform Administration and Moderation overview opened. The browser checks made no hosted Community Needs submissions or review decisions. The enabled workflow and denial paths were exercised on disposable data.

Hosted application release remains separate. The repository and deployment evidence did not identify an approved matching web/API target and release procedure. The database rollout was completed independently of that release.

## Documentation and operations

The API synthetic switch accepts only the designated disposable loopback backend outside production. C1.4 also requires the C1.1–C1.3 gates. Existing Founders and administrators retain reviewer assignment authority subject to the scoped rules of the association.

## Remaining blockers

A real pilot remains separately gated. Confirm the operating roster, moderation and support responsibilities, access recertification, privacy purpose, retention for proposals and association ledgers, export and erasure handling, and legal holds. Independent outcome certification remains outside C1.4. [Roadmap](../../ROADMAP.md) · [Audit coverage](../standards/AUDIT_COVERAGE_MATRIX.md)
