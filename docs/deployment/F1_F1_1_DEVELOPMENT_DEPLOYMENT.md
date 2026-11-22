# F1 and F1.1 hosted development deployment

**COMPLETE AND DEPLOYED — hosted development database.** The approved target was Supabase project `hcbxulyfmdmuyccgrujs`. Its CLI environment label is production. The owner designates it as the development project. The rollout used the tested application and SQL revision `e77913b4f4ab8b2053167ffe9fc9698f134ea7e4`, which passed [all three release CI jobs](https://github.com/XJOSCOX/AyiNou/actions/runs/44992271656).

## Migration evidence

Preflight matched the exact project, Git main, local SQL and CI release. History showed 74 applied migrations, zero remote-only versions, and exactly the two approved pending versions. The fresh dry run repeated the same result immediately before deployment. Both migrations were applied in this order.

1. `20261121140000_private_privileged_workflows.sql`
2. `20261121141000_founder_direct_administrator_appointments.sql`

The final read-only history showed **76 applied, zero pending and zero remote-only versions**. The final dry run confirmed the database was up to date.

## Hosted postflight

- Verified RLS on the three private F1 tables and the O5 proposal table, with no direct table access for application roles. Compared ten installed function bodies and execute grants to the reviewed source, including the Founder predicate, the O5 wrapper and command, both F1 setup functions, and F1.1 appointment state and redemption. The commands retain service-only execution, protected search paths and private helpers.
- Confirmed a single trusted Founder, `j0sc0x`, backed by the matching bootstrap audit and verified TOTP. The hosted platform-access RPC projected Founder and Administrator authority. The Founder enrollment status RPC returned false, and the local private setup route rendered unavailable against hosted development.
- Confirmed the Founder-direct constraint, unchanged legacy mode, and the effective installed function definitions for account binding, recent MFA, receipt checks and atomic one-time redemption. Hosted F1 setup, invitation and event tables remained empty. No hosted invitation, test user or role grant was created.
- Confirmed the ordinary decision wrappers still reach the distinct, assigned and unconflicted two-reviewer rule. Read-only checks confirmed the Founder Verified, O4 parity, Early Partner and legal gates remained closed and synthetic privacy allowlists remained empty.
- Matched eleven pre/post aggregate fingerprints including two Auth accounts, two profiles and handles, the Founder reservation, role assignments, existing verification records and applications, platform and domain audit history, and three Storage objects. No reset, account deletion or Auth settings change occurred.

## Application compatibility and release boundary

Read-only PostgREST calls proved the matching local Fastify code could read the upgraded hosted database. The running local Next.js routes rendered generic unavailable states with no-store responses for both private URLs. The corresponding API endpoints returned private no-store 404 responses. Stateful first-Administrator issuance and redemption, cross-account denial, MFA, concurrency, Founder suspension and legacy approvals were tested in disposable Supabase. No hosted Fastify or Next.js application deployment was performed. The rollout does not authorize a public launch, restricted feature activation or S2A.

See the [F1.1 implementation and regression report](../governance/F1_1_IMPLEMENTATION_REPORT.md) and the [hosted development workflow](HOSTED_DEVELOPMENT_WORKFLOW.md).
