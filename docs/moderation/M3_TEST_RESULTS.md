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

The linked project is AyiNou `hcbxulyfmdmuyccgrujs`, labeled production by the CLI. Read-only migration preflight found matching history through M2.5 at the start of M3. The M3 dry run identified one project enforcement migration. The read-only data and grant preflight confirmed one Founder provenance record, one Administrator assignment, one account sanction, no stored appeals or delegations, the 25 capability registry and effective moderation policy revision 1. The four staff command RPCs are service-only. The migration awaits separate rollout authorization and hosted postflight.

[Coverage](M3_ENFORCEMENT_COVERAGE.md) · [Findings](M3_SECURITY_FINDINGS.md)
