# I1 database and API coverage

**Baseline** `4cf93b4630db037cea0d6be770e25f97e9e2e4ba`. The checkout contains 66 Next.js page source files and the Fastify contract fixture has 502 method and path rows, counting generated HEAD companions. Page source counts include route variants and private workspaces. The fixture covers body limits and route metadata where supplied. It measures route coverage, while role checks and supported workflows depend on tests and implementation.

| Layer | Authority and evidence |
| --- | --- |
| UI and workspaces | `apps/web/src/app` supplies public and protected pages, organization and administrator workspaces, and scoped authentication. The register enumerates page sources separately from Fastify. The Next.js Auth callback is a handler outside the page count. |
| API and contracts | Fastify registers scoped route modules and enforces configured request bounds. Domain contracts live in the shared package. [API registration](../../apps/api/src/app.ts) · [Route fixture](../../apps/api/test/fixtures/route-inventory.txt) · [Route test](../../apps/api/test/route-contract.test.ts) · [Contracts](../../packages/shared/src/index.ts) |
| PostgreSQL | Determine effective behavior from migration order, role grants, views and entry point definitions. RLS is one boundary. Security-definer RPCs, private schema reads, triggers and service-only calls also matter. [RLS suite](../../supabase/tests/database/phase1a_schema_rls_test.sql) · [M3 authorization matrix](../moderation/M3_AUTHORIZATION_MATRIX.md) |
| Auth | Supabase sessions and browser/server adapters support confirmation, reset, step-up and scoped workspaces. A role or badge is one input to eligibility. [Server adapter](../../apps/web/src/lib/supabase/server.ts) · [Scoped workspaces](../../supabase/migrations/20261121144100_s2c_scoped_workspaces.sql) |
| Storage | Visibility depends on bucket or object policies, scoped references and service workflows. Feed upload finalization and project evidence have separate controls. [Feed media](../../supabase/migrations/20261120110000_phase3e_post_media.sql) · [Project evidence access](../../supabase/migrations/20261120209000_phase6c_progress_access.sql) · [P1 findings](../production-readiness/P1_SECURITY_FINDINGS.md) |
| Test layers | Browser specs, Fastify test injection and rollback SQL support different claims. An existing test file indicates coverage. Passing local or disposable evidence comes from a run with recorded scope. [M3 tests](../moderation/M3_TEST_RESULTS.md) · [P1 results](../production-readiness/P1_TEST_RESULTS.md) |

## Configuration boundaries

- Hosted web builds require explicit non-loopback HTTPS origins through `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SUPABASE_URL`. Fastify accepts its configured `WEB_ORIGINS` and keeps Supabase service credentials server-side. [Web environment](../../apps/web/web-environment.mjs) · [API configuration](../../apps/api/src/config.ts)
- `AYINOU_FOUNDER_BOOTSTRAP_ENABLED` controls the reserved setup path. Established administration uses server-checked authority and workspace scope. Founder Verified issuance has its own active policy, method and eligibility checks in `private.fv_active_policy` and `private.fv_policy_for_member`. Live setting values were unverified. [API registration](../../apps/api/src/app.ts) · [Issuance policy](../../supabase/migrations/20261122160000_fv_operational_issuance_policy.sql)
- `AYINOU_PRIVACY_INTAKE`, `AYINOU_PRIVACY_EXPORT` and `AYINOU_PRIVACY_LIFECYCLE` are disabled by default and support synthetic mode. The intake configuration rejects production or a backend outside the designated local disposable endpoint, and API registration applies additional conditions. [Privacy environment and route gates](../../apps/api/src/config.ts) · [API registration](../../apps/api/src/app.ts)

## Effective controls checked or reconciled

- Proposal decisions use `project_review_preview_for_client` and the proof-bearing `project_review_for_client` overload for approval. M3 added project eligibility enforcement at amended submission and publication. [Preview proof SQL](../../supabase/migrations/20261124145000_project_approval_requires_preview.sql) · [M3 SQL](../../supabase/migrations/20261124153000_m3_project_enforcement.sql)
- `poll_detail_for_client` exposes scoped results subject to the current policy. Private ballot access remains a different permission boundary. P1’s observed low-count inference risk applies to the aggregate projection. [Poll access](../../supabase/migrations/20261120212000_phase6d_poll_access.sql) · [Effective results projection](../../supabase/migrations/20261124150000_poll_results_during_voting.sql)
- P1 updates `finish_post_upload_for_api` to check account authority and lease currency. The private A1A audit view projects proven persisted account policy revisions while preserving ambiguous historical values. [P1 SQL](../../supabase/migrations/20261124154000_p1_media_and_account_audit.sql)
- Policy activation, effective hosted URL and installed SMTP credentials were outside the verified scope. Gated stages in the register distinguish code presence from operational authorization. [Deployment evidence](../production-readiness/P1_DEPLOYMENT_READINESS.md)

The exact P1 migration `20261124154000_p1_media_and_account_audit.sql` was separately approved and had already run when the I1 brief was opened. The brief’s pending status is historical. A read-only postflight found the hosted development database current with 130 migrations and no pending versions. All 37 preservation comparisons matched. I1 itself made no hosted changes. Hosted web and API release remain unverified.

Read-only connected checks returned HTTP 200 for the local web/API Projects surface and HTTP 401 for unsigned moderation-policy access. The local API used the stated hosted development target. These probes exercised availability and the unsigned guard. The hosted application edge, authenticated workflows and provider recovery retain their separate evidence requirements.

[Machine-readable routes, contracts, tests and feature references](I1_FEATURE_REGISTER.json)
