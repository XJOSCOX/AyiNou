# D1 migration readiness

**Recommendation: NO-GO for production.** Prepare the release and reserve an approval checkpoint. Confirm a usable recovery point, protected Storage recovery and approved operator coverage before scheduling a migration.

## Release and target

- Starting commit `af29c27e1b08c2350d2eeba7e91e2d42382ba7aa`. Local `main`, `origin/main` and GitHub agreed at preflight.
- Supabase CLI 3.2.0 identified Ayinou production project `hcbxulyfmdmuyccgrujs`. The read-only history and dry run found 61 applied versions through `20261121010000` (L6.2A) and exactly six pending migrations. Hosted PostgreSQL reported 17.12.
- SHA-256 digests below identify committed source bytes. The pending SQL has no hosted applied entry to compare. Record the deployed commit and recheck these digests before the separately authorized release.

| Order | Pending file | SHA-256 |
| --- | --- | --- |
| 1 | `20261121020000_o2_organization_intents.sql` | `74eff6c89fc5b9fad9f699c65da1b1f147c4a72749227607b33d966c3ad80ef6` |
| 2 | `20261121030000_o3_founder_identity.sql` | `b7f181cb36cdc149a4adf33d91ef512414601ceb2800c061caaf8a8012b2a25e` |
| 3 | `20261121040000_o4_organization_setup.sql` | `7ade1fe48639b0fae954dea678e5acf03c2a830f4af7cdcfb82a77c5fd7123be` |
| 4 | `20261121050000_o5_administration_governance.sql` | `a4654a27dd81e9e3043fb240b87c917654db85f747dddab5a249a2eef8692fc4` |
| 5 | `20261121060000_o6_early_partners.sql` | `33dd43638cb3b8cc744734d042fcc7fd5c4dd057d267de0cad14c85077ee7bda` |
| 6 | `20261121070000_o7_organization_hardening.sql` | `e67bd41e68c7b9b581686dc5658b9bac11e413c34040eae9f3d68900120184a6` |

## Read-only evidence

Use the pinned CLI installed by `npm ci`. These commands read the target or dry run the change. Keep raw results in restricted operator custody.

```sh
git rev-parse HEAD origin/main
git ls-remote origin refs/heads/main
npx --no-install supabase migration list --remote=hcbxulyfmdmuyccgrujs
npx --no-install supabase db query --remote=hcbxulyfmdmuyccgrujs --read-only --file scripts/d1-catalog.sql --output-format json
npx --no-install supabase db query --remote=hcbxulyfmdmuyccgrujs --read-only --file scripts/d1-data-fit.sql --output-format json
npm run db:push:dry
```

The dry-run wrapper must identify `hcbxulyfmdmuyccgrujs` as production. The catalog query returns metadata and statement or definition hashes. The data query returns aggregate counts only. Review migration history, extension availability, RLS and grants, Auth columns and enabled triggers. Stop on unexpected migration versions, a relevant unexplained catalog difference or a mismatched target. Provider-managed Auth and extension metadata can vary between local and hosted Postgres and must be assessed on the affected capability. [Compatibility report](D1_COMPATIBILITY_REPORT.md)

## Readiness matrix

| Category | State | Evidence and condition |
| --- | --- | --- |
| Repository integrity and migration review | PASS | Main matched the approved baseline. Source digests, migration order, constraints and lock risks reviewed. |
| Database compatibility | CONDITIONAL | Disposable continuity and catalog checks cover the surveyed boundary. Repeat the hosted preflight at cutover and pause on unexplained drift. |
| RLS and grants | PASS | Disposable RLS and explicit grant checks, with current authorization and cross-subject denial tests. |
| Auth compatibility | CONDITIONAL | Signup, confirmation, recovery and MFA pass locally. Hosted password and redirect configuration requires separate validation. |
| Legacy institutions | CONDITIONAL | Owner and editor continuity rehearsed. A write freeze is required before O2 until O4 guard installation and full postflight are verified. |
| Identity and authorization | PASS | Independent review, legacy refusal and session revocation exercised on disposable data. |
| Organization onboarding | PASS | Both signup paths, referrals, draft resume, private declarations and idempotent completion exercised. |
| Governance | PASS | Scoped decisions and corrections tested. High-impact execution and recovery stay closed. |
| Early Partners | PASS | Closed real gates and synthetic entitlement tests only. Real enrollment and public designation require separate approval. |
| Audit consistency | PASS | Successful creation and retries reconcile to durable scoped events. Failed protected commands leave no success event. |
| Application compatibility | CONDITIONAL | Disposable forward stack and stale endpoint compatibility. Production versions, release control and traffic cutover pending. |
| Backup availability | BLOCKED | Inventory returned zero available backups and PITR disabled. |
| Provider restore | NOT TESTED | No provider restore or isolated production-data target was authorized. |
| SMTP | BLOCKED | Production confirmation and reset delivery require verified SMTP and approved recipients. |
| Monitoring | CONDITIONAL | Sanitized diagnostics and stop conditions documented. Assign owners and confirm baseline, alerts and staffed coverage. |
| Recovery ownership | BLOCKED | Confirm authorized Supabase owner and backup operator, independent verifier, custody and accepted RPO/RTO. |
| Legal and privacy gates | PASS | Approval and publication checks stay closed. Synthetic privacy remains isolated. |

[Deployment approval checklist](D1_DEPLOYMENT_APPROVAL_CHECKLIST.md) · [Recovery assessment](D1_BACKUP_AND_RECOVERY_ASSESSMENT.md)
