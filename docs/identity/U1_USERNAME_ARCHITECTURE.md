# U1 public username architecture

The immutable Supabase Auth UUID identifies a member. `public.profiles.username` remains the only assigned handle and retains the existing PostgreSQL unique constraint. Display names remain Unicode text and may be shared by several people. U1 applies the stricter handle rules only on assignment or change, so deployed legacy rows need no rewrite.

## Data lifecycle

- `private.username_signup_leases` is a temporary hold for an Auth UUID and normalized handle, separate from public profile ownership. It expires after 24 hours. Availability treats expired rows as free even before bounded cleanup. Unconfirmed signups have no public username or discoverable profile.
- `private.username_retirements` retains names released by previously assigned accounts. A former owner may restore an otherwise eligible old handle. Other accounts cannot claim it. A deleted profile leaves a tombstone with no owner reference. A regular rename keeps the old profile URL usable under its original visibility and block checks. Staff safety corrections suppress that public alias.
- `private.username_safety_holds` stores manual holds on unassigned, unleased handles. The public projection does not reveal a hold or its rationale.
- `private.username_events` records reservation, expiration when collected, assignment, change, retirement and staff outcomes. Staff commands bind an authenticated actor, request UUID, normalized command hash, categorical reason and receipt. No raw identity documents, email, password, session or evidence appear in these records.

Profile changes and signup share the existing Founder reservation transaction lock. The unique profile constraint and the lease primary key remain final conflict controls. Auth insertion, referral attribution, organization intent and any username lease commit or roll back together. Email confirmation can promote only the lease bound to the same Auth UUID. Later Auth metadata changes cannot create or transfer a claim.

## Compatibility and maintenance

Canonical web profile URLs redirect through the visible profile projection. Following, discovery, feed, notifications, organization affiliations, verification and appeals continue to identify the account by UUID. User-entered staff targets and new invitations require the current handle. Poll nominations deliberately retain the name consented to for that ballot and may suppress a stale nomination as their existing policy specifies. Historical display labels and verification evidence are not rewritten.

Self-service renames use the existing live profile RPC and require another available handle. The form confirms the replacement, and PostgreSQL enforces a five-successful-change rolling daily limit. A 30-day product cooldown is proposed and needs a separate owner decision. Previously assigned handles cannot silently recycle to other accounts. Archive retention, former handle restoration policy and emergency support procedures should be reviewed before public launch.
