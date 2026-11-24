# P1 tests and hosted verification

Baseline: `119517cfe5e91f6da06c9dbe441a6b5381349887`.

| Check | Result |
| --- | --- |
| Shared contracts, typecheck, lint, four languages, client errors | Local checks passed |
| API and web unit suites | 53 Fastify and two web tests passed |
| Builds | Local production, plus explicit HTTPS production-origin build with synthetic endpoints, passed |
| Baseline Chromium smoke | 68 passed, zero failed |
| Targeted browser and database regressions with the P1 migration | 19 passed, zero failed |
| Engineering standards | 5 tests and the repository coverage check passed |
| Synthetic database and Storage recovery rehearsal | Passed after applying the full local migration chain through P1 |

The targeted run exercised PostgreSQL poll scope and grants across individual, community, institution and project polls, exact lower-count results and repeated reads, Feed media completion and cleanup, account policy audit history, native moderation controls, appeals, organization publishing, privacy holds and concurrent audit reads. The isolated recovery drill used synthetic database and Storage objects and left no disposable resources.

## Hosted read-only preflight

Project `hcbxulyfmdmuyccgrujs` matched. The pinned CLI labels it production. The catalog reports 129 applied versions through M3, 25 capability definitions, live moderation policy revision 1, and zero client grants for the four staff command RPCs. Aggregate project, decision and restriction counts and record fingerprints were captured. Hosted backup listing returned no recovery points and PITR disabled. No hosted evidence was read and no synthetic hosted cases were created.

Exact proposed migration: `20261124154000_p1_media_and_account_audit.sql`. Dry run found that file alone, with no seeds or roles. It changes the existing media finish execution check and A1A view definition. There is no migration of historical data, change to storage grants or modification of hosted infrastructure. After approval, compare the same data and grant snapshot and check the media function, A1A view and local application read paths. If the change requires remediation, use a reviewed forward migration that restores the previous compatible function or projection while preserving records.

[Migration](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql) · [Findings](P1_SECURITY_FINDINGS.md)
