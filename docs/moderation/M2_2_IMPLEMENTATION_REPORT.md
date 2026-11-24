# M2.2 · Account suspension, bans and reinstatement

## Scope

Private Platform Administration now supports time-limited account suspension, extension, reinstatement and Founder-only indefinite bans. Account Enforcement displays the active term, case and notice status. Active Restrictions and Moderation History include the same enforcement cases. The member-facing account access screen displays safe enforcement notices, a password recovery link, support instructions and sign-out. A dedicated enforcement appeal intake and adjudication are outside this phase.

## Data model and API

The existing Admin Accounts PATCH route sends typed enforcement commands to a service-only, workspace-bound RPC. The legacy status command is closed for all callers, including the recognized Founder. Role grants and revocations continue through the existing writer. The existing list endpoint returns effective status to older callers and requires a verified workspace to return new case and reason details. PostgreSQL stores one case per new enforcement decision, a separate application reauthentication fence and an append-only decision ledger. PostgreSQL derives a stable expiry history record from the case's persisted expiry event ID when the term ends.

| Authority | Effective policy |
| --- | --- |
| Founder | Recognized singleton Founder can suspend eligible ordinary accounts for 1 minute to 90 days, extend them to at most 90 days from the original start, issue an indefinite ban, and lift eligible temporary, new indefinite, or legacy indefinite actions. |
| Administrator | Can suspend for 1 minute to 90 days and revoke temporary suspensions. Extensions cannot pass 90 days from the original start. Another Administrator cannot create an overlapping account sanction. A new Administrator episode may start only after the prior suspension's original start plus 90 days and at least 24 hours after its effective end. This prevents chaining short terms or restarting the clock by lifting a term. |
| Moderator | Existing content authority continues. Account-wide suspension, bans and reinstatement require platform Administrator or Founder under the rules above. |
| Presets | 1, 24 and 72 hours, plus 7, 30 and 90 days. Custom input uses whole minutes. A policy day is exactly 24 hours. The start and end use the database clock. |

## Permissions and audit

Each new write rechecks verified TOTP, recent MFA, the original session-bound private Admin workspace, live role and target eligibility. Self-targets and protected Founder/Admin targets are excluded. The write joins the existing administrative role lock to serialize against changes in authority. Explicit confirmation, written reason, an optimistic revision and a request ID are required. Exact replay returns the original receipt. An attempt to reuse an ID with a different command is denied. Creation, extension, revocation, reinstatement, ban and ban lift record actor, authority, subject, workspace, case and before/after state. Existing A1A and M2.1 histories receive safe summaries and native case references. [Migration](../../supabase/migrations/20261123132000_m22_account_enforcement.sql)

## Privacy and lifecycle

The authenticated notice RPC derives the subject from the verified session. It returns the case reference, restriction type and safe category, dates and state, with a maximum of 20 new case records plus an applicable legacy notice. Reporter information, internal reasons and evidence stay out of this read. It respects the existing absolute session deadline and provider ban. A restricted member may authenticate again to access their notices. Password reset uses the existing secure recovery flow with a signed recent recovery context and existing MFA handling. Support is available through the established address. The screen explicitly states that independent account appeal intake is unavailable. No case details are placed in email or ordinary notifications.

## Localization and accessibility

Haitian Creole, French, English and Spanish cover the duration presets, action controls, written reason, confirmation, statuses, limits and member notices. The interface retains the private workspace navigation, form labels, keyboard controls, loading/error handling and existing theme styling.

## Reliability and recovery

The denial predicate compares the case expiration with trusted PostgreSQL time. At the exact end, the term becomes inactive. Sign-ins issued before or during the suspension fail the application session check after either expiration or reinstatement. A fresh provider sign-in then restores ordinary access if no other restriction or provider ban applies. Existing absolute deadlines, MFA checks and unrelated restrictions continue to apply. The application fence does not revoke all Supabase GoTrue refresh tokens. Already-issued external URLs keep their own native expiration rules.

Legacy rows are left unchanged during migration. They stay indefinite and gain no invented historical events. Founder-authorized legacy release preserves the previous state and original reason in the private audit and writes a fresh-authentication fence. Provider Auth bans are separate and remain active after a local release. Recovery prefers an application rollback with the migration retained and a reviewed forward fix. Removing database enforcement to allow an older status writer would bypass the approved policy.

## Validation and CI

Local verification passed 22 disposable browser and database scenarios, plus typecheck, lint, shared contracts, translations, engineering standards and production-mode API and web builds. The browser suite covers suspended-member recovery with MFA and regression checks for Founder, administration and A1A. No GitHub Actions workflow is invoked for routine testing. [Local scenarios](../../apps/web/e2e/account-enforcement.spec.ts)

## Documentation and operations

The roadmap, engineering review and audit inventory record M2.2. Hosted preflight must confirm project identity, exact release and migration, no unrelated pending versions and intact native data. Postflight must confirm the new grants, legacy writer boundary, existing sanctions and connected application reads.

## Remaining blockers

The approved migration `20261123132000_m22_account_enforcement` was applied to linked AyiNou project `hcbxulyfmdmuyccgrujs` from implementation commit `d4d82a5d40d01e38fb816eb47cffbc6ea6e0337e`. Postflight confirmed no pending migrations, preserved legacy and Founder verification history, verified RLS, service-only command execution, caller-bound notices and the closed legacy status writer. The rollout created no member sanctions. Local Fastify connected to the upgraded hosted database and passed read and authorization checks. The end-to-end browser workflows ran against disposable Supabase. Hosted application deployment remains a separate step. Independent account appeal intake and feature-specific restrictions are future work.

## Account access layout

The Account access route uses a dedicated status page with notices, restrictions, appeals, and help. It uses the existing session-bound notice reads. Members who can resume see a Dashboard link. Signed-out visitors see a sign-in link and help. Switching the layout leaves the protected-route redirects and the sign-in and registration forms intact. The local browser showed the current account status. A suspended member’s notice displays the member-visible reason category, the effective and expiration times with their local time zone, and a link to the appeal options. The appeal workspace retains the exact submission deadline and the written explanation form. No API or database rollout is required for the layout.
