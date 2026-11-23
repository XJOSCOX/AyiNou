# R2.5 — Verification, roles and badges

## Scope

The Founder’s private Platform Settings contains Verification Settings, Roles & Assignments, Official Badge Settings, Custom Recognition Badges, and Badge Awards & History. All thirteen policy switches start ON at revision 1. Recognition badges may also pause new awards or public display individually. Each award starts private and belongs to one member account.

| Policy | Enforcement |
| --- | --- |
| Personal, public figure and organization verification intake | Separate guards on new verification applications. Organization, government and representative applications share the organization intake switch. Organization ownership claims retain their own onboarding rules. |
| Founder-direct Blue and Gold | Blue decisions and Gold case creation and issuance use the new policy in addition to existing domain authorization, independent review, conflict checks, Gold consent and evidence. Existing cases, decisions and badge records remain available in their original domains. |
| Appeals intake | The optional intake flag is versioned and audited. Every current eligible verification appeal is part of the protected appeal path. The flag reserves control of optional intake if such a path is introduced. Existing appeal deadlines, submissions and adjudication still apply. |
| New Administrator appointments | Founder policy applies when a new appointment proposal is created. Existing proposals continue through the native acceptance and MFA flow. |
| New organization role assignments | New base role invitations and custom grants use the switch. Existing invitations, memberships, revocations and organization ownership operate under their existing scoped rules. The Founder panel shows organization assignments only where the Founder has an eligible organization role. |
| Official Blue and Gold presentation | Display switches apply to the marks shown in the web application. Verification status, disclosure preferences, official records, history and protected eligibility predicates retain their original semantics. |
| Recognition | The global registry and individual badge flags control new awards and public presentation. The recipient independently controls their own public display preference. Public recognition requires a currently public profile and follows the existing profile visibility and blocking checks. |

## Data model and API

The verification policy registry records one versioned policy snapshot per revision. The settings, role overview, and badge administration use restricted Fastify routes. Member visibility uses its own authenticated RPC. The public read exposes only presentation flags and eligible decorative profile marks.

## Permissions and audit

Founder writes require trusted Founder provenance, a live account, recent MFA and the original private administration workspace. Policy updates and badge edits use revision checks. Request identifiers make exact retries idempotent. The state changes and audit rows commit in the same transaction. Policy history reuses the existing Founder policy audit endpoint. The recognition administration view shows up to 100 recent records per category.

## Privacy and lifecycle

Recognition has private badge, award and event ledgers. The database validates four-language metadata, approved icons and optional color. Public displays label each mark as recognition. Badge contents, identifiers and award rows have no role or verification authority. The public read returns display metadata for published awards and excludes recipients’ private preferences, audit reasons and issuer identities. Founder history retains actor, reason, time and relevant record references. Command fingerprints support retries without retaining raw request bodies in the event ledger. Recipient visibility is current state. Account deletion removes the recipient’s award rows through the foreign key and detaches the associated award reference in history. The retention schedule stays with the project’s privacy and audit policy review.

## Localization and accessibility

The Founder labels, recognition metadata and recipient controls support English, French, Haitian Creole and Spanish. Mark labels use the localized name and a fixed recognition label. The existing themes and responsive workspace remain in use.

## Reliability and recovery

A unique active-award constraint and a badge row lock prevent duplicate assignments. A failed write leaves the prior state and audit history intact. Operators can reopen intake or visibility through a new audited revision.

## Validation and CI

Disposable coverage is in `apps/web/e2e/verification-policy.spec.ts`. Existing identity, onboarding, session and role tests remain applicable. Reviewers should verify protected appeal classification, organization scope, effective database grants and recognition text moderation before using the module for a public launch.

## Documentation and operations

The additive migration is `20261122200000_r25_verification_roles_badges.sql`. Validate on an isolated stack, compare the checksum and review the hosted dry run before the hosted development roll forward. Reverting configuration creates a new audited revision. Schema corrections use forward migrations. Hosted application deployment is tracked separately from database migration status.

## Remaining blockers

Track hosted application rollout separately and keep protected appeal paths available. Review retention under the existing privacy operations work before public launch.
