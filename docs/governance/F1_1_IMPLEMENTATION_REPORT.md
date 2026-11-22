# F1.1 Founder-direct Administrator appointments

## Scope

Starting main revision `14e1f275d8a44bd93afc97c879bd6977a732c0d8`. F1.1 applies the owner-approved rule to the F1 and O5 appointment workflow. Independent reviews, Founder Verified, succession, recovery and S2 keep their existing boundaries.

## Data model and API

`20261121141000_founder_direct_administrator_appointments.sql` follows F1 `20261121140000_private_privileged_workflows.sql`. A constrained authorization mode on the private O5 proposal relation defaults existing rows to independent. New eligible Founder appointments record direct authorization and the written reason in the O5 proposal receipt. No independent approver is assigned. Fastify retains the existing proposal, invitation and activation route contracts and validates the same inputs. Direct O5 cards add authority mode and invitation presence. Direct activation status and redemption evaluate the same authorization rule.

## Permissions and audit

PostgreSQL rechecks trusted active Founder, live session, recent TOTP, target eligibility, exact UUID and governance version. The target supplies their own account, current identity eligibility, recent TOTP, explicit acceptance and the one-time code. Ordinary administrators cannot authorize a direct appointment. Generic O5 approval and proposal-only acceptance reject direct appointments. Role assignment, acceptance, verifier clearing and final audit commit together. The O5 activation receipt links the original decision and the F1 invitation. Legacy approvals and unrelated O5 operations remain independent.

## Privacy and lifecycle

The mode and reasons remain in scoped projections. Only the initiating Founder receives the generated credential at issuance. The raw code stays out of URLs, storage and logs. Existing RLS, grants, expiry, attempt bounds and lifecycle controls remain in force. An unrelated account receives a generic denial. Credential delivery and retention remain operational decisions.

## Localization and accessibility

Platform Governance and private activation reuse existing forms, theme tokens, labels and status regions. Five new lifecycle and audit labels are available in Haitian Creole, French, English and Spanish. The green mark follows the committed active assignment.

## Reliability and recovery

O5 request receipts preserve exact proposal retries. The shared transaction lock, row locks and existing uniqueness arbitrate issuance and redemption. A lost code cannot be recovered. Revoke or withdraw an unused invitation/proposal and authorize a new one where eligible. Failed transitions have no successful assignment or audit receipt.

## Validation and CI

The [disposable F1.1 tests](../../apps/web/e2e/privileged-setup.spec.ts) exercise first and additional appointments, historical authorization, account and session isolation, MFA, concurrent operations and linked audit events. The [O5 suite](../../apps/web/e2e/administration-governance.spec.ts) preserves independent approval, protected execution and last-Administrator controls. The first-Administrator case asserts that the Founder is the only platform leader. An earlier disposable privacy test now removes its temporary Administrator role after checking last-administrator and protected data dependencies. The final full Chromium run passed 79 tests. The seven focused governance tests and two confirmation-off signup tests passed. Typecheck, lint, shared contracts, four-language parity, 50 API tests, client tests, both builds, S1, Legal Center and frozen source checks, and dependency audit passed. Results for the pushed GitHub run are reported with the release.

## Documentation and operations

Read-only history and dry run for Supabase project `hcbxulyfmdmuyccgrujs` confirmed 74 applied migrations and no remote-only revisions. The dry run found F1 `20261121140000` followed by F1.1 `20261121141000` as the only pending migrations. Applying them needs separate approval. Verify compatible app deployment and preserve existing provenance and audit. If containment is needed, pause the appointment surface and use a reviewed forward correction without rewriting old proposals.

## Remaining blockers

Hosted adoption awaits approval, migration and postflight. Operational recovery, private code delivery and retention require separate decisions. Real Founder Verified issuance, Early Partners, legal publication, privacy operations and S2 remain outside this phase.
