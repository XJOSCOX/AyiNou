# C3.1 Skills and Volunteer Profiles

C3.1 adds a private, optional profile in **Settings → Volunteer profile** and a protected catalog and configuration workspace in **Platform Administration → Platform Settings → Volunteer settings**. The profile keeps structured skills distinct from existing interests and verified identity. Nothing in registration or onboarding requires volunteering.

## Scope

| Area | Existing behavior and C3.1 boundary |
| --- | --- |
| Accounts, privacy and moderation | Existing account/session, onboarding and active member checks determine write eligibility. No new identity requirement, age pathway, moderation capability or privacy override. |
| Geography and membership | Uses the existing ten department codes. A Haitian or international member chooses their own preferences, independent of residence, diaspora ties, community membership and project eligibility. Remote participation can be worldwide. |
| Project Work | Existing advertised opportunities, applications, invitations, acceptance, team scope and subsequent assignments retain their current authority. Pausing or withdrawing volunteer consent does not touch those records. |
| Administration | Existing recognized Founder access, recent authenticator verification, original administrator workspace, reasons, confirmations and protected commands. The workspace shows catalog history, configuration state, geographic scope and launch dependencies. It has no operational activation or pause switch. |
| Member availability | Separate from profile completion and from consent. Members can set weekly hours, participation mode, departments or nationwide scope, and an optional end date interpreted in Haiti time, including clearing it. The private fixture exercises saves, pause and resume. |
| Disclosure | Future matching, organizer discovery and member-profile skills display use separate consent records. C3.1 supplies no third-party projection. Native privacy and blocks remain authoritative when a later approved projection is designed. |

## Data model and API

The hosted feature remains closed even if the application is pointed at a synthetic runtime setting. Enabled tests require the isolated environment flag and its private fixture row. Founder settings and catalog changes never write that fixture. The service exposes one account/session-bound RPC. The owner endpoint handles only the current signed-in account. The Founder endpoint returns the catalog, settings and administrative receipts, with no volunteer profile details.

## Permissions and audit

The owner command authorizes the signed-in subject and the Founder command verifies platform authority, MFA, and the original workspace. The administrative receipt records immutable input snapshots, while current owner consent has a separate timestamp. SQL RLS and grants keep both the tables and helper functions private.

## Privacy and lifecycle

Volunteering stays separate from member residence, public profile settings and identity credentials. Opting out preserves the owner's private profile and existing project work. Live expansion depends on account export, retention and hold-aware lifecycle verification.

## Localization and accessibility

Labels and skill names cover English, Haitian Creole, French and Spanish. Search, fieldsets, labels, status feedback and responsive layouts use native controls and existing theme tokens. The disposable test exercises search, keyboard navigation, four languages, narrow viewport and dark Founder mode.

## Reliability and recovery

Protected writes use revision checks and idempotency receipts. Related records commit in one transaction. Concurrent saves cannot overwrite a newer revision, and a catalog change cannot race skill-selection validation. Follow the existing database forward-repair workflow for a release defect.

## Validation and CI

The runtime-guard and route tests passed alongside all 59 API tests, both web environment tests, seven client-error tests, the shared contract baseline and the translation checks. Local typecheck, lint, engineering standards, and both localhost and hosted-mode builds passed. The 19 distinct disposable end-to-end cases covered the two C3.1 volunteer flows, Project Work, all ten C1 department flows and six C2 cases. Established C1 and C2 suites were isolated when their shared fixture data interfered with exact-count and empty-list assertions in the combined run. The final C3.1 run also verified blocks, restrictions, stale revisions and consent withdrawal. An additional disposable test exercised the current Project Work API for opportunity publication, application, offer, confirmation, withdrawal, invitation and accepted contribution. The historical rollback script stopped at its legacy direct proposal-creation call with access denied. The current API flow and the Project Work browser regression both passed. The implementation reused the native onboarding policy rather than imposing completion when the platform policy makes it optional.

## Hosted database rollout

- Target: AyiNou `hcbxulyfmdmuyccgrujs`, identified by the CLI as production.
- Implementation revision: `baa1dffc5c1a23d9a68fabad88ec60d07be07837`.
- Exact approved migration: `20261125130000_c31_volunteer_profiles.sql`.
- Verified SHA-256: `a92ae66aabcae15d1324d8eae2aa9e7eb4e89ac068fdb48612293fc928447a86`.
- Fresh preflight: 144 applied, only C3.1 pending. The apply receipt listed one migration with zero external seed or role operations. A fresh postflight found 145 applied and zero pending.
- Data preservation: 89 existing record fingerprints matched. The pre-existing relations, routines, policies and triggers matched. C3.1 added nine private RLS tables and three functions. Read-only checks confirmed no direct table privileges for anonymous, authenticated, authenticator or service roles. The command is service-only, and the helpers have no app-role grants. All three installed function bodies matched the approved file.
- Catalog and activation: 15 version-one skills and 75 reserved search terms. Settings, fixture, profiles, selections, consent, owner receipts and administrative history were empty. The four C1 and four C2 fixture gates stayed closed.

## Connected local application

45 read-only API and web compatibility checks passed, including guest denials, Community Needs, Project Outcomes and Impact closed states, and public community and project reads. J0SC0X opened Platform Administration using owner-entered MFA. The Founder saw Configuration available, version zero, all 15 skills, all ten department names, empty history and closed intake. No hosted settings or profiles were saved. Test02 followed the link from Account settings and saw Incomplete profile with intake closed and no editor. Its Founder settings URL returned Page not found. The hosted rollout covered the database. Next.js and Fastify ran locally.

## Documentation and operations

- [Catalog and governance](C3_1_SKILLS_CATALOG.md)
- [Privacy and account lifecycle](C3_1_PRIVACY_POLICY.md)
- [Security and test evidence](C3_1_SECURITY_TESTS.md)

## Remaining blockers

Operational use remains gated on approved safeguarding, member notices, and tested lifecycle processing. C3.2 would need separately scoped project skill requirements, privacy-aware matching eligibility, consent and block rechecks, role limits, and an explicit staged activation and pause design.
