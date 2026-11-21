# D1 compatibility report

## Hosted catalog compared with a fresh L6.2A baseline

The compared PostgreSQL builds both reported 17.12. All 61 recorded migration statement fingerprints matched after normalizing CRLF to LF, with no remote-only or out-of-order version. The sampled application tables' columns, constraints, indexes, RLS flags, policies and grants matched. The 11 selected existing routine signatures, fingerprints and role grants matched. The Auth referral trigger and its routine fingerprint matched. The installed extensions and versions also matched within this inventory.

The difference was four additional hosted indexes on `auth.users` for email, name, creation time and last sign-in. The local catalog did not have them. Auth columns, constraints, RLS, grants and managed-trigger inventory otherwise matched the selected fields. The migrations do not drop or alter those indexes. D1 stopped before any hosted mutation. An operator must acknowledge this provider-side difference at final preflight. This comparison covers the selected objects and is not a whole-project schema equivalence proof. [Catalog probe](../../scripts/d1-catalog.sql)

The hosted aggregate fit check found existing Auth accounts and an administrator assignment, with zero institutions, representative grants, pending claims, projects and polls. No duplicate active owner or account restriction was present. No identities or protected rows were read into the evidence package. Hosted data offered no legacy institution to use as a continuity witness, so the second rehearsal seeded synthetic organization, owner and editor rows before O2. [Aggregate probe](../../scripts/d1-data-fit.sql)

## Disposable results

| Rehearsal | Evidence |
| --- | --- |
| First full chain | L6.2A through all six pending migrations, matching Fastify and Next.js, 67 Chromium cases. Three cases come from local display/Founder edits excluded from Git and CI. |
| Second independent full chain | Clean committed app sources plus D1 rehearsal scripts, 64 Chromium cases. A pre-existing synthetic institution kept its owner and editor, a private `unknown` registration default and version zero. The owner updated the record through the existing command and produced a scoped audit event. Legacy creation hit O4 refusal. The catalog had all 67 versions and both enabled Ayinou Auth triggers after the upgrade. |
| Pre-O2 app on upgraded database | Six checks passed using pre-O2 revision `8651b9aa998b43eaaae5b16c73169cc4c5bf20eb` on the upgraded disposable database. Its unmodified API denied legacy create and claim requests without adding rows. An existing owner could read and update the institution with a durable audit event. Sign-in, MFA, and denied privileged views also passed. |
| Injected migration failure | A temporary local-only version between O3 and O4 created a probe table and then raised SQLSTATE `22012`. The CLI stopped at O3, the table was rolled back, and no failed version was recorded. After removing the temporary file, the disposable run resumed through O7 and passed all four focused integration cases. |
| Before the O4 commit | The original API routes call database routines that O4 replaces. The O2/O3 intermediate schema does not itself protect those old routes. Pause legacy institution creation and ownership claim writes before O2, and keep the pause through postflight. |

The full Chromium suites exercise anonymous pages, both signup choices with Mailpit confirmation, referrals, personal onboarding, logout and resume, password reset and TOTP, identity prerequisites, duplicate handles, private registration, representative invitations, independent claim review, corrections and governance, synthetic partner consent and expiry, project permissions, polls and ballot secrecy, scoped audit, and legal and privacy gates. They also cover stale versions, concurrent write decisions, protected rows and response replay. They do not simulate a production traffic switchover, real email delivery, provider restore or every possible concurrent schedule.

```sh
npm run test:e2e -- --organization-rollout
npm run test:e2e -- --deployment-rehearsal
```

The second command records a baseline catalog, seeds the legacy fixture in the unique local Docker container, applies the exact migration chain, checks the preserved roles and closed gates, records the upgraded catalog and starts the current app. The older application exercise uses the pinned revision in a temporary directory with unchanged app source and its pinned dependencies. Copy the six pending migrations, the current `run-e2e.mjs`, D1 catalog and legacy SQL scripts into that temporary copy, and copy `scripts/d1-legacy-http.spec.ts` into its `apps/web/e2e` directory. Run `npm run test:e2e -- --deployment-rehearsal d1-legacy-http.spec.ts auth.spec.ts trust-access.spec.ts`. [Legacy HTTP probe](../../scripts/d1-legacy-http.spec.ts)

## Hosted Auth gaps

A filtered, read-only provider config comparison showed the hosted Site URL and both additional redirect entries pointing to localhost. Production HTTPS callback and reset redirects still need exact approval and validation. Hosted password policy has minimum length six with no configured complexity, while the app and disposable Supabase use length eight and uppercase, lowercase, digits and symbols. Hosted TOTP enrollment and verification are enabled. Email OTP length and email minimum request interval differ between hosted and local, so verify production templates and flow behavior with approved recipients. The successful disposable Mailpit test provides no production SMTP evidence. Confirm SMTP delivery, email confirmation, refresh rotation and allowed callback configuration with the Auth operator before release. [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls) · [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

Next.js/Fastify continue using signed Supabase sessions and current subject/resource authorization. D1 does not implement the future remembered-device or six-hour administrator policy. [Session Security plan](../security/SESSION_SECURITY_IMPLEMENTATION_PLAN.md)
