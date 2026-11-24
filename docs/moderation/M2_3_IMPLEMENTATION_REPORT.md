# M2.3 Feature-specific restrictions and moderator delegation

## Scope

M2.3 adds independent restrictions for 25 capabilities across Feed and social activity, organization operations, events, communities and groups, projects and volunteering, and polls. Each decision applies to one member and capability within a platform or resource scope. A single confirmation can apply several independent decisions atomically.

## Data model and API

Private tables store the capability registry, restriction cases, moderator delegations, and decision events. The case records keep stable references and revision numbers. The command endpoint accepts an idempotency key, a written reason, and explicit confirmation. Reads return bounded summaries with a signed history cursor. PostgreSQL checks restrictions at transactional write boundaries shared by the API and native RPCs.

## Permissions and audit

Founder and Administrator decisions use the existing private administration workspace. A delegated Moderator uses a capability-only workspace bound to the original session. Both require recent MFA. Administrators can issue ordinary restrictions for up to 90 days. Delegated Moderators are limited to the assigned capability, scope and term, capped at seven days. Indefinite restrictions and the five management capabilities reserved for high-impact decisions require Founder authority. Protected leadership accounts and self-targeting are denied.

Decision events record the actor, authority, subject, scope, written reason, policy version, previous and current state, and original case. The Moderation Center and A1A expose safe summaries. Natural expiry uses a stable event reference projected from the recorded expiry time.

## Privacy and lifecycle

A member can review their own notices from Account access. Notices contain the activity, scope, reason category, date, status, case reference, and support information. Existing account-wide enforcement still controls sign-in eligibility. Resource ownership, published content, accepted roles, poll ballots and nominee replies use their existing lifecycle. Withdrawals, unfollows, reaction removals and recovery operations remain available through eligible native paths.

## Localization and accessibility

The staff workflow and member notices use Haitian Creole, French, English and Spanish. The forms use labels, fieldsets, keyboard-accessible controls, explicit confirmation, and responsive AyiNou surfaces. The restriction preview shows the capability selection, scope and term.

## Reliability and recovery

PostgreSQL time determines decision and expiry boundaries. Restriction writes and covered actions serialize per member. The issuer can revoke or update a delegation within their authority. Revocation or expiry ends future delegated action immediately. Restrictions issued while a grant was live keep their own effective term. Overlapping restrictions and renewal windows are checked for the same capability and intersecting scopes. Rolling back the web entry points leaves enforcement and its records in place. Database corrections should preserve the event history.

## Validation and CI

Local verification uses a disposable Supabase/PostgreSQL project and local Next.js and Fastify processes. The M2.3 suite exercises authorization, live database enforcement, expiry, overlap, audit visibility, and notices in four languages. M2.1 and M2.2 regression suites exercise existing moderation reads and account enforcement.

## Documentation and operations

The migration is `20261123133000_m23_feature_restrictions.sql`. Hosted rollout requires a dry run showing this exact migration, successful local checks, and approval for the linked project. Verify the migration history, protected roles, existing account state, and connected local application after applying it.

## Remaining blockers

Independent feature-restriction appeal adjudication belongs to M2.4. Until it is available, members receive existing support and account recovery options.
