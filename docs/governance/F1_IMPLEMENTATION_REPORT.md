# F1 implementation and rollout report

The pending deployment described in this historical report was subsequently completed for F1 and F1.1 on the hosted development database. [Final deployment evidence](../deployment/F1_F1_1_DEVELOPMENT_DEPLOYMENT.md)

## Scope

The reviewed starting baseline was `dff33fadab3964bca06ed87d3f7660aa76e53624`. F1 covers the separately approved development rollout and source changes for a fresh-install Founder setup plus independently approved Administrator appointments.

## Data model and API

The new forward migration `20261121140000_private_privileged_workflows.sql` defines the private Founder workflow, appointment and audit records. The public application routes use service RPCs. See the [Founder guide](F1_FOUNDER_REGISTRATION.md) and [Administrator guide](F1_ADMINISTRATOR_ACTIVATION.md).

## Permissions and audit

Trusted Founder provenance is required to initiate appointments and issue codes. O5 continues to record independent approval. The target must present their own live session, recent authenticator proof and one-time code. Membership, activation, bootstrap, security denials and supported revocations have restricted audit records.

## Privacy and lifecycle

No hosted test records were created. Credentials and private email stay out of operational logs and public profile responses. The setup uses a restricted cookie; activation uses a committed one-time verifier with a 24-hour maximum. The subject and issuer cannot substitute for one another. See [security and authorization](F1_SECURITY_AND_AUTHORIZATION.md).

## Localization and accessibility

Both workflows reuse the themed responsive Auth shell. Inputs have labels, native keyboard controls and status feedback. Haitian Creole, French, English and Spanish include the full workflow copy.

## Reliability and recovery

The shared transaction lock and unique constraints arbitrate concurrent claims. Expired or exhausted setup authorization is recoverable through operator rotation before bootstrap. A schema-only checkpoint was saved outside Git before the hosted change. Its SHA-256 was `047a77301957fce8fc919eaa9768d6bda07e88b3b136ce910b5df4e0032d557b`. The provider reported zero physical backups and PITR disabled. The checkpoint supports schema comparison and forward repair. It does not provide a hosted data restore.

## Validation and CI

The baseline CI passed before rollout. Hosted read-only postflight confirmed record counts, the one intended Founder, private RLS and service RPC grants, username uniqueness, the closed issuance and O4 gates, and zero protected governance executions. The full disposable Chromium suite passed 78 tests. The focused F1 and governance rerun passed six tests, including expiry, revocation, copied and cross-account credentials, concurrent redemption, direct SQL grants, email confirmation, fresh MFA and independent approval. It exercised keyboard navigation and four locales from 320px to desktop. Typecheck, lint, API and client tests, translation parity, engineering standards, both production builds, the npm dependency audit and legal integrity checks also passed locally. CI results for the delivered commit are reported separately.

## Documentation and operations

Exactly the six approved migrations `20261121090000`, `20261121100000`, `20261121110000`, `20261121120000`, `20261121130000`, and `20261121131000` were applied to `hcbxulyfmdmuyccgrujs`. Immediately after the rollout, history showed 74 applied and zero pending. Before and after there were two Auth users, two profiles, three Storage objects, one bootstrap, one Founder case, one regular verification application, one evidence reference and zero Founder Verified grants. There was no reset. A final hosted dry run identified `20261121140000_private_privileged_workflows.sql` as the only pending migration. Its rollout requires separate approval.

## Remaining blockers

The hosted project uses automatic signup confirmation for development. Enable emailed confirmation before using the private Founder registration on a fresh installation. A second eligible approver is required for an Administrator appointment. Review production backup, support and retention arrangements before a public rollout.
