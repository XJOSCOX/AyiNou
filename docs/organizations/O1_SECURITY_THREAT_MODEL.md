# O1 security threat model and validation plan

Trust boundaries are the browser, Supabase Auth/session, Fastify, private SQL commands, reviewer workspaces and public projections. Signup parameters and metadata are user input. Server receipts prove a scoped event only. All checks below are acceptance criteria for future implementation using disposable, synthetic data.

| Threat | Proposed control | Required regression |
| --- | --- | --- |
| Invitation or age eligibility bypass | Future shared pre-auth gate and actor-bound redemption used by both paths and callback; eligibility enforced before protected access; codes remain referrals | Direct signup API, expired/reused invite, account switch, both paths and legacy account paths |
| Duplicate organizations | Suggest safe public matches; canonical unique handle and idempotent transaction; send probable impersonation to review | Simultaneous creates, same name/different legitimate handles, hidden match non-disclosure |
| False authority or registration | Separate claim, trusted registry finding and organizational verification; enforce reviewer assignment and evidence binding | Forged URI/reference, stale snapshot, status changes, informal group using blank registry ID |
| Founder badge impersonation or self-verification | Server-issued grant, distinct display, reserved badge UI and explicit issuer/subject inequality | Crafted profile or API data, founder self-target, bootstrap record and unauthorized issuer |
| Admin abuse and conflicted review | Recent MFA, action scope, independent approvals, expiry, audit and hold/revoke | Stale MFA, revoked assignment between votes, conflicts, collusion indicators, sole-admin constraints |
| Cross-organization access and escalation | Scope relational references to organization, live membership and delegated permissions; safe private projections | Swap org/role IDs, expired invitations, organization account switching, owner versus custom role |
| Improper project eligibility | Preserve reviewed-only project rules and independently approved publication | FV-only submit/publish denial and organization status revocation after submit |
| Poll manipulation | Derive voter from Auth subject; preserve scope gates, unique ballot and secret individual choices | Concurrent ballots, multiple managed organizations, verified ballot denial, owner/admin isolation |
| Incorrect conversion or deletion | Edit only intent; atomically recheck claims, roles, projects and holds | New dependency between preview and commit; protected correction leaves related rows intact |
| Account takeover and replay | Live session, recent MFA for sensitive commands, scoped proof expiry, one-time consumption, versioned receipts | Stolen or expired session, MFA factor removal, replay under different subject/body, concurrent grant/revoke |
| Sensitive evidence leak | Private scoped cases; avoid raw proof, health and beneficiary data; exclude evidence from logs and notices | Cross-subject reads, anonymous/role RLS checks, SSR/client and notification leaks, sign-out cache clearing |
| Privileged authority leakage | Separate review, platform, legal, privacy and organization authority domains | Sole admin cannot open confidential privacy records, publish drafts, inspect ballots or issue an IV grant |

Reuse Phase 5B impersonation report and restrictions patterns. Propose localized reasons for impersonation, false registration, misleading mandate, fraudulent project, unauthorized fundraising and unsafe conduct. Route to the appropriate assigned trust or project reviewer with bounded case references. Notify impacted members safely, apply scoped holds with a rationale and deadline, keep decisions and changes auditable and allow independent appeal. Pending reports alone do not award or publicly remove a badge. Show only substantiated restrictions or current verified provenance when public disclosure is authorized. Votes, likes, followers and donations never determine a Trusted badge. Avoid exposing reporter identity or private evidence through public status.

L3 synthetic-only privacy gates and scoped evidence remain independent. L6.2A requires recent MFA and database/immutable release evidence for publication. Organization setup, administration and partner enrollment confer no ability to switch either system on.
