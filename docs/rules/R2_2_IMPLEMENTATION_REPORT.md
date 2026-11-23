# R2.2 implementation report

## Scope

Registration policy, existing referral integration and the Founder-only Registration panel. Registration invites create a personal account and remain separate from organization or community invitations. Referral rewards are disabled.

## Data model and API

Migration `20261122184000_r22_registration_referrals.sql` adds a typed versioned policy, a private policy event ledger and expiring signup invitations. It also installs a PostgreSQL trigger on `auth.users` and extends existing referral functions. The public GET policy route returns signup UI flags and uses a separate cross-instance read budget from discovery. Private GET/PATCH read and update the registry. The private invitation POST creates a receipt.

## Permissions and audit

Fastify and PostgreSQL independently enforce trusted Founder authority, a current MFA session and the original workspace. The database serializes the policy revision and auth inserts. Policy changes atomically create old/new audit events. Invitation creation and consumption are recorded in the private lifecycle row. Both private routines and the safe public policy projection RPC use restricted grants.

## Privacy and lifecycle

Trigger-based redaction removes raw invitations and Founder signup proofs from Auth user and identity metadata before persistence. Only invitation and recipient digests are stored with the private receipt. No signup credential or private referred-account details appear in the public response. Historical referral attribution is retained and can be read by the account through the existing aggregate. Existing privacy deletion plans continue to inventory Auth references; set any future retention or purge policy through the applicable audited lifecycle.

## Localization and accessibility

All four supported locales cover unavailable signup, the invitation field, the Founder settings and paused sharing. Native labeled inputs, responsive layouts and existing theme variables remain in place.

## Reliability and recovery

The single policy row locks before account creation or policy mutation, so direct provider calls cannot bypass the gate. Disabling signup preserves existing access. A failed signup cannot consume its invitation or create a referral receipt. Audited revisions can restore earlier settings. Schema rollback requires a separate forward migration.

## Validation and CI

Disposable tests cover direct Auth signup, current session and workspace, closed and invitation-only modes, signup choices, concurrent and stale updates, referral privacy and Founder bootstrap. Existing individual and organization signup and verification tests continue to exercise confirmed referral attribution. The disposable registration and Founder scenarios passed, as did the existing individual and organization confirmation scenarios, typecheck, lint, engineering standards, legal checks and both production builds. The dependency audit found no vulnerabilities. Release `259c15a631aeda38d141332cd32a8dd87020003f` passed all 102 local Chromium tests, both dedicated development immediate-signup tests, typecheck and lint. GitHub is used to publish the release. The owner directed the rollout to use validated local results as the deployment gate.

## Documentation and operations

The [policy matrix](R2_2_POLICY_MATRIX.md) records defaults, entry points and closure behavior. The [operating notes](R2_2_REGISTRATION_AND_REFERRALS.md) describe Founder controls and referral attribution. Provider mailbox delivery and enforcement configuration remain protected infrastructure settings.

## Remaining blockers

The approved migration was applied to hosted development project `hcbxulyfmdmuyccgrujs` after the dry run found exactly one pending migration and no seeds or role changes. The applied file had SHA-256 `99087e3b3cecd117a4e6c39534998eaa3488e39eafae2dd18e58086af1b0a5c7`. Postflight confirmed 91 applied migrations, zero pending, revision 1 with both signup paths ON, three RLS-protected relations, zero direct table grants, two service-only policy RPCs and the expected Auth triggers.

The restarted local API returned the uncached public policy. The local registration page and R2.1 statistics endpoint responded successfully, and the private registration endpoint denied an anonymous request. Closed mode, invitation redemption and eligibility-changing tests ran in disposable Supabase. Hosted policy defaults were preserved during verification.

Public launch still requires separately verified provider email settings and mailbox delivery. Development auto-confirmation does not establish real mailbox ownership.
