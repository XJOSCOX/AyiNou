# C2.3 Controlled project outcome publication

## Scope

C2.3 builds on the C2.2 release at `65e5386a40ea0f5c308768873d81cee0287450a4`. A current independent finding can be proposed for disclosure by its authorized organizer. The proposal must relate to an eligible public project in exactly one of Haiti’s ten departments. C2.3 reuses native individual, organization, and community ownership and geography. Earlier project approval and Community Needs association records keep their existing meaning and privacy.

## Data model and API

Seven private RLS tables store the empty fixture gate, reviewer grants, short-lived workspaces, publication states, append-only snapshots, audit events, and recusals. The service-only command RPC records the exact source basis, finding, project and disclosure revision, and digest. The public project progress projection returns only approved disclosure fields. A quantity of zero is displayed as zero. Qualitative or unavailable quantities are marked unavailable. C2.3 leaves original targets out because the native metric target is not part of the independently reviewed C2.2 result.

## Permissions and audit

Founder appointments require verified eligibility and an expiry. A case coordinator can assign, release or suppress within scope. The reviewer must hold the separate departmental grant, present current identity and recent MFA, use the originating private workspace, accept a conflict-free assignment, and inspect the exact candidate before deciding. The organizer, native project or evidence participants, recused reviewers, and challenged publication’s rejector are excluded where applicable. Publication actions commit their audit receipt together with the state change. Inspection records the version and workspace. The decision must use that same workspace.

## Privacy and lifecycle

The consent digest binds the exact preview and authoritative fields. The organizer enters a title, summary and limitations. The authorized independent reviewer checks that the complete text is faithful and safe. Public reads expose no identifiers, names, source links, digests, private deliberations, or history routes. Failed eligibility, source and consent checks suppress whole disclosures. A material correction requires a new snapshot and approval. Withdrawal preserves the private history. A challenged rejection can be reviewed once within 14 days by a different independent reviewer. The existing account deletion and retention rules apply to the relationship keys. Live activation requires an explicit retention and export/erasure policy for publication records and audit reasons, including legal holds and safe author explanations.

## Localization and accessibility

The organizer, reviewer, and public result screens use Haitian Creole, French, English, and Spanish. Responsive layouts use native form labels, keyboard-operable disclosures, and explicit confirmations. Public results have a result-level assurance label and a short explanation of the finding class, including insufficient evidence.

## Reliability and recovery

Publication commands serialize with C2.2 decisions, lock the relevant project and session, check expected versions, and keep idempotent receipts. API responses are private and no-store. A visible disclosure is rechecked while the page stays open and cleared when the document is hidden or navigation restores it. A failed live read clears the client display. Previously viewed information may already have been copied by a viewer. Recover a suppressed release through an eligible and newly approved disclosure. Keep database changes forward-only after deployment.

## Validation and CI

The C2.3 disposable suite covers closed gates, consent matching, recent MFA and original workspace checks, departmental scope, evidence-review conflicts, current preview requirements, result redaction, zero quantity, withdrawal, corrected republication, project visibility invalidation, appeal independence, and revoked evidence. Workspace type checks, lint, standards, shared contracts, 57 API tests, web unit tests, the HTTPS-origin production build, and the localhost build passed. The final disposable regression ran seven tests spanning C2.1, C2.2, C2.3, Project Progress and Project Work, all passing. A separate regression run passed the C1 publication and project association scenarios for all ten departments. The package audit reported zero vulnerabilities. The first full CI run reproduced the C2.2 baseline Founder setup smoke failure caused by unrelated synthetic administrators in the shared test database. The test now verifies the exact new administrator identities against its starting roster. The change is limited to the disposable test assertion.

## Documentation and operations

The rollout applies only the separately approved SQL file after the target, checksum, migration history, single-file dry run, preservation snapshots, and inactive gates are verified. A local browser or API connected to hosted Supabase verifies compatibility. It does not establish hosted Next.js or Fastify deployment.

The read-only baseline on AyiNou `hcbxulyfmdmuyccgrujs` found 140 applied migrations and only `20261125123000_c23_controlled_outcome_publication.sql` pending. The file SHA-256 was `70f9f00669ae0e41bc556fb51ad071d79a54748badcf5da93c8cf3746ba656c7`. The baseline captured 71 record fingerprints, 275 existing relations, 792 existing routines, 29 RLS policies, and 132 existing triggers. C2.1 and C2.2 fixture gates and the Community Needs fixture gates were empty.

The rebuilt connected local API and web passed 34 checks covering health, public Projects and Community reads, restricted routes, and all three closed C2 states. An authenticated browser check as J0SC0X reached Outcome publication through Outcome evidence review and showed the unavailable state without case or reviewer controls.

## Remaining blockers

Exact hosted migration approval and verified deployment are required by the repository workflow. Live review, intake, and publication remain disabled. Operational owners must establish staffing, privacy and support readiness before a separately authorized launch.
