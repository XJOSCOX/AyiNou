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

Disposable tests cover direct Auth signup, current session and workspace, closed and invitation-only modes, signup choices, concurrent and stale updates, referral privacy and Founder bootstrap. Existing individual and organization signup and verification tests continue to exercise confirmed referral attribution. The disposable registration and Founder scenarios passed, as did the existing individual and organization confirmation scenarios, typecheck, lint, engineering standards, legal checks and both production builds. The dependency audit found no vulnerabilities. Full release validation and hosted postflight are recorded at rollout.

## Documentation and operations

The [policy matrix](R2_2_POLICY_MATRIX.md) records defaults, entry points and closure behavior. The [operating notes](R2_2_REGISTRATION_AND_REFERRALS.md) describe Founder controls and referral attribution. Provider mailbox delivery and enforcement configuration remain protected infrastructure settings.

## Remaining blockers

Hosted migration requires exact owner authorization after validated CI and preflight. Development auto-confirmation does not establish real mailbox ownership. Public launch still requires separately verified provider email settings and mailbox delivery.
