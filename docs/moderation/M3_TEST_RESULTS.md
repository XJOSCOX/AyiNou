# M3 test and hosted verification

Local test outcomes and hosted verification are tracked separately. All moderation mutation tests use the disposable Supabase runner. No routine validation was run through GitHub Actions.

| Check | Result |
| --- | --- |
| Typecheck, lint, shared contract inventory and locale keys | Passed locally |
| Fastify and web unit suites | 53 API tests and two web tests passed |
| Production local build | Passed |
| Disposable baseline smoke | 68 passed, zero failed |
| Disposable targeted run with the M3 migration | 27 passed, zero failed |
| Engineering standards | Five standards tests and the repository coverage check passed |

The final targeted run included M2.2-M2.5, Founder identity and project lifecycle, organization publishing, groups, events, polls, project work and progress, and A1A pagination and concurrency. The new regression verified that an applicable project restriction prevents amendment submission and publication, leaves the visible or private revision unchanged, and permits the normal transition when the synthetic restriction is released.

## Hosted verification

The linked project is AyiNou `hcbxulyfmdmuyccgrujs`, labeled production by the CLI. Read-only migration preflight found matching history through M2.5 at the start of M3. The M3 dry run identified one project enforcement migration. The read-only data and grant preflight confirmed one Founder provenance record, one Administrator assignment, one account sanction, no stored appeals or delegations, the 25 capability registry and effective moderation policy revision 1. The four staff command RPCs are service-only. The owner separately approved the migration.

On November 24, 2026, the sole approved migration `20261124153000_m3_project_enforcement.sql` from tested commit `2b3e56297797651f25c379d725d5e3228393aa92` applied successfully. The follow-up dry run found zero pending migrations. Read-only postflight confirmed the new trigger was enabled on the project event table, row-level security remained enabled, and anonymous, authenticated and service roles had no direct execution grant on the trigger function. All 23 preflight and postflight values matched, including project, revision and event counts, moderation fingerprints, policy revision and command grants. No synthetic enforcement or appeal decisions were made on hosted accounts.

The local API configured for this hosted project returned 200 for health and Projects and 401 for an unauthenticated moderation-policy read. The local web Projects page returned 200. Hosted application server deployment was outside this database rollout.

[Coverage](M3_ENFORCEMENT_COVERAGE.md) · [Findings](M3_SECURITY_FINDINGS.md)
