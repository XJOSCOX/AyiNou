# O7 authorization matrix

| Actor | Allowed within the tested scope | Denied outside that scope | Evidence |
| --- | --- | --- | --- |
| Anonymous visitor | Public eligible profile and discovery projections | Private intent, founder cases, corrections, governance, partner attendance and feedback | O7 catalog and anonymous API table |
| Ordinary eligible member | Own intent, ordinary onboarding, explicit draft consent | Other subjects, administrative review, organization owner commands without a grant | O2, O5 and O7 |
| Member awaiting independent identity | Draft and identity application | Organization completion at the API and directly in SQL | O4 and O7 |
| Independently reviewed member | O4 ordinary completion after authority declaration. Existing owner may manage registration | Government creation and claim paths, affiliation escalation, legacy creation | O4 and O7 |
| Synthetic Founder Verified member | Separate consented public designation during the disposable policy fixture | Substitution for O4, high-trust projects or verified poll eligibility | O3 and O4 |
| Current organization owner | Scoped profile, invitation and registration actions. Eligible synthetic partner acceptance with recent MFA | Cross-organization actions and government category changes | O4, O6 and O7 |
| Organization administrator | Existing management, lower-role invitations and eligible pilot feedback | Owner-only acceptance, owner promotion and protected profile fields | Phase 2D/5D and O6 |
| Custom organization role | Existing effective permissions within the organization | Owner privileges and Early Partner enrollment data without an independent eligible role | Phase 5D guards, O6 catalog and scope review |
| Platform administrator | O5 management with current MFA and assignment | Founder and O6 scope absent. High-impact execution closed | O3, O5 and O6 |
| Founder-specific authority | Scope-bound synthetic case command with recent MFA | Self-target and independent verification substitution | O3 |
| Specialized reviewer | Assigned, unconflicted independent decision | Unassigned and stale claims, single-review transfer, active hold | O4, O5 and O7 |
| Proposed Super Administrator | Scope record under controlled fixture in O5 | Execution and recovery even with scoped authority | O5 |
| Suspended or restricted account | Public views where available | Old session's protected actions and restricted organization management | Auth tests and O7 |
| Revoked session | Public views where available | Current resource reads and exact command replay | O2, O3, O6 and O7 |

Run the executable subset with `npm run test:e2e -- organization-integration.spec.ts organization-onboarding.spec.ts organization-setup.spec.ts founder-identity.spec.ts administration-governance.spec.ts early-partners.spec.ts auth.spec.ts`. The catalog assertion checks 19 private tables with RLS and zero application table grants, and 16 scoped SQL RPCs with service-only execution and empty definer search paths. API tests exercise the same HTTP entry points through Fastify, and direct SQL probes cover alternate legacy entry points and publication gates. The institutional invite RPC remains a service trusted command. Fastify verifies the current session before invoking it.

The matrix does not imply that every theoretical cross-product of role and route was run. Older delegated and privacy mechanisms retain separate test suites and case policies. [Integration evidence](O7_INTEGRATION_REPORT.md)
