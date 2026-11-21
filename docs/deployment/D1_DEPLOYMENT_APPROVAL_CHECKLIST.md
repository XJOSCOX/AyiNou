# D1 deployment approval checklist

**Decision: hold at owner approval.** This procedure describes a future authorized release. D1 uses read-only hosted inspection and disposable infrastructure.

| Step | Work and acceptance evidence |
| --- | --- |
| A. Identify release | Pin the exact reviewed Git commit, six SQL SHA-256 fingerprints, provider project `hcbxulyfmdmuyccgrujs`, Fastify and Next.js artifacts, and compatible rollback revision. Verify all CI results. Record separate signed production authorization. |
| B. Confirm backup | Check that a usable provider backup or an independently approved recovery point exists. Record age, retention, storage protection and acceptable RPO/RTO. Approve a restricted isolated restore and independent verification if needed. |
| C. Prepare window | Name release, database, application, recovery and audit operators. Confirm alerts, status communications, migration lock budget, retry rules and an ingress write pause. Pause signup and legacy create/claim and competing institutional mutations before O2; stop old workers or other channels capable of writing those routes. Verify the pause from permitted operator entry points. Keep it active through database postflight and old-client denial. |
| D. Recheck hosted | Run the exact read-only commands in the [readiness evidence](D1_MIGRATION_READINESS.md#read-only-evidence). Expect L6.2A followed by exactly six pending files, unchanged preflight dependencies and matching project. Review drift and lock activity. Check Auth and backup prerequisites against recorded evidence. |
| E. Apply reviewed SQL | Authorized operator only. Use the pinned Supabase CLI against the explicitly named target. Check the dry-run response again, then authorize execution of those six files in listed order. Stop at the first error or new migration. |
| F. Verify database | Repeat migration list, catalog, data-fit and the dry run. Expect six applied versions and no pending files for the approved source, both Auth triggers, O4 identity and legacy guard, O7 replacements, expected RLS and grants, retained legacy owners, no seeded live authorities or programs, and closed legal and privacy gates. Resolve unexplained differences before changing traffic. |
| G. Release Fastify | Deploy the pinned compatible image to a restricted canary after database checks. Check status, unchanged actor/permission boundaries and legacy denial. Hold production writes until approval. |
| H. Release Next.js | Match the reviewed Fastify and Supabase targets. Pin the public origin and approved callback URLs. Keep privileged capabilities gated and maintain the approved traffic controls. |
| I. Smoke and resume | Check anonymous pages, authorized read-only member/owner views, sign-in and MFA using approved access. Hosted account creation, email delivery and controlled writes need explicit test authorization. Resume eligible traffic in stages after operators sign off. |
| J. Observe | Compare API errors and auth/MFA outcomes with the agreed baseline. Watch organization setup, database lock or migration errors, unexpected denials/role changes, resource health and applicable cleanup. Use aggregate counts, sanitized codes, request IDs and scoped audit events. Confirm recovery on call. |
| K. Sign off | Record migration history, deployed artifacts, outcomes, resumed traffic, exceptions, incident owner and retention of minimum evidence. Leave approvals for separate real feature activation untouched. |

After A–D are signed off, the authorized database operator can use the pinned CLI command below. Check that the linked working directory is the approved release and contains only the reviewed migration files. Keep explicit operator control of the confirmation.

```sh
npx --no-install supabase db push --remote=hcbxulyfmdmuyccgrujs --skip-vault
```

## Stop conditions and containment

| Event | Response |
| --- | --- |
| Wrong ref, new or out-of-order history, failed or stuck migration | Keep the pause active. Capture sanitized error code and version plus catalog state. Identify committed stages before retry. Use a separately reviewed forward correction only after identifying the cause. |
| Existing-owner loss, MFA/sign-in failure or signup trigger error | Stop traffic progression. Preserve evidence and compare current roles, hooks, callback config and session reads. Roll back compatible API/web builds while retaining database guards. Escalate provider faults. |
| Public private-data exposure, incorrect badge or unauthorized creation/transfer | Stop affected service paths promptly. Close impacted access and preserve scoped evidence. Record an incident and independently confirm gates before reopening. |
| Audit or receipt mismatch | Hold the affected workflow. Reconcile exact command and state to existing domain events and receipts. Never fabricate history or retry ambiguous requests with new IDs. |
| App incompatibility or provider outage | Hold or restrict writes. Use the tested backward-compatible artifact where applicable and track provider status. Seek recovery approval only if the validated recovery criteria are met. |

Keep any approved telemetry within S1 policy. No new external monitoring service is part of D1. [Recovery assessment](D1_BACKUP_AND_RECOVERY_ASSESSMENT.md) · [S1 audit policy](../standards/AUDIT_EVENT_POLICY.md)
