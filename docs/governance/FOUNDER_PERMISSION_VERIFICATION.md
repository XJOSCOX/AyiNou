# Founder permission verification

The matrix assumes active enrolled test accounts with recent MFA and only the role shown. The Founder fixture has committed bootstrap provenance and no administrator assignment. The independent reviewer has a reviewer assignment and no platform role. Tests run only against disposable Supabase.

| Surface or operation | Founder | Administrator | Moderator | Independent reviewer | Ordinary member |
| --- | --- | --- | --- | --- | --- |
| Admin overview, accounts, audit, safety, legal workspace and onboarding corrections | Allow | Allow | Deny | Deny | Deny |
| Governance view and eligible routine proposals | Allow | Allow | Deny | Deny | Deny |
| Protected governance execution, role reassignment and recovery | Closed | Closed | Deny | Deny | Deny |
| Eligible feed and project moderation | Allow | Allow | Allow | Deny | Deny |
| Ordinary verification queue | Separate assignment | Separate assignment | Separate assignment | Allow | Deny |
| Ordinary case evidence | Eligible assigned work | Eligible assigned work | Eligible assigned work | Eligible assigned work | Own authorized records only |
| Ordinary verification vote | One eligible vote after assignment | Same | Same if assigned | One eligible vote after assignment | Deny |
| Open Founder consent or contain a case | Separate active Founder Identity scope | Separate active Founder Identity scope | Deny | Deny without scoped administrative access | Own consent only |
| Grant or release Founder Verified | Formal Founder, active scope and proof. Issuance closed | Deny | Deny | Deny | Deny |
| Restricted privacy queue | Disabled | Disabled | Disabled | Disabled | Disabled |
| Early Partners administration | Separate operator assignment | Separate operator assignment | Deny | Deny | Deny |
| Raw private ballots | Deny | Deny | Deny | Deny | Deny |
| Direct writes to protected bootstrap or proof storage | Deny | Deny | Deny | Deny | Deny |

[Executable five-role comparison](../../apps/web/e2e/founder-release-audit.spec.ts) checks HTTP and SQL, current MFA, roster deduplication, lifecycle dependencies, scoped evidence and the absence of the retired closure trigger. [Founder identity regressions](../../apps/web/e2e/founder-identity.spec.ts) cover delegated consent opening, grant denial for a scoped ordinary administrator, Founder self-review denial, reviewer assignment, distinct votes, proof, public designation, holds and revocations. [Founder bootstrap](../../apps/web/e2e/founder-bootstrap.spec.ts) covers reserved handles, trusted identity, credential expiration, contention, enrollment audit and unauthorized calls. [Governance regressions](../../apps/web/e2e/administration-governance.spec.ts) cover holds and protected decisions. [Platform capability matrix](FOUNDER_CAPABILITY_MATRIX.md) covers planned and separately delegated roles.

## Route and predicate audit

| Route family | Effective enforcement |
| --- | --- |
| `/api/v1/admin/{overview,accounts,audit,safety}` and account changes | Platform access and recent MFA at the route. SQL rechecks `private.platform_admin`. The account action wrapper protects Founder and administrator status changes and role promotion. |
| `/api/v1/admin/legal`, `/audit`, `/actions` | Same platform guard and service-only SQL. Enable and restore require release references, matching immutable release content and an eligible policy revision. Control actions cannot manufacture those approvals. |
| `/api/v1/admin/ambassadors`, `/:id` | `private.ambassador_admin` requires live platform administration and current TOTP. Nomination, consent and publication checks are applied separately. |
| `/api/v1/admin/organization-onboarding/*` | `private.o5_session` checks current platform authority and TOTP. The resource predicate and correction workflow enforce assignment, conflict, version and protected-record rules. |
| `/api/v1/admin/governance`, `/proposals/*`, `/claim-holds/:id` | O5 checks the live session and admin predicate for management. Protected proposal actions add independent authorization. Claim-hold decisions have separate reviewer and conflict rules. Execution and recovery remain closed. |
| `/api/v1/admin/founder-identity/*` | Privileged session plus current case authority. Grant and release also require recognized Founder provenance. Eligibility, proof and recorded consent are rechecked in SQL. |
| `/api/v1/admin/early-partners` | The O5 session guard and a current program operator scope are both required. The program and evidence rules are independent. |
| `/api/v1/admin/privacy-requests/*`, privacy export and lifecycle | Platform rank grants no privacy staff mandate. The real staff review is disabled. Synthetic lifecycle operations use a separately controlled delegate and the remaining lifecycle predicates. |
| `/api/v1/moderation/*`, community moderation, project review, poll moderation | Feed and polls use their own moderation and recent-session predicates. Community or project scope and conflict checks can restrict otherwise eligible actors. The roster and project parity fix adds no raw ballot privilege. |
| `/api/v1/verification/review`, assignment, decision and revocation | Current recent-MFA session and separate reviewer eligibility. Personal-case evidence and decisions require eligible work assignment. Conflicts and approval independence are rechecked under the transaction lock. |

Core administrative actions resolve the live role in PostgreSQL. Feed moderation checks platform/admin/moderator scope, project review applies active-user, verified-authenticator and conflict predicates, and project decisions add the existing recent-session checks. Organization, community, privacy, program, verification and legal workflow roles use their own authority. The older SQL checks for an institutional or community `administrator` describe domain roles. Legacy global administrator promotion and status writes are protected by the active O5 wrapper.
