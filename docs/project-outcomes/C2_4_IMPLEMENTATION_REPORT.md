# C2.4 Community and national Impact reporting

## Scope

The Impact dashboard uses the C2.3 release at `18a2c2bb900585b6ee279eac3faf7b21fe574b89` and the existing Projects, department directory, C2.1 sources, C2.2 findings, C2.3 disclosures, C1 associations, protected Founder workspace and C2.3 reviewer workspace. It supports approved reporting slices for all ten Haitian departments and a national view of the configured departments. Figures describe AyiNou participation and coverage. Official national statistics come from Haiti’s statistical authorities.

## Data model and API

Eight private RLS tables hold the fixture gate, settings, governance grants, versioned definitions, observation mappings, association consent, sealed releases and an audit ledger. Two service-only RPCs provide a narrow report and scoped operations. The public Fastify endpoint accepts one completed calendar year, one sector and one department or the national view. It emits disclosure states, approved numerics, public catalog definitions and optional independently public project links. Both public and private routes use no-store responses. The existing custom project metric system is available through Project Work.

## Permissions and audit

Founder Platform Settings controls display eligibility, years, sectors, links, measurement and association categories, authorizations and proposals. Sensitive commands require the verified Founder role, recent MFA, the same admin workspace, a version, a reason and confirmation. Current department publication reviewers use their own recent-MFA, original-session workspace for mapping decisions. A current, expiring global governance grant permits independent catalog and report review. Relevant project ownership, source review, publication review and mapping involvement prevent a report reviewer from approving that cohort. The organizer can map only a current eligible result they own and a C1 author can consent only for their existing approved association. Ordinary application roles have zero direct update authority for these tables or their audit history.

## Privacy and lifecycle

A release covers a fixed sector and calendar-year cohort. The server checks the exact current digest against the independently sealed snapshot at every public read. It permanently suppresses affected published slices on relevant visibility, source, evidence, consent, mapping, configuration and catalog changes. Public links identify independently public projects only. Private needs, sources, people and workspaces stay outside the response. See the [privacy analysis](C2_4_PRIVACY_ANALYSIS.md) and [aggregation policy](C2_4_AGGREGATION_POLICY.md).

## Localization and accessibility

The dashboard and protected controls use Haitian Creole, French, English and Spanish. Native keyboard-accessible labels and controls select the approved dimensions. Responsive summary cards and measurement details show the value and its availability in text. Reporting pages provide unavailable, withheld, expired and retry states.

## Reliability and recovery

Use the existing source and project indexes, bounded source candidate scans, scoped mapping and report indexes, service rate budgets, a statement timeout, transactional receipts and optimistic versions. Public reads recompute the input signature without exposing or logging source details. The browser discards the rendered report after a limited display window or when it is hidden. A new safe release requires a separate non-overlapping cohort. Private decisions stay in the ledger. A forward patch is the recovery mechanism for defects after an approved deployment.

## Validation and CI

Verification uses local tooling and disposable Supabase. Unit and API tests, contract and route inventories, TypeScript, lint, engineering standards, and the production build passed locally. The local connected browser showed the closed Impact dashboard and reviewer workspace as Test02. The account could not reach Founder settings. J0SC0X opened the protected administration workspace and saw the closed Impact settings and reviewer workspace in the existing authenticated session. Enabled reporting uses disposable fixtures only. The routine checks ran locally without GitHub Actions.

During validation, tests caught mismatched department slugs and codes, ambiguous SQL variables in the command handler and release-withholding trigger, and a browser test that exceeded the service read budget. Department filters use native codes, the SQL variables have distinct names, and the browser test checks all ten choices with a bounded request count.

The isolated Impact test passed. The local PostgreSQL projection took 416.518 ms for 160 eligible synthetic projects and 554.430 ms for the mixed synthetic cohort. These are disposable-environment execution times. The test exercised the ten department choices and passed responsive checks in Haitian Creole, French, English, and Spanish. Seven C2.1–C2.3 and native Project Work cases also passed. All ten C1 department association cases passed on a separate disposable database. Sharing one instance exposed a test isolation issue because C1 expects an empty association directory at intermediate steps.

### Hosted preflight

AyiNou project `hcbxulyfmdmuyccgrujs` reported 141 applied migrations and exactly one pending file, `20261125124000_c24_impact_reporting.sql`, with checksum `c3b1b284e6b4f43d5c5ae7f67937ad8d0c31fe9ed01c5aa1b424b224379fc049`. The read-only baseline fingerprints 78 existing record collections, 282 relations, 803 routines, 29 RLS policies, and 159 triggers. Existing Community Needs and Outcome fixture and activation gates were closed. The Founder separately approved this exact migration, conditional on the final local regression.

### Hosted database rollout and postflight

On 2026-11-25, a fresh dry run at implementation commit `3d6b19b9f98de65d6d5de61c2c1fe05b663751f2` matched the approved target, file and checksum. The CLI applied that migration alone, with zero roles or CLI seeds. Hosted history then showed 142 applied migrations and zero pending. The 78 record collection fingerprints and the full prior migration, relation, routine, RLS policy and trigger fingerprints matched preflight.

The approved footprint was eight private RLS tables, 16 verified function bodies and 24 invalidation triggers. Anonymous, authenticated, authenticator and service roles have no direct privileges on the private tables. The two externally exposed database RPCs grant execution only to the backend service among application roles. Hosted inspection verified the approved authorization and activation guards. The two implementation-reviewed definitions for school desks and tree planting are inactive drafts. The new settings, authorizations, mappings, consents, releases, audit and fixture tables were empty. Existing C1 and C2 fixture and activation gates remained closed. There are no synthetic or real Impact statistics on the hosted database.

The rebuilt localhost API and web passed the same 41 read-only checks against hosted Supabase before and after the change. Health, communities, departments, public projects, guest redirects and protected administration denials remained compatible. Impact returned its disabled public response without report data, with no-store headers. Private Impact endpoints remained disabled. This rollout deployed the hosted database only. The web and API checks used connected localhost processes.

## Documentation and operations

See the [measurement catalog](C2_4_MEASUREMENT_CATALOG.md), [aggregation policy](C2_4_AGGREGATION_POLICY.md), [privacy analysis](C2_4_PRIVACY_ANALYSIS.md), and [security tests](C2_4_SECURITY_TESTS.md). The hosted rollout evidence above records the exact approval, preflight and postflight.

## Remaining blockers

Live C2 intake, evidence review, disclosure and Impact reporting are disabled. C2.5 should evaluate authorization and workflow integration, privacy and retention operations, recovery, statistical review, broader load and review staffing before any separate production activation decision.
