# O7 migration, deployment and rollback runbook

## Target and prerequisites

The hosted target is Ayinou production project `hcbxulyfmdmuyccgrujs`. The fresh read-only catalog confirmed the current institution, invitation, Auth session and independent verification RPCs and found the O2 intent and O6 program objects absent. The read-only migration history and dry run order O2 `20261121020000`, O3 `20261121030000`, O4 `20261121040000`, O5 `20261121050000`, O6 `20261121060000` and O7 `20261121070000`. The original Auth signup trigger and old organization data need compatibility validation before rollout. Obtain separate written migration approval and confirm the prior catalog and migration checks on the exact target. Hosted Auth password rules and SMTP are separate settings from SQL migrations.

## Disposable rehearsal

Run `npm run test:e2e -- --organization-rollout organization-integration.spec.ts auth-recovery.spec.ts`. The runner starts an isolated stack with migrations through L6.2A, verifies the missing O2 RPC and recorded baseline, then applies the pending chain using the local target. It starts matching API and web only after the upgrade. Tests exercise database receipt lineage, current SDK recovery and MFA, route scoping and stale or expired decisions. The separate O4/O5/O6 tests exercise legacy refusal through the database, independent claims and closed gates.

## Deployment after approval

Use the [D1 deployment approval checklist](../deployment/D1_DEPLOYMENT_APPROVAL_CHECKLIST.md) for the current sequence. Keep legacy creation and claim writers paused from before O2 through postflight. The D1 recovery and Auth prerequisites are still open.

1. Pin the release commit and check maintenance window, recovery owner, reviewer readiness and backup custody. Run the hosted dry run and read-only checks again.
2. Apply exactly the separately approved SQL sequence. Verify history, definer grants, existing owner roles, session and Auth triggers, closed Founder and Partner gates, empty public legal registry, and the absence of real privacy execution.
3. Deploy the matching Fastify and Next.js release. Verify public pages and anonymous denial, member sign-in, MFA, current organization membership and invitation views. A real email delivery exercise needs its own authorized recipient and delivery approval.
4. Stop on denied existing-owner access, document publication, incorrect public badge, failed session renewal or unexpected persisted state. Keep migration history and record sanitized request references for review.

## Reversal and forward recovery

A rollback should pin a compatible pre-change API/web build while the newer database rejects legacy organization creation and unreviewed ownership transfer. Continue to serve authorized existing organization views. Disable only the affected app presentation or roll forward the SQL guard if there is an incompatibility. Preserve sessions and evidence unless a documented incident procedure requires revocation. Never reverse by reopening legacy gated writes or removing case and receipt tables. The forward rehearsal checks the database upgrade and legacy SQL denial. An isolated copy of pre-O7 application revision `2b6ae18` also passed 11 Chromium checks against the O7 database, including sign-in, TOTP, organization setup, existing claims and ordinary-member denial. This verifies backward compatibility in the tested paths. A live traffic cutover and provider backup restoration were outside that rehearsal. A provider restore needs an approved isolated target, verified suppression and hold replay, and independent read-back.

## Gate disposition

Program, legal, privacy and Founder activation require separate approved conditions and are not components of the deployment command. Hosted O2–O7 writes and hosted Auth settings changes were not executed for O7.
