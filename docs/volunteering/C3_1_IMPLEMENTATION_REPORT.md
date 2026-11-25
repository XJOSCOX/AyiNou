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

Run the workspace suite, shared contracts, engineering standards, lint, typecheck, browser regressions and builds locally. Routine GitHub Actions are skipped for this release. Hosted verification consists of read-only preservation and catalog comparisons after the exact approved migration.

## Documentation and operations

- [Catalog and governance](C3_1_SKILLS_CATALOG.md)
- [Privacy and account lifecycle](C3_1_PRIVACY_POLICY.md)
- [Security and test evidence](C3_1_SECURITY_TESTS.md)

## Remaining blockers

Rollout and verification results will be added after the independent checksum approval and hosted postflight. Operational use remains gated on approved safeguarding, member notices, and tested lifecycle processing. C3.2 would need separately scoped project skill requirements, privacy-aware matching eligibility, consent and block rechecks, role limits, and an explicit staged activation and pause design.
