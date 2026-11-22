# S2C implementation report

## Scope

Private entry for Platform Administration and independent Verification Review. The first administration implementation is `fb2472865080cf2528e6df4daafc2d8bdf2afb3a`. S2C extends it on main to anonymous 404s, explicit workspace cancellation and separate reviewer scope. [Private routes](S2C_PRIVATE_ADMINISTRATION_ROUTES.md)

## Data model and API

`20261121144000_admin_workspace_session_link.sql` introduces the S2B administration kind and `20261121144100_s2c_scoped_workspaces.sql` adds reviewer scope and versioned cancellation. Both reuse the existing S2B private tables and service-only RPC signature. Existing F1 paths and public page routes remain compatible.

## Permissions and audit

Owner, exact live session, recent verified MFA and current domain authority are checked before private content renders. Explicit closure records a versioned receipt with assurance time in the existing restricted ledger. Domain authorization for evidence, Foundation roles, independent approvals and governance remains separate. [Workspace rules](S2C_WORKSPACE_AUTHORIZATION.md)

## Privacy and lifecycle

The browser address contains only a random locator and fixed step. The database keeps subject and originating session in its existing private row. No new device identifiers or private content are collected. Existing S2B retention and cascading lifecycle apply.

## Localization and accessibility

English, Haitian Creole, French and Spanish use the existing theme and member shell. Entry and close are labeled controls with keyboard and status support. Unauthorized requests receive a generic accessible not-found view.

## Reliability and recovery

The owner transaction lock serializes open and close. Valid references are reused and cannot extend their original deadline. Reopen through the fixed entry when a reference expires or has been cancelled. Rollout uses additive migrations and preserved receipts.

## Validation and CI

Disposable Playwright covers Founder and Administrator entry, review assignment, copied links, concurrent creation, cancellation and role loss. S2A, S2B and F1 authorization regressions run on the existing disposable stack.

## Documentation and operations

Hosted development project `hcbxulyfmdmuyccgrujs` had 78 applied migrations before S2C. The final ordered development rollout requires the exact approved migration set and a passing release CI. Use the [deployment procedure](../deployment/HOSTED_DEVELOPMENT_WORKFLOW.md).

## Remaining blockers

Hosted activation depends on approval and postflight of the exact S2C migration set. Domain-specific moderated queues remain separately scoped and the protected privacy, recovery, legal publication and restricted program gates remain closed.
