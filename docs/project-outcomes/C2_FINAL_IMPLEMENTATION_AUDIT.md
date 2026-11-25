# C2 final implementation audit

## Scope

Reviewed C2.1 intake, C2.2 evidence review and challenge, C2.3 disclosure, and C2.4 Impact from main revision `deca4d92a1c7d2c828a03ca6bec84f6aeb693209`. The review covers SQL definitions and grants, API request schemas and session handling, workspace scopes, first-party web entry points, shared types, audit receipts, privacy and activation. C2 uses the native Projects and Project Work source of truth and C1 association consent.

## Capability inventory

| Capability | Development coverage | Deployment state |
| --- | --- | --- |
| Validation requests and exact source revisions | C2.1 SQL permit only the source-based requester workflow. The fixture covers native evidence without copying project ownership or editing original results. | Hosted foundation applied. Intake gated. |
| Independent outcome evidence and challenge | C2.2 binds assignments, evidence releases, inspections and findings to their versions. Challenge approval applies separate purpose-scoped authorization. | Hosted foundation applied. Review gated. |
| Independent disclosure | C2.3 publishes only a current eligible finding with exact organizer consent and separate review. Public Project Progress receives the disclosure projection. | Hosted foundation applied. Disclosure gated. |
| Measurement mappings and Impact | C2.4 governs versioned definitions, fixed report cohorts, scoped review, and national and departmental disclosure. | Hosted foundation applied. Reporting gated. |
| Permanent association invalidation | C2.5 adds dependency coverage to the sealed release trigger, with existing private receipts and forward-only remediation. | Hosted repair applied and verified. Reporting gated. |
| Automated legal retention, export and erasure for C2 | Operational and legal decisions required. Existing generic privacy cases and holds are reviewed separately. | Deferred from live launch. |

## Confirmed finding

**High C25-01.** The live aggregate checks recompute C1 membership, standing, and blocking eligibility. The earlier persistent invalidation trigger recognized native project ownership and association records, but its dependency lookup omitted some Community Needs authors, organizers, communities and relationship changes. A sealed aggregate could regain eligibility without a new independent release. The correction extends the private eligibility dependency check for consented, current associations and listens for relationship and native proposal revision changes. The correction keeps releases and historical approval receipts. The disposable test asserts permanent withholding and exactly one transactional receipt for a normal relationship change. No prior SQL file is edited.

**Medium C25-02.** Large mixed local populations spent most query time repeatedly looking up the native completion date. At 50,000 synthetic projects the baseline SQL median was 15.204 seconds and the protected API request disconnected. The correction selects the latest completion in the UTC reporting-year window once. Two partial indexes support date-range and per-project latest-completion lookups. Existing department, project visibility, consent, deduplication and bounded cohort rules still apply. The revised 50,000-project SQL median was 719 ms.

## Effective authorization and integration

Service-only command RPCs retain their existing grants and explicit session, standing, workspace and permission conditions. The guest C2.3 projection exposes current approved disclosure fields only. The API constructs the actor and authentication context server-side. SQL evaluates scoped permission and conflict predicates at protected operations. Report release approval and archival withholding use private records. Foundation configuration modes continue to gate all enabled-state tests to disposable Supabase.

## Hosted database verification

On 2026-11-25, the fresh preflight at `038fb0e1125f9ca096ae2156a56b55de891544d9` identified AyiNou project `hcbxulyfmdmuyccgrujs` and only `20261125125000_c25_impact_invalidation.sql`, SHA-256 `a60ffe34dc4ac565041a0922852b09527a919ebb4760820671d862d42c44f357`, pending. The Founder approved this revised checksum after the performance correction. The CLI applied exactly that file, with zero seeds or roles.

Postflight recorded 143 applied migrations and zero pending. All 86 existing record fingerprints, 290 existing relations, 29 RLS policies, previous migration entries and 183 existing triggers matched the preflight. The two reviewed routines matched the tested bodies with unchanged authorization metadata. The other routines matched preflight. Both added triggers and both partial indexes matched. All eight Impact tables retained private RLS and direct app-role denial. C1 and C2 fixture and activation gates remained closed. No real C2 data or Impact releases were created by the deployment.

The connected local API and web passed 42 read-only checks before and after rollout, including login, project and community reads, private denial and disabled C1 and C2 states. Hosted Next.js and Fastify were outside the deployment.

## Validation

See the [end-to-end test evidence](C2_FINAL_END_TO_END_TESTS.md). Local validation covers schema, contracts, translations, unit and API tests, typechecking, lint, engineering standards and builds. Routine validation ran locally and reported zero production dependency advisories from npm. The production-mode local compile used reserved example origins. No web or API service was deployed.
