# U1 implementation report

## Scope

U1 collects public handles in personal and organization signup, provides availability, preserves legitimate legacy handles, and adds authenticated changes and a restricted staff review command. The signup form places username and email on the same row when space allows, uses the username as the initial public display name and saves the preference from the language control beside the theme switch. Members can edit the public display name and preferred language in their profile. It leaves display names independent of private legal names. The starting audited main commit was `16eaf388e0853152b7c6ecac0da7aacd2b181ec5`.

## Data model and API

The existing unique profile handle remains authoritative. Migration `20261121130000_public_usernames.sql` adds private bounded signup leases, retired-handle records, private safety holds and lifecycle audit events. The existing authenticated profile details command remains the member write entry point. The [API workflow](U1_SIGNUP_AND_AVAILABILITY.md) covers the availability and reviewed staff endpoints.

## Permissions and audit

Public checks return one bounded status and use a shared rate budget. PostgreSQL enforces Auth-side reservation, profile rules, existing Founder reservations and concurrent uniqueness. Ordinary members cannot write private policy, leases or audit. Review requires a current administrator and recent TOTP. Receipt and state changes commit atomically. The audit records categorical outcomes and identifies the responsible actor when present.

## Privacy and lifecycle

Private and unconfirmed names, some closed names and confidential reservations share the generic unavailable result. Public alias resolution applies the existing visibility and block checks. Staff corrections suppress potentially harmful aliases. On account deletion, the previous references are detached and occupied names remain tombstoned. The public support channel requests only a handle and optional reference.

## Localization and accessibility

Haitian Creole, French, English and Spanish include equivalent username guidance and status labels. The form uses a text label, a decorative @ prefix, polite status announcements, keyboard controls, reply cancellation and common responsive theme classes. Tests exercise the signup card at phone and desktop widths and profile URL continuity.

## Reliability and recovery

The existing database constraint and a locked, expiring lease decide races. `unavailable` is advisory and a failed request preserves form fields. Staff actions reconcile exact retries through their durable request ID. A migration failure is handled through forward correction. Preserve profile names and grants, and keep new writes disabled if the staged schema and web code drift.

## Validation and CI

The local suite passed 50 API tests, seven client tests, four S1 tests, six frozen legal-source tests and 77 Chromium tests. Typecheck, lint, shared and route contracts, all 35 four-language namespaces, both builds and Legal Center checks passed. The dependency audit reported zero vulnerabilities. The immediate-signup follow-up passed a dedicated two-test suite with Auth email confirmation disabled and eight focused regressions with it enabled. The browser regressions cover the Auth race, expiry, collision and malformed names, live review authorization, protected Founder reservation, profile links and grandfathered names, accessibility and both signup choices.

## Documentation and operations

A hosted read-only aggregate reported two profiles, both with usernames, zero case collisions, zero legacy-format rows and zero exact official-name collisions. The public Auth settings endpoint reported the email provider and signup enabled. The owner has temporarily disabled emailed confirmation for development and plans to restore it later. Hosting uses 68 applied migrations through `20261121080000`. The pending sequence has four Founder migrations, U1 and `20261121131000_username_immediate_signup.sql`. The follow-up preserves direct onboarding when a session is returned, requires a signup reservation receipt in both modes and keeps the reserved Founder mailbox behind independent proof. Rerun the dry run and standard backup checkpoint before a separately approved deploy. Roll the schema out before releasing the signup UI, verify Auth email confirmation, and verify both signup choices and private-name boundaries with disposable data. The [architecture](U1_USERNAME_ARCHITECTURE.md) and [moderation policy](U1_USERNAME_MODERATION_POLICY.md) define the data and review boundaries.

## Remaining blockers

Approve the proposed 30-day cooldown and long-term history retention separately. Confirm contact mailbox operation and moderation staffing. Hosted rollout has its own approval. Public launch, Founder enrollment, administrator activation, S2, real Founder Verified issuance, legal publication and real privacy processing are outside this release.
